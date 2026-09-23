'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { DIRECTORY_TAG } from '@/lib/directory-source';
import { createClient } from '@/lib/supabase/server';

/**
 * Taking a profile out of the public list.
 *
 * `set_company_public_profile` refuses staff without a reason and writes
 * the reason to `audit_log`. It deliberately does not touch the
 * verification or the suspension: hiding a profile is a moderation decision
 * about what we publish, not a judgement about whether the firm may work.
 */
const c = adminDirectoryCopy.companies;

export interface HideActionState {
  error?: string;
  notice?: string;
}

export async function hideCompanyProfileAction(
  _previous: HideActionState,
  formData: FormData,
): Promise<HideActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const companyId = String(formData.get('companyId') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (companyId === '') return { error: c.noAccess };
  if (reason === '') return { error: c.reasonRequired };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_company_public_profile', {
    p_company_id: companyId,
    p_enabled: false,
    p_reason: reason,
  });

  if (error) return { error: toAppError(error, 'admin.hideCompanyProfile').message };

  updateTag(DIRECTORY_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.companies);
  revalidatePath(ROUTES.adminCompanies);

  return { notice: c.hidden };
}
