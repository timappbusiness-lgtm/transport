import 'server-only';

import type { AccountContext } from '@/lib/auth/account';
import { isMementoKind, type MementoKind, type MementoVehicleKind } from '@/lib/memento';
import type { createClient } from '@/lib/supabase/server';

/**
 * What the memento screens read, and from where.
 *
 * Only the `memento_*` tables, through the caller's own session: RLS
 * decides who sees which vehicle (the owner, a firm's operators, the
 * person responsible for it, staff read-only). Nothing here reads
 * `documents` or `vehicles` — the verified record and the memento never
 * meet, not even on a screen.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface MementoEntry {
  id: string;
  vehicleId: string;
  kind: MementoKind;
  customName: string | null;
  validUntil: string | null;
  dueKm: number | null;
  reference: string | null;
  note: string | null;
  photoPath: string | null;
  dateSetOn: string;
}

export interface MementoVehicle {
  id: string;
  ownerUserId: string | null;
  ownerCompanyId: string | null;
  plate: string;
  make: string | null;
  model: string | null;
  vehicleKind: MementoVehicleKind | null;
  responsibleUserId: string | null;
  entries: MementoEntry[];
}

export interface MementoHistoryRow {
  id: string;
  entryId: string;
  validUntil: string | null;
  dueKm: number | null;
  renewedAt: string;
}

/** Where the list is: the person's own vehicles, or a firm's fleet. */
export type MementoScope =
  | { kind: 'personal' }
  | { kind: 'firma'; companyId: string; companyName: string; isCarrier: boolean };

const OPERATOR_ROLES = new Set(['owner', 'admin', 'dispatcher']);

/** A firm's fleet is open to its owner, admins and dispatchers; a driver sees only what is theirs. */
export function canManageFleet(context: AccountContext): boolean {
  return context.activeCompany !== null && OPERATOR_ROLES.has(context.activeRole ?? '');
}

/**
 * The scope a page shows. `?vedere=personal` or `?vedere=firma`; without
 * it, a firm's operator lands on the fleet and everybody else on their
 * own vehicles.
 */
export function mementoScope(context: AccountContext, requested: string | undefined): MementoScope {
  const company = context.activeCompany;
  if (company !== null && canManageFleet(context) && requested !== 'personal') {
    return {
      kind: 'firma',
      companyId: company.id,
      companyName: company.display_name ?? company.legal_name,
      isCarrier: company.company_type === 'transport' || company.company_type === 'both',
    };
  }
  return { kind: 'personal' };
}

const ENTRY_COLUMNS = 'id, vehicle_id, kind, custom_name, valid_until, due_km, reference, note, photo_path, date_set_on';
const VEHICLE_COLUMNS = `id, owner_user_id, owner_company_id, plate, make, model, vehicle_kind, responsible_user_id, memento_entries(${ENTRY_COLUMNS})`;

interface EntryRecord {
  id: string;
  vehicle_id: string;
  kind: string;
  custom_name: string | null;
  valid_until: string | null;
  due_km: number | null;
  reference: string | null;
  note: string | null;
  photo_path: string | null;
  date_set_on: string;
}

interface VehicleRecord {
  id: string;
  owner_user_id: string | null;
  owner_company_id: string | null;
  plate: string;
  make: string | null;
  model: string | null;
  vehicle_kind: string | null;
  responsible_user_id: string | null;
  memento_entries: EntryRecord[] | null;
}

const KIND_ORDER: readonly string[] = ['rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala', 'extinctor', 'revizie', 'altceva'];

function toEntry(row: EntryRecord): MementoEntry | null {
  if (!isMementoKind(row.kind)) return null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    customName: row.custom_name,
    validUntil: row.valid_until,
    dueKm: row.due_km,
    reference: row.reference,
    note: row.note,
    photoPath: row.photo_path,
    dateSetOn: row.date_set_on,
  };
}

function toVehicle(row: VehicleRecord): MementoVehicle {
  const entries = (row.memento_entries ?? [])
    .map(toEntry)
    .filter((entry): entry is MementoEntry => entry !== null)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.customName ?? '').localeCompare(b.customName ?? '', 'ro'));
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerCompanyId: row.owner_company_id,
    plate: row.plate,
    make: row.make,
    model: row.model,
    vehicleKind: (row.vehicle_kind as MementoVehicleKind | null) ?? null,
    responsibleUserId: row.responsible_user_id,
    entries,
  };
}

/** The vehicles of a scope, with their dates. */
export async function loadMementoVehicles(
  supabase: Supabase,
  scope: MementoScope,
  userId: string,
): Promise<MementoVehicle[]> {
  const query = supabase.from('memento_vehicles').select(VEHICLE_COLUMNS).order('plate');
  const { data } =
    scope.kind === 'firma'
      ? await query.eq('owner_company_id', scope.companyId)
      : await query.eq('owner_user_id', userId);
  return ((data ?? []) as unknown as VehicleRecord[]).map(toVehicle);
}

/** A firm's vehicles somebody was made responsible for, wherever they are. */
export async function loadResponsibleVehicles(supabase: Supabase, userId: string): Promise<MementoVehicle[]> {
  const { data } = await supabase
    .from('memento_vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('responsible_user_id', userId)
    .order('plate');
  return ((data ?? []) as unknown as VehicleRecord[]).map(toVehicle);
}

/** One vehicle, if the caller may see it. */
export async function loadMementoVehicle(supabase: Supabase, id: string): Promise<MementoVehicle | null> {
  const { data } = await supabase.from('memento_vehicles').select(VEHICLE_COLUMNS).eq('id', id).maybeSingle();
  return data === null ? null : toVehicle(data as unknown as VehicleRecord);
}

/** Entries by id, for „Am reînnoit" from a reminder's link. */
export async function loadMementoEntries(supabase: Supabase, ids: readonly string[]): Promise<(MementoEntry & { plate: string })[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('memento_entries')
    .select(`${ENTRY_COLUMNS}, vehicle:memento_vehicles(plate)`)
    .in('id', ids as string[]);
  return ((data ?? []) as unknown as (EntryRecord & { vehicle: { plate: string } | { plate: string }[] | null })[])
    .map((row) => {
      const entry = toEntry(row);
      const vehicle = Array.isArray(row.vehicle) ? row.vehicle[0] : row.vehicle;
      return entry === null || !vehicle ? null : { ...entry, plate: vehicle.plate };
    })
    .filter((row): row is MementoEntry & { plate: string } => row !== null);
}

export async function loadMementoHistory(supabase: Supabase, entryIds: readonly string[]): Promise<MementoHistoryRow[]> {
  if (entryIds.length === 0) return [];
  const { data } = await supabase
    .from('memento_history')
    .select('id, entry_id, valid_until, due_km, renewed_at')
    .in('entry_id', entryIds as string[])
    .order('renewed_at', { ascending: false });
  return ((data ?? []) as { id: string; entry_id: string; valid_until: string | null; due_km: number | null; renewed_at: string }[]).map(
    (row) => ({ id: row.id, entryId: row.entry_id, validUntil: row.valid_until, dueKm: row.due_km, renewedAt: row.renewed_at }),
  );
}

export interface MementoSchedule {
  kind: '*' | MementoKind;
  days: number[];
}

export async function loadMementoSchedules(
  supabase: Supabase,
  scope: MementoScope,
  userId: string,
): Promise<MementoSchedule[]> {
  const query = supabase.from('memento_schedules').select('kind, days');
  const { data } =
    scope.kind === 'firma' ? await query.eq('owner_company_id', scope.companyId) : await query.eq('owner_user_id', userId);
  return ((data ?? []) as { kind: string; days: number[] }[])
    .filter((row) => row.kind === '*' || isMementoKind(row.kind))
    .map((row) => ({ kind: row.kind as MementoSchedule['kind'], days: row.days }));
}

export interface MementoSettings {
  maxVehiclesIndividual: number;
  maxVehiclesCompany: number;
  maxEntriesPerVehicle: number;
  vehiclesPerHour: number;
  importsPerHour: number;
  importMaxRows: number;
  aiReadsPerDay: number;
  historyDays: number;
  defaultDays: number[];
  groupWindowDays: number;
}

/** The platform's settings; the defaults the migration seeds when the row cannot be read. */
export async function loadMementoSettings(supabase: Supabase): Promise<MementoSettings> {
  const { data } = await supabase.from('memento_settings').select('*').maybeSingle();
  const row = (data ?? {}) as Partial<Record<string, unknown>>;
  const n = (key: string, fallback: number) => (typeof row[key] === 'number' ? (row[key] as number) : fallback);
  return {
    maxVehiclesIndividual: n('max_vehicles_individual', 20),
    maxVehiclesCompany: n('max_vehicles_company', 500),
    maxEntriesPerVehicle: n('max_entries_per_vehicle', 12),
    vehiclesPerHour: n('vehicles_per_hour', 30),
    importsPerHour: n('imports_per_hour', 5),
    importMaxRows: n('import_max_rows', 300),
    aiReadsPerDay: n('ai_reads_per_day', 20),
    historyDays: n('history_days', 365),
    defaultDays: Array.isArray(row.default_days) ? (row.default_days as number[]) : [30, 7, 1, 0],
    groupWindowDays: n('group_window_days', 3),
  };
}

export interface FirmMember {
  userId: string;
  name: string;
  role: string;
}

/** The firm's people, for „Cine primește mementourile". */
export async function loadFirmMembers(supabase: Supabase, companyId: string): Promise<FirmMember[]> {
  const { data } = await supabase
    .from('company_members')
    .select('user_id, role, profile:profiles(full_name, email)')
    .eq('company_id', companyId);
  return ((data ?? []) as unknown as {
    user_id: string;
    role: string;
    profile: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  }[])
    .map((row) => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { userId: row.user_id, role: row.role, name: profile?.full_name || profile?.email || 'Membru' };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ro'));
}

/** Whether the person wants memento notices inside the app (the in-app channel). */
export async function mementoInAppEnabled(supabase: Supabase, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('inapp')
    .eq('user_id', userId)
    .eq('type', 'memento_expiry')
    .maybeSingle();
  return (data as { inapp: boolean | null } | null)?.inapp !== false;
}
