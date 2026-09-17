'use server';

import { verificationCopy } from '@/content/siguranta';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * A report from somebody who saw something wrong.
 *
 * It writes to `reports`, whose only insert policy is
 * `reporter_user_id = auth.uid()` — so the reporter is the session, never a
 * form field, and nobody can file a report in somebody else's name.
 *
 * `reported_company_id` stays null: this page has no company in context,
 * and a free-text name is not an id. What the person typed is kept in
 * `details`, where the team reads it.
 */
const c = verificationCopy.report.form;

export interface ReportState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

export async function reportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const context = await getAccountContext();
  if (!context) return { error: verificationCopy.report.signedOutNote };

  const reason = String(formData.get('reason') ?? '').trim();
  const company = String(formData.get('company') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim();

  const fieldErrors: Record<string, string> = {};
  if (reason === '') fieldErrors.reason = c.missingReason;
  if (details.length < 10) fieldErrors.details = c.missingDetails;
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from('reports').insert({
    reporter_user_id: context.user.id,
    reason,
    details: company === '' ? details : `Firma indicată: ${company}\n\n${details}`,
  });

  if (error) return { error: toAppError(error, 'verificare.report').message };
  return { notice: c.sent };
}
