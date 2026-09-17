'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { pricesCopy } from '@/content/preturi';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { VEHICLE_CLASS_ORDER, type VehicleClass } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';

/**
 * Staff actions for the indicative prices.
 *
 * Nothing here decides anything. `set_price_rate`, `set_price_settings` and
 * `set_prices_published` are SECURITY DEFINER, check staff membership
 * themselves and write the before/after pair to `audit_log` — there is no
 * table grant that would let these actions write a rate directly even if
 * they tried. What this file does is read a form, refuse obvious nonsense
 * with a message pointing at the field, and show whatever the database says.
 */

const c = pricesCopy.admin;

export interface PriceActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

/** Cheap courtesy check. The RPC is the one that actually refuses. */
async function isStaff(): Promise<boolean> {
  const context = await getAccountContext();
  return context?.isStaff === true;
}

/** Every screen that shows a rate, so a save is visible everywhere at once. */
function revalidatePrices() {
  revalidatePath(ROUTES.adminPrices);
  revalidatePath(ROUTES.prices);
  revalidatePath(ROUTES.home);
}

/** "5,40" and "5.40" are the same number to a Romanian keyboard. */
function decimal(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim().replace(',', '.');
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** A rate or a minimum: anything at or below zero is not one. */
function positive(formData: FormData, name: string): number | null {
  const value = decimal(formData, name);
  return value !== null && value > 0 ? value : null;
}

/** A setting with a range the column's CHECK also enforces. */
function bounded(formData: FormData, name: string, min: number, max: number): number | null {
  const value = decimal(formData, name);
  return value !== null && value >= min && value <= max ? value : null;
}

export async function setPriceRateAction(
  _prev: PriceActionState,
  formData: FormData,
): Promise<PriceActionState> {
  if (!(await isStaff())) return { error: c.noAccess };

  const vehicleClass = String(formData.get('vehicle_class') ?? '');
  if (!VEHICLE_CLASS_ORDER.includes(vehicleClass as VehicleClass)) {
    return { error: c.rates.invalidClass };
  }

  const weightLabel = String(formData.get('weight_label') ?? '').trim();
  const local = positive(formData, 'local_ron_per_km');
  const national = positive(formData, 'national_ron_per_km');
  const international = positive(formData, 'international_eur_per_km');
  const minimumRon = positive(formData, 'minimum_ron');
  const minimumEur = positive(formData, 'minimum_eur');

  const fieldErrors: Record<string, string> = {};
  if (weightLabel === '') fieldErrors.weight_label = c.rates.invalidLabel;
  if (local === null) fieldErrors.local_ron_per_km = c.rates.invalidNumber;
  if (national === null) fieldErrors.national_ron_per_km = c.rates.invalidNumber;
  if (international === null) fieldErrors.international_eur_per_km = c.rates.invalidNumber;
  if (minimumRon === null) fieldErrors.minimum_ron = c.rates.invalidNumber;
  if (minimumEur === null) fieldErrors.minimum_eur = c.rates.invalidNumber;

  if (
    local === null ||
    national === null ||
    international === null ||
    minimumRon === null ||
    minimumEur === null ||
    weightLabel === ''
  ) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_price_rate', {
    p_vehicle_class: vehicleClass as VehicleClass,
    p_weight_label: weightLabel,
    p_local_ron_per_km: local,
    p_national_ron_per_km: national,
    p_international_eur_per_km: international,
    p_minimum_ron: minimumRon,
    p_minimum_eur: minimumEur,
  });

  if (error) return { error: toAppError(error, 'admin.setPriceRate').message };

  revalidatePrices();
  return { notice: c.rates.saved };
}

export async function setPriceSettingsAction(
  _prev: PriceActionState,
  formData: FormData,
): Promise<PriceActionState> {
  if (!(await isStaff())) return { error: c.noAccess };

  const notRunning = bounded(formData, 'not_running_surcharge_pct', 0, 200);
  const express = bounded(formData, 'express_surcharge_pct', 0, 200);
  const factor = bounded(formData, 'road_distance_factor', 1, 3);
  const spread = bounded(formData, 'range_spread_pct', 0, 100);
  // <input type="month"> submits "2026-03"; the column is a date.
  const month = String(formData.get('valid_month') ?? '').trim();
  const monthValid = /^\d{4}-\d{2}$/.test(month);

  const fieldErrors: Record<string, string> = {};
  if (notRunning === null) fieldErrors.not_running_surcharge_pct = c.settings.invalidPercent;
  if (express === null) fieldErrors.express_surcharge_pct = c.settings.invalidPercent;
  if (factor === null) fieldErrors.road_distance_factor = c.settings.invalidFactor;
  if (spread === null) fieldErrors.range_spread_pct = c.settings.invalidSpread;
  if (!monthValid) fieldErrors.valid_month = c.settings.invalidMonth;

  if (
    notRunning === null ||
    express === null ||
    factor === null ||
    spread === null ||
    !monthValid
  ) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_price_settings', {
    p_not_running_surcharge_pct: Math.round(notRunning),
    p_express_surcharge_pct: Math.round(express),
    p_road_distance_factor: factor,
    p_range_spread_pct: Math.round(spread),
    p_valid_month: `${month}-01`,
  });

  if (error) return { error: toAppError(error, 'admin.setPriceSettings').message };

  revalidatePrices();
  return { notice: c.settings.saved };
}

/**
 * Publishing, and taking it back.
 *
 * Its own action and its own RPC, because it is the moment the figures stop
 * being ours and become a claim the site makes. The audit row records who
 * made it.
 */
export async function setPricesPublishedAction(
  _prev: PriceActionState,
  formData: FormData,
): Promise<PriceActionState> {
  if (!(await isStaff())) return { error: c.noAccess };

  const published = String(formData.get('published') ?? '') === 'da';

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_prices_published', { p_published: published });

  if (error) return { error: toAppError(error, 'admin.setPricesPublished').message };

  revalidatePrices();
  return { notice: published ? c.statusPublished : c.statusDraft };
}
