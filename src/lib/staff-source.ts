import 'server-only';
import type { StaffMember, StaffRole } from './staff';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What `/admin/echipa` reads.
 *
 * `staff_members()` is SECURITY DEFINER and re-checks
 * `is_platform_admin()` itself, so the names it joins in are not a way
 * around the `profiles` policies.
 */
export async function loadStaffMembers(): Promise<StaffMember[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('staff_members');
  if (error) {
    console.error('[echipa] query failed', { code: error.code, message: error.message });
    return [];
  }

  return ((data ?? []) as StaffMember[]).map((row) => ({
    ...row,
    role: row.role as StaffRole,
  }));
}
