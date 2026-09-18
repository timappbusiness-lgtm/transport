import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * The vocabulary the capabilities tab offers.
 *
 * Read past nothing: `equipment_options` and `service_options` are open to
 * `anon` for the active rows, because they appear on a public profile and
 * in the filters of a board a visitor can see.
 *
 * The one subtlety is the retired option. A firm that ticked `troliu`
 * before it was retired still has it, and the trigger deliberately lets
 * that firm keep it — so the list a firm is shown adds back any code it
 * already holds. Without that, opening the tab would show a profile the
 * firm never saved, and the next save would silently drop the tick.
 */

export interface Option {
  code: string;
  label: string;
  hint: string | null;
}

interface Row {
  code: string;
  label_ro: string;
  description_ro: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CompanyOptions {
  equipment: Option[];
  services: Option[];
}

export const NO_OPTIONS: CompanyOptions = { equipment: [], services: [] };

export async function loadCompanyOptions(
  held: { equipment: readonly string[]; services: readonly string[] } = {
    equipment: [],
    services: [],
  },
): Promise<CompanyOptions> {
  if (!isSupabaseConfigured()) return NO_OPTIONS;

  const supabase = await createClient();
  const [equipment, services] = await Promise.all([
    supabase
      .from('equipment_options')
      .select('code, label_ro, description_ro, sort_order, is_active')
      .order('sort_order', { ascending: true }),
    supabase
      .from('service_options')
      .select('code, label_ro, description_ro, sort_order, is_active')
      .order('sort_order', { ascending: true }),
  ]);

  if (equipment.error || services.error) {
    console.error('[firmă] options query failed', {
      equipment: equipment.error?.message,
      services: services.error?.message,
    });
    return NO_OPTIONS;
  }

  return {
    equipment: withHeld((equipment.data ?? []) as Row[], held.equipment),
    services: withHeld((services.data ?? []) as Row[], held.services),
  };
}

/** The active options, plus any retired code this firm still holds. */
function withHeld(rows: readonly Row[], held: readonly string[]): Option[] {
  const active = rows.filter((row) => row.is_active);
  const known = new Set(active.map((row) => row.code));

  const retained = rows.filter((row) => !row.is_active && held.includes(row.code));
  // A code held but missing from the table entirely — retired and deleted,
  // which the RPCs do not do — is still shown, under its own code, rather
  // than dropped without the firm being told.
  const orphans = held
    .filter((code) => !known.has(code) && !rows.some((row) => row.code === code))
    .map((code) => ({ code, label_ro: code, description_ro: null, sort_order: 999, is_active: false }));

  return [...active, ...retained, ...orphans].map((row) => ({
    code: row.code,
    label: row.label_ro,
    hint: row.description_ro,
  }));
}

/** Everything, active or not, for the admin screen. */
export async function loadAllCompanyOptions(): Promise<{
  equipment: (Option & { sortOrder: number; isActive: boolean })[];
  services: (Option & { sortOrder: number; isActive: boolean })[];
}> {
  if (!isSupabaseConfigured()) return { equipment: [], services: [] };

  const supabase = await createClient();
  const [equipment, services] = await Promise.all([
    supabase
      .from('equipment_options')
      .select('code, label_ro, description_ro, sort_order, is_active')
      .order('sort_order', { ascending: true }),
    supabase
      .from('service_options')
      .select('code, label_ro, description_ro, sort_order, is_active')
      .order('sort_order', { ascending: true }),
  ]);

  const map = (rows: Row[]) =>
    rows.map((row) => ({
      code: row.code,
      label: row.label_ro,
      hint: row.description_ro,
      sortOrder: row.sort_order,
      isActive: row.is_active,
    }));

  return {
    equipment: map((equipment.data ?? []) as Row[]),
    services: map((services.data ?? []) as Row[]),
  };
}

/** How many vehicles are on the fleet, which nobody types. */
export async function countActiveVehicles(companyId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) {
    console.error('[firmă] vehicle count failed', { message: error.message });
    return 0;
  }
  return count ?? 0;
}
