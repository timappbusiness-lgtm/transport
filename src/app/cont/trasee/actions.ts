'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { FILTERABLE_CATEGORIES, type CargoCategory, type ServiceType } from '@/lib/departures';
import {
  MAX_EVERY_N,
  ruleHasErrors,
  toIso,
  validateRule,
  type RecurrenceKind,
  type RecurrenceRule,
} from '@/lib/recurrence';

/**
 * The carrier's own departures.
 *
 * Same rule as the rest of the account area: the company comes from the
 * session, never from the form. Publishing is still the database's decision
 * — `guard_truck_listing_publish` refuses a suspended company or a vehicle
 * whose papers have lapsed, and says so in Romanian.
 */

export interface DepartureActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

type Direction = Database['public']['Enums']['truck_direction'];

async function requireCompany() {
  const context = await getAccountContext();
  if (!context) redirect(ROUTES.signIn);
  if (!context.activeCompany) redirect(ROUTES.accountCompanyCreate);
  return { context, company: context.activeCompany };
}

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? null : value;
}

/** "Viena, Budapesta" becomes two waypoints; blanks and duplicates go. */
function readWaypointsField(raw: string | null): { city: string }[] {
  if (raw === null) return [];
  const seen = new Set<string>();
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((city) => {
      if (city === '' || seen.has(city.toLowerCase())) return false;
      seen.add(city.toLowerCase());
      return true;
    })
    .slice(0, 8)
    .map((city) => ({ city }));
}

function readCategories(formData: FormData): CargoCategory[] {
  const values = formData.getAll('accepted_vehicle_types').map(String);
  return FILTERABLE_CATEGORIES.filter((category) => values.includes(category));
}

function readServices(formData: FormData): ServiceType[] {
  const values = formData.getAll('service_types').map(String);
  return (['pe_sens', 'expres', 'tractare'] as const).filter((service) =>
    values.includes(service),
  );
}

function isoDate(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Regula de repetare, citită din formular.
 *
 * Zilele vin ca `0`…`6`, ca `extract(dow)` în Postgres. Orice altceva
 * cade aici, nu în bază: un `weekdays` cu un `9` în el ar trece de
 * `route_series_rule_ck` și ar genera zero plecări, tăcut.
 */
function readRule(formData: FormData, startsOn: string): RecurrenceRule {
  const kind: RecurrenceKind =
    formData.get('recurrence_kind') === 'la_n_zile' ? 'la_n_zile' : 'saptamanal';

  const weekdays = [
    ...new Set(
      formData
        .getAll('weekdays')
        .map((value) => Number(String(value)))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);

  const rawN = text(formData, 'every_n_days');
  const everyNDays = rawN === null ? null : Number(rawN);

  return {
    kind,
    weekdays,
    everyNDays: kind === 'la_n_zile' ? everyNDays : null,
    startsOn,
    endsOn: isoDate(text(formData, 'ends_on')) ?? '',
  };
}

export async function createDepartureAction(
  _prev: DepartureActionState,
  formData: FormData,
): Promise<DepartureActionState> {
  const { context, company } = await requireCompany();

  const fieldErrors: Record<string, string> = {};
  const direction = String(formData.get('direction') ?? '') as Direction;
  const fromCity = text(formData, 'from_city');
  const toCity = text(formData, 'to_city');
  const availableFrom = isoDate(text(formData, 'available_from'));
  const availableTo = isoDate(text(formData, 'available_to'));
  const vehicleId = text(formData, 'vehicle_id');
  const categories = readCategories(formData);
  const services = readServices(formData);

  if (direction !== 'tur' && direction !== 'retur') fieldErrors.direction = 'Alege direcția.';
  if (fromCity === null) fieldErrors.from_city = 'Scrie orașul de plecare.';
  if (toCity === null) fieldErrors.to_city = 'Scrie orașul de sosire.';
  if (availableFrom === null) fieldErrors.available_from = 'Alege data de început.';
  if (availableTo !== null && availableFrom !== null && availableTo < availableFrom) {
    fieldErrors.available_to = 'Data de final este înaintea celei de început.';
  }
  if (vehicleId === null) fieldErrors.vehicle_id = 'Alege vehiculul.';
  if (categories.length === 0) {
    fieldErrors.accepted_vehicle_types = 'Alege cel puțin un tip de vehicul.';
  }
  if (services.length === 0) fieldErrors.service_types = 'Alege cel puțin un tip de serviciu.';

  const slotsRaw = text(formData, 'platform_slots_total');
  const slots = slotsRaw === null ? null : Number(slotsRaw);
  if (slots !== null && (!Number.isInteger(slots) || slots < 1 || slots > 12)) {
    fieldErrors.platform_slots_total = 'Numărul de locuri trebuie să fie între 1 și 12.';
  }

  const priceRaw = text(formData, 'price_indicative');
  const price = priceRaw === null ? null : Number(priceRaw.replace(',', '.'));
  if (price !== null && (!Number.isFinite(price) || price <= 0)) {
    fieldErrors.price_indicative = 'Prețul trebuie să fie un număr pozitiv.';
  }

  const detourRaw = text(formData, 'max_detour_km');
  const detour = detourRaw === null ? 50 : Number(detourRaw);
  if (!Number.isInteger(detour) || detour < 0 || detour > 1000) {
    fieldErrors.max_detour_km = 'Ocolul acceptat trebuie să fie între 0 și 1000 km.';
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // „Se repetă" bifat înseamnă altceva: nu o plecare, ci o serie care
  // le publică singură. Regula se verifică aici doar cât să spună o
  // propoziție citibilă; `create_route_series()` o verifică din nou,
  // împreună cu firma și vehiculul, și acolo este regula.
  const repeats = formData.get('repeats') === 'da';
  const supabase = await createClient();

  if (repeats) {
    const rule = readRule(formData, availableFrom as string);
    if (rule.endsOn === '') {
      return { fieldErrors: { ends_on: 'Alege până când se repetă.' } };
    }

    const ruleErrors = validateRule(rule, toIso(Date.now()));
    if (ruleHasErrors(ruleErrors)) {
      const asFields: Record<string, string> = {};
      if (ruleErrors.weekdays) asFields.weekdays = ruleErrors.weekdays;
      if (ruleErrors.everyNDays) asFields.every_n_days = ruleErrors.everyNDays;
      if (ruleErrors.endsOn) asFields.ends_on = ruleErrors.endsOn;
      return { fieldErrors: asFields };
    }

    const { error: seriesError } = await supabase.rpc('create_route_series', {
      p_vehicle_id: vehicleId as string,
      p_direction: direction,
      p_from_country: text(formData, 'from_country') ?? 'RO',
      p_from_county: text(formData, 'from_county'),
      p_from_city: fromCity as string,
      p_to_country: text(formData, 'to_country') ?? 'RO',
      p_to_county: text(formData, 'to_county'),
      p_to_city: toCity as string,
      p_kind: rule.kind,
      p_weekdays: rule.weekdays,
      p_every_n_days: rule.everyNDays === null ? null : Math.min(rule.everyNDays, MAX_EVERY_N),
      p_starts_on: rule.startsOn,
      p_ends_on: rule.endsOn,
      p_waypoints: readWaypointsField(text(formData, 'waypoints')),
      p_max_detour_km: detour,
      p_platform_slots_total: slots,
      p_service_types: services,
      p_accepted_vehicle_types: categories,
      p_price_indicative: price,
      p_notes: text(formData, 'notes'),
    });

    if (seriesError) return { error: toAppError(seriesError, 'series.create').message };

    revalidatePath(ROUTES.accountDepartures);
    revalidatePath(ROUTES.routes);
    redirect(ROUTES.accountDepartures);
  }

  const publish = formData.get('intent') === 'publish';
  const { data, error } = await supabase
    .from('truck_listings')
    .insert({
      company_id: company.id,
      vehicle_id: vehicleId,
      posted_by: context.user.id,
      direction,
      from_country: text(formData, 'from_country') ?? 'RO',
      from_county: text(formData, 'from_county'),
      from_city: fromCity,
      to_country: text(formData, 'to_country') ?? 'RO',
      to_county: text(formData, 'to_county'),
      to_city: toCity,
      waypoints: readWaypointsField(text(formData, 'waypoints')),
      max_detour_km: detour,
      available_from: availableFrom,
      available_to: availableTo,
      platform_slots_total: slots,
      service_types: services,
      accepted_vehicle_types: categories,
      price_indicative: price,
      notes: text(formData, 'notes'),
      status: publish ? 'active' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error || !data) {
    // guard_truck_listing_publish and the plan quota both raise written
    // Romanian messages saying what to fix; they are shown as they are.
    return { error: toAppError(error, 'departures.create').message };
  }

  revalidatePath(ROUTES.accountDepartures);
  revalidatePath(ROUTES.routes);
  redirect(ROUTES.accountDepartures);
}

/** Take a departure off the board. The row stays; only its status changes. */
export async function stopDepartureAction(formData: FormData): Promise<void> {
  const { company } = await requireCompany();
  const id = String(formData.get('departure_id') ?? '');

  const supabase = await createClient();
  const { error } = await supabase
    .from('truck_listings')
    .update({ status: 'expired' })
    .eq('id', id)
    .eq('company_id', company.id);

  if (error) console.error('[departures.stop]', toAppError(error, 'departures.stop').message);

  revalidatePath(ROUTES.accountDepartures);
  revalidatePath(ROUTES.routes);
}

/**
 * Duplicate a departure as its return leg.
 *
 * The single most common thing a carrier does next: they drove there, now
 * they are coming back. Cities swap, the direction flips, and it lands as a
 * draft so the dates get a look before it goes on the board.
 */
export async function duplicateAsReturnAction(formData: FormData): Promise<void> {
  const { context, company } = await requireCompany();
  const id = String(formData.get('departure_id') ?? '');

  const supabase = await createClient();
  const { data: source } = await supabase
    .from('truck_listings')
    .select('*')
    .eq('id', id)
    .eq('company_id', company.id)
    .maybeSingle();

  if (!source) redirect(ROUTES.accountDepartures);

  const row = source as Record<string, unknown>;
  await supabase
    .from('truck_listings')
    .insert({
      company_id: company.id,
      vehicle_id: row.vehicle_id as string,
      posted_by: context.user.id,
      direction: row.direction === 'tur' ? 'retur' : 'tur',
      from_country: row.to_country as string,
      from_county: row.to_county as string | null,
      from_city: row.to_city as string,
      to_country: row.from_country as string,
      to_county: row.from_county as string | null,
      to_city: row.from_city as string,
      // The stops are the same road in reverse.
      waypoints: Array.isArray(row.waypoints) ? [...row.waypoints].reverse() : [],
      max_detour_km: row.max_detour_km as number,
      available_from: row.available_to ?? row.available_from,
      available_to: null,
      platform_slots_total: row.platform_slots_total as number | null,
      service_types: row.service_types as ServiceType[],
      accepted_vehicle_types: row.accepted_vehicle_types as CargoCategory[],
      price_indicative: row.price_indicative as number | null,
      status: 'draft',
    });

  revalidatePath(ROUTES.accountDepartures);
  redirect(ROUTES.accountDepartures);
}

/**
 * Answer a reservation.
 *
 * Confirming goes through `confirm_departure_booking`, which checks the
 * caller owns the departure, holds the listing lock, and creates the order
 * through the shared `create_order` — the same path an accepted offer
 * takes, so an order always looks the same however it was reached.
 */
export async function answerBookingAction(
  _prev: DepartureActionState,
  formData: FormData,
): Promise<DepartureActionState> {
  await requireCompany();
  const bookingId = String(formData.get('booking_id') ?? '');
  const accept = formData.get('decision') === 'confirm';

  const supabase = await createClient();

  if (accept) {
    const { error } = await supabase.rpc('confirm_departure_booking', {
      p_booking_id: bookingId,
    });
    if (error) return { error: toAppError(error, 'departures.confirmBooking').message };
    revalidatePath(ROUTES.accountDepartures);
    return { notice: departuresCopy.mine.confirmed };
  }

  const { error } = await supabase
    .from('departure_bookings')
    .update({ status: 'cancelled' })
    .eq('id', bookingId);

  if (error) return { error: toAppError(error, 'departures.rejectBooking').message };
  revalidatePath(ROUTES.accountDepartures);
  return { notice: departuresCopy.mine.rejected };
}
