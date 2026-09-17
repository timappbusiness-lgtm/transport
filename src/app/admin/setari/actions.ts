'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { getAccountContext } from '@/lib/auth/account';
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
  if (!context?.isStaff) return { error: c.noAccess };

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
