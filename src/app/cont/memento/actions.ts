'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES, mementoVehicleRoute } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { getAccountContext, redirectToSignIn, type AccountContext } from '@/lib/auth/account';
import { deleteServerDraft } from '@/lib/continuity/server-drafts';
import { toAppError } from '@/lib/errors';
import {
  isIsoDay,
  isMementoKind,
  isPlate,
  MEMENTO_KINDS,
  mementoLabel,
  normalisePlate,
  parseReminderDays,
  VEHICLE_KINDS,
  type MementoKind,
} from '@/lib/memento';
import { CSV_KINDS, type CsvRow } from '@/lib/memento-csv';
import { canManageFleet } from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/uploads/paths';

/**
 * Every change to the memento, as server actions.
 *
 * Each one goes through a `memento_*` function in the database, which
 * checks the caller, the scope, the limits and the rate — the checks here
 * only spare a round trip. None of them touches `documents` or `vehicles`:
 * a memento is a date somebody wrote down, kept apart from everything the
 * platform verifies.
 */

export interface MementoState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

export interface MementoVehicleState extends MementoState {
  /** The vehicle just saved: the form empties for the next one. */
  created?: { id: string; plate: string };
}

const c = mementoCopy;

async function requireContext(target: string): Promise<AccountContext> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(target);
  return context;
}

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? null : value;
}

/** A date from an `<input type="date">`, within the years a document runs. */
function day(raw: string | null): string | null | 'invalid' {
  if (raw === null) return null;
  if (!isIsoDay(raw) || raw < '2000-01-01' || raw > '2100-01-01') return 'invalid';
  return raw;
}

function km(raw: string | null): number | null | 'invalid' {
  if (raw === null) return null;
  const value = Number(raw.replace(/[\s.]/g, ''));
  return Number.isInteger(value) && value > 0 && value <= 3_000_000 ? value : 'invalid';
}

/** Null for an RPC parameter the generated types call a string. */
const NULL = null as unknown as string;

/** The firm whose fleet the form wrote to, or null for the person's own. */
function companyFor(context: AccountContext, scope: string | null): string | null {
  if (scope === 'firma' && canManageFleet(context)) return context.activeCompany!.id;
  return null;
}

function listPath(companyId: string | null): string {
  return companyId === null ? `${ROUTES.accountMemento}?vedere=personal` : ROUTES.accountMemento;
}

function revalidateMemento(vehicleId?: string) {
  revalidatePath(ROUTES.accountMemento);
  revalidatePath(ROUTES.account);
  if (vehicleId) revalidatePath(mementoVehicleRoute(vehicleId));
}

interface EntryInput {
  kind: MementoKind;
  validUntil: string | null;
  customName: string | null;
  dueKm: number | null;
}

/**
 * The dates a vehicle form carries: `date_rca`, `date_itp`… plus the
 * kilometres of a service and the name of „Altceva".
 */
function readEntries(formData: FormData): { entries: EntryInput[]; fieldErrors: Record<string, string> } {
  const entries: EntryInput[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const kind of MEMENTO_KINDS) {
    const date = day(text(formData, `date_${kind}`));
    const dueKm = kind === 'revizie' ? km(text(formData, 'km_revizie')) : null;
    const customName = kind === 'altceva' ? text(formData, 'name_altceva') : null;
    if (date === 'invalid') {
      fieldErrors[`date_${kind}`] = 'Data nu pare corectă.';
      continue;
    }
    if (dueKm === 'invalid') {
      fieldErrors.km_revizie = 'Scrie kilometrii ca număr întreg.';
      continue;
    }
    if (date === null && dueKm === null) continue;
    if (kind === 'altceva' && (customName === null || customName.length < 2)) {
      fieldErrors.name_altceva = 'Scrie ce document este.';
      continue;
    }
    entries.push({ kind, validUntil: date, customName, dueKm });
  }
  return { entries, fieldErrors };
}

async function saveEntries(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleId: string,
  entries: readonly EntryInput[],
): Promise<string | null> {
  for (const entry of entries) {
    const { error } = await supabase.rpc('memento_save_entry', {
      p_vehicle_id: vehicleId,
      p_kind: entry.kind,
      p_valid_until: entry.validUntil ?? NULL,
      p_custom_name: entry.customName ?? undefined,
      p_due_km: entry.dueKm ?? undefined,
    });
    if (error) return `${mementoLabel(entry.kind, entry.customName)}: ${toAppError(error, 'memento.saveEntry').message}`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

/**
 * A vehicle and its dates, in one form. Idempotent on the id the device
 * chose: sent twice, the second finds the first.
 */
export async function saveMementoVehicleAction(
  _prev: MementoVehicleState,
  formData: FormData,
): Promise<MementoVehicleState> {
  const context = await requireContext(ROUTES.accountMementoAdd);
  const rawPlate = text(formData, 'plate') ?? '';
  const id = text(formData, 'id');
  const vehicleKind = text(formData, 'vehicle_kind');
  const fieldErrors: Record<string, string> = {};
  if (!isPlate(rawPlate)) fieldErrors.plate = c.landing.needPlate;
  if (!isUuid(id)) return { error: 'Formularul nu are un identificator. Reîncarcă pagina.' };
  if (vehicleKind !== null && !(VEHICLE_KINDS as readonly string[]).includes(vehicleKind)) {
    fieldErrors.vehicle_kind = 'Alege din listă.';
  }
  const read = readEntries(formData);
  Object.assign(fieldErrors, read.fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const companyId = companyFor(context, text(formData, 'scope'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('memento_save_vehicle', {
    p_id: id,
    p_company_id: companyId ?? NULL,
    p_plate: rawPlate,
    p_make: text(formData, 'make') ?? undefined,
    p_model: text(formData, 'model') ?? undefined,
    p_vehicle_kind: vehicleKind ?? undefined,
  });
  if (error) {
    const message = toAppError(error, 'memento.saveVehicle').message;
    return error.code === '23505' ? { fieldErrors: { plate: message } } : { error: message };
  }

  const failed = await saveEntries(supabase, id, read.entries);
  revalidateMemento(id);
  // The vehicle is there even when a date was refused: sent again, the
  // form finds it by its id and tries the dates once more.
  if (failed !== null) return { error: failed };

  await deleteServerDraft(context.user.id, 'memento', 'adauga');
  const plate = normalisePlate(rawPlate);
  return { created: { id, plate }, notice: `${plate} a fost adăugat în memento.` };
}

/** Plate, make, model and kind of a vehicle already there. */
export async function updateMementoVehicleAction(_prev: MementoState, formData: FormData): Promise<MementoState> {
  const context = await requireContext(ROUTES.accountMemento);
  const id = text(formData, 'id');
  const rawPlate = text(formData, 'plate') ?? '';
  if (!isUuid(id)) return { error: c.vehicle.notFound };
  if (!isPlate(rawPlate)) return { fieldErrors: { plate: c.landing.needPlate } };
  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from('memento_vehicles')
    .select('owner_company_id')
    .eq('id', id)
    .maybeSingle();
  if (!vehicle) return { error: c.vehicle.notFound };
  const { error } = await supabase.rpc('memento_save_vehicle', {
    p_id: id,
    p_company_id: (vehicle as { owner_company_id: string | null }).owner_company_id ?? NULL,
    p_plate: rawPlate,
    p_make: text(formData, 'make') ?? undefined,
    p_model: text(formData, 'model') ?? undefined,
    p_vehicle_kind: text(formData, 'vehicle_kind') ?? undefined,
  });
  void context;
  if (error) return { error: toAppError(error, 'memento.updateVehicle').message };
  revalidateMemento(id);
  return { notice: c.vehicle.saved };
}

/** The vehicle, its dates and its photos, gone. */
export async function deleteMementoVehicleAction(formData: FormData): Promise<void> {
  await requireContext(ROUTES.accountMemento);
  const id = text(formData, 'id');
  if (!isUuid(id)) redirect(ROUTES.accountMemento);
  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from('memento_vehicles')
    .select('owner_company_id')
    .eq('id', id)
    .maybeSingle();
  const { data: paths, error } = await supabase.rpc('memento_delete_vehicle', { p_id: id });
  if (error) throw new Error(toAppError(error, 'memento.deleteVehicle').message);
  await removePhotos(supabase, (paths as string[] | null) ?? []);
  revalidateMemento();
  redirect(listPath((vehicle as { owner_company_id: string | null } | null)?.owner_company_id ?? null));
}

/** Who in the firm receives this vehicle's reminders. */
export async function setMementoResponsibleAction(_prev: MementoState, formData: FormData): Promise<MementoState> {
  await requireContext(ROUTES.accountMemento);
  const vehicleId = text(formData, 'vehicle_id');
  const userId = text(formData, 'responsible');
  if (!isUuid(vehicleId) || (userId !== null && !isUuid(userId))) return { error: c.vehicle.notFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc('memento_set_responsible', {
    p_vehicle_id: vehicleId,
    p_user_id: userId ?? NULL,
  });
  if (error) return { error: toAppError(error, 'memento.setResponsible').message };
  revalidateMemento(vehicleId);
  return { notice: c.vehicle.saved };
}

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------

/** A new date, or a correction of the one there — not a renewal. */
export async function saveMementoEntryAction(_prev: MementoState, formData: FormData): Promise<MementoState> {
  await requireContext(ROUTES.accountMemento);
  const vehicleId = text(formData, 'vehicle_id');
  const entryId = text(formData, 'entry_id');
  const kind = text(formData, 'kind');
  if (!isUuid(vehicleId) || !isMementoKind(kind) || (entryId !== null && !isUuid(entryId))) {
    return { error: c.vehicle.notFound };
  }
  const date = day(text(formData, 'valid_until'));
  const dueKm = kind === 'revizie' ? km(text(formData, 'due_km')) : null;
  const customName = kind === 'altceva' ? text(formData, 'custom_name') : null;
  const photoPath = text(formData, 'photo_path');
  const fieldErrors: Record<string, string> = {};
  if (date === 'invalid') fieldErrors.valid_until = 'Data nu pare corectă.';
  if (dueKm === 'invalid') fieldErrors.due_km = 'Scrie kilometrii ca număr întreg.';
  if (date === null && dueKm === null) fieldErrors.valid_until = 'Scrie data până la care este valabil.';
  if (kind === 'altceva' && (customName === null || customName.length < 2)) fieldErrors.custom_name = 'Scrie ce document este.';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('memento_save_entry', {
    p_vehicle_id: vehicleId,
    p_kind: kind,
    p_valid_until: (date as string | null) ?? NULL,
    p_custom_name: customName ?? undefined,
    p_due_km: (dueKm as number | null) ?? undefined,
    p_reference: text(formData, 'reference') ?? undefined,
    p_note: text(formData, 'note') ?? undefined,
    p_photo_path: photoPath ?? undefined,
    p_entry_id: entryId ?? undefined,
  });
  if (error) return { error: toAppError(error, 'memento.saveEntry').message };
  revalidateMemento(vehicleId);
  return { notice: c.vehicle.saved };
}

/**
 * „Am reînnoit": the new date; the old one goes to the history. The
 * person a firm made responsible for the vehicle may do this too.
 */
export async function renewMementoAction(_prev: MementoState, formData: FormData): Promise<MementoState> {
  await requireContext(ROUTES.accountMemento);
  const entryId = text(formData, 'entry_id');
  if (!isUuid(entryId)) return { error: c.vehicle.notFound };
  const date = day(text(formData, 'valid_until'));
  const dueKm = km(text(formData, 'due_km'));
  if (date === 'invalid') return { fieldErrors: { valid_until: 'Data nu pare corectă.' } };
  if (dueKm === 'invalid') return { fieldErrors: { due_km: 'Scrie kilometrii ca număr întreg.' } };
  if (date === null && dueKm === null) return { fieldErrors: { valid_until: c.renew.needDate } };

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('memento_entries')
    .select('vehicle_id, kind, custom_name')
    .eq('id', entryId)
    .maybeSingle();
  const { error } = await supabase.rpc('memento_renew', {
    p_entry_id: entryId,
    p_valid_until: (date as string | null) ?? NULL,
    p_due_km: (dueKm as number | null) ?? undefined,
    p_reference: text(formData, 'reference') ?? undefined,
    p_photo_path: text(formData, 'photo_path') ?? undefined,
  });
  if (error) return { error: toAppError(error, 'memento.renew').message };
  const row = entry as { vehicle_id: string; kind: string; custom_name: string | null } | null;
  revalidateMemento(row?.vehicle_id);
  const label = row && isMementoKind(row.kind) ? mementoLabel(row.kind, row.custom_name) : 'Documentul';
  return { notice: c.renew.done(label, date === null ? `${dueKm} km` : formatDayRo(date)) };
}

function formatDayRo(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

export async function deleteMementoEntryAction(formData: FormData): Promise<void> {
  await requireContext(ROUTES.accountMemento);
  const entryId = text(formData, 'entry_id');
  const vehicleId = text(formData, 'vehicle_id');
  if (!isUuid(entryId)) return;
  const supabase = await createClient();
  const { data: paths, error } = await supabase.rpc('memento_delete_entry', { p_entry_id: entryId });
  if (error) throw new Error(toAppError(error, 'memento.deleteEntry').message);
  await removePhotos(supabase, (paths as string[] | null) ?? []);
  revalidateMemento(vehicleId ?? undefined);
}

async function removePhotos(supabase: Awaited<ReturnType<typeof createClient>>, paths: readonly string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('memento').remove(paths as string[]);
  // The rows are gone; an object left behind is found by the deletion job
  // with the account. Logged, not shown: nothing for the person to do.
  if (error) console.error('[memento] photo removal failed', { message: error.message });
}

// ---------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------

export interface MementoImportResult {
  ok: boolean;
  error?: string;
  added?: number;
  updated?: number;
  dates?: number;
}

/**
 * Rows the browser has already read and checked line by line. The
 * database checks them again and imports all of them or none.
 */
export async function importMementoAction(scope: 'personal' | 'firma', rows: readonly CsvRow[]): Promise<MementoImportResult> {
  const context = await requireContext(ROUTES.accountMementoImport);
  const companyId = companyFor(context, scope);
  const clean = rows.slice(0, 5000).map((row) => ({
    line: Number.isInteger(row.line) ? row.line : 0,
    plate: String(row.plate ?? ''),
    make: row.make ?? null,
    model: row.model ?? null,
    dates: Object.fromEntries(
      Object.entries(row.dates ?? {}).filter(([kind, value]) => (CSV_KINDS as readonly string[]).includes(kind) && typeof value === 'string'),
    ),
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('memento_import', {
    p_company_id: companyId ?? NULL,
    p_rows: clean,
  });
  if (error) return { ok: false, error: toAppError(error, 'memento.import').message };
  const result = (data ?? {}) as { vehicles_added?: number; vehicles_updated?: number; dates_saved?: number };
  revalidateMemento();
  return {
    ok: true,
    added: result.vehicles_added ?? 0,
    updated: result.vehicles_updated ?? 0,
    dates: result.dates_saved ?? 0,
  };
}

// ---------------------------------------------------------------------
// The days before
// ---------------------------------------------------------------------

export async function saveMementoScheduleAction(_prev: MementoState, formData: FormData): Promise<MementoState> {
  const context = await requireContext(ROUTES.accountMementoSettings);
  const companyId = companyFor(context, text(formData, 'scope'));
  const kind = text(formData, 'kind');
  if (kind !== '*' && !isMementoKind(kind)) return { error: 'Tipul documentului nu este pe listă.' };
  const reset = formData.get('reset') !== null;
  const days = reset ? null : parseReminderDays(text(formData, 'days') ?? '');
  if (!reset && days === null) return { fieldErrors: { days: c.schedule.invalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('memento_set_schedule', {
    p_company_id: companyId ?? NULL,
    p_kind: kind,
    p_days: days ?? (null as unknown as number[]),
  });
  if (error) return { error: toAppError(error, 'memento.schedule').message };
  revalidatePath(ROUTES.accountMementoSettings);
  return { notice: c.schedule.saved };
}

// ---------------------------------------------------------------------
// The photo, read
// ---------------------------------------------------------------------

export type MementoPhotoReading =
  | { status: 'read'; validUntil: string | null; reference: string | null }
  | { status: 'unreadable' }
  | { status: 'unavailable'; message?: string };

/**
 * Proposes the date on a photo the person just uploaded. Nothing is
 * saved: the date goes into the form, where they confirm or correct it.
 * Without the reading function configured — no key, no deployment — the
 * answer is „unavailable" and the form is the manual one it always was.
 */
export async function readMementoPhotoAction(path: string, kind: string): Promise<MementoPhotoReading> {
  const context = await requireContext(ROUTES.accountMemento);
  if (!isMementoKind(kind)) return { status: 'unavailable' };
  const folder = path.split('/')[0] ?? '';
  const allowed = folder === context.user.id || context.memberships.some((m) => m.company.id === folder);
  if (!allowed || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path)) return { status: 'unavailable' };

  // The function claims the reading against the daily limit itself, with
  // this session's token: the limit holds whoever calls it.
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke('parse-document', {
    body: { mode: 'memento', file_path: path, kind },
  });
  if (error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response && response.status === 422) return { status: 'unreadable' };
    if (response instanceof Response && response.status === 429) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      // The database's own sentence, in Romanian, when it is one.
      const message = typeof body?.error === 'string' && /[ăâîșț]/i.test(body.error) ? body.error : undefined;
      return message ? { status: 'unavailable', message } : { status: 'unavailable' };
    }
    return { status: 'unavailable' };
  }
  const body = (data ?? {}) as { ok?: boolean; extracted?: { valid_until?: unknown; document_number?: unknown } };
  if (body.ok !== true || !body.extracted) return { status: 'unavailable' };
  const validUntil = typeof body.extracted.valid_until === 'string' && isIsoDay(body.extracted.valid_until) ? body.extracted.valid_until : null;
  const reference = typeof body.extracted.document_number === 'string' ? body.extracted.document_number.slice(0, 60) : null;
  return { status: 'read', validUntil, reference };
}
