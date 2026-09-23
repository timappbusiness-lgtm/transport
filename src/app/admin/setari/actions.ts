'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { personalDataCopy } from '@/content/date-personale';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { DIRECTORY_TAG } from '@/lib/directory-source';
import { createClient } from '@/lib/supabase/server';

/**
 * The three numbers behind the directory.
 *
 * `set_directory_settings` is SECURITY DEFINER, checks staff membership
 * itself and writes the before/after pair to `audit_log`. There is no table
 * grant that would let this action write the row directly, so the check
 * below is a courtesy that produces a better message — not the rule.
 */
const c = adminDirectoryCopy.settings;

export interface SettingsActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function whole(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

export async function setDirectorySettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const statsMin = whole(formData, 'stats_min_companies');
  const directoryMin = whole(formData, 'directory_min_companies');

  const fieldErrors: Record<string, string> = {};
  if (statsMin === null || statsMin < 1 || statsMin > 100_000) {
    fieldErrors.stats_min_companies = c.invalidStats;
  }
  if (directoryMin === null || directoryMin < 1 || directoryMin > 100_000) {
    fieldErrors.directory_min_companies = c.invalidDirectory;
  }
  if (statsMin === null || directoryMin === null || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_directory_settings', {
    p_stats_min_companies: statsMin,
    p_directory_min_companies: directoryMin,
  });

  if (error) return { error: toAppError(error, 'admin.setDirectorySettings').message };

  // The homepage reads through a five-minute cache. `updateTag` rather than
  // `revalidateTag`: from a server action it expires the entry immediately,
  // so the person who just pressed Save sees the change on the next page
  // view instead of minutes later.
  updateTag(DIRECTORY_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.companies);
  revalidatePath(ROUTES.adminSettings);

  return { notice: c.saved };
}

/**
 * The erasure and retention numbers.
 *
 * `set_deletion_settings` is SECURITY DEFINER, checks staff membership
 * itself and writes the before/after pair to `audit_log`. The validation
 * here exists to give a sentence instead of a constraint violation; the
 * database has the same bounds and is the one that decides.
 */
export async function setDeletionSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: personalDataCopy.admin.settings.noAccess };

  const graceDays = whole(formData, 'grace_days');
  const months = whole(formData, 'contact_reveal_months');
  const email = String(formData.get('support_email') ?? '').trim();

  const fieldErrors: Record<string, string> = {};
  if (graceDays === null || graceDays < 0 || graceDays > 90) {
    fieldErrors.grace_days = personalDataCopy.admin.settings.invalidGrace;
  }
  if (months === null || months < 1 || months > 120) {
    fieldErrors.contact_reveal_months = personalDataCopy.admin.settings.invalidMonths;
  }
  // Deliberately loose: an address with an @ and a dot after it is as far
  // as a form should go. The only thing this field does is appear on a
  // page, and refusing a valid but unusual address is the worse failure.
  if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fieldErrors.support_email = personalDataCopy.admin.settings.invalidEmail;
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_deletion_settings', {
    p_grace_days: graceDays,
    p_support_email: email === '' ? null : email,
    p_contact_reveal_months: months,
  });

  if (error) return { error: toAppError(error, 'settings.deletion').message };

  revalidatePath(ROUTES.adminSettings);
  revalidatePath(ROUTES.accountPersonalData);
  return { notice: personalDataCopy.admin.settings.saved };
}
