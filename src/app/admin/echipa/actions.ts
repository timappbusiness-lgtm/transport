'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { teamCopy } from '@/content/echipa';
import { toAppError } from '@/lib/errors';
import { STAFF_ROLES, type StaffRole } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export interface TeamState {
  error?: string;
  notice?: string;
}

function role(value: FormDataEntryValue | null): StaffRole | null {
  const text = String(value ?? '');
  return (STAFF_ROLES as readonly string[]).includes(text) ? (text as StaffRole) : null;
}

/**
 * Giving somebody the run of the platform.
 *
 * Two calls, both staff-only in the database: `find_account_by_email`
 * answers about exactly one address — a function that took a pattern
 * would be a way to read the user table — and `set_platform_staff` does
 * the granting, refuses without a reason, and writes the audit row.
 *
 * The confirmed-e-mail rule is applied here rather than in the database
 * because it is a policy about onboarding, not about access: somebody
 * who cannot receive our e-mail cannot be reached about what they did
 * with the access, and that is the reason, not a security boundary.
 */
export async function grantStaffAction(
  _previous: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const email = String(formData.get('email') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const wanted = role(formData.get('role')) ?? 'admin';

  if (email === '') return { error: teamCopy.add.missingEmail };
  if (reason === '') return { error: teamCopy.add.missingReason };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('find_account_by_email', { p_email: email });
  if (error) return { error: toAppError(error, 'staff.find').message };

  const found = Array.isArray(data) ? data[0] : null;
  if (!found) return { error: teamCopy.add.notFound };
  if (!found.email_confirmed) return { error: teamCopy.add.notConfirmed };

  const { error: grantError } = await supabase.rpc('set_platform_staff', {
    p_user_id: found.user_id,
    p_role: wanted,
    p_reason: reason,
  });
  if (grantError) return { error: toAppError(grantError, 'staff.grant').message };

  revalidatePath(ROUTES.adminTeam);
  return { notice: teamCopy.add.granted(found.full_name ?? found.email ?? email) };
}

/**
 * Taking it away.
 *
 * `p_role => null` is what `set_platform_staff` reads as a revocation,
 * and it is the same function that refuses to remove the last
 * administrator — with its own sentence, which is shown as written.
 */
export async function revokeStaffAction(
  _previous: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (userId === '') return { error: 'Lipsește contul.' };
  if (reason === '') return { error: teamCopy.add.missingReason };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_platform_staff', {
    p_user_id: userId,
    // Null is what the function reads as „take it away". The generated
    // type says the parameter is an enum because the SQL signature has no
    // default, so the cast is the honest way to say what SQL allows.
    p_role: null as unknown as StaffRole,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'staff.revoke').message };

  revalidatePath(ROUTES.adminTeam);
  return { notice: teamCopy.revoke.revoked(name === '' ? 'Contul' : name) };
}
