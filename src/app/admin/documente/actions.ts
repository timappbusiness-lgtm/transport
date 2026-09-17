'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminReviewCopy } from '@/content/admin';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * The two decisions a reviewer makes.
 *
 * Neither is taken here. `review_document()` and `review_company()` are
 * SECURITY DEFINER, check staff membership themselves, refuse a document
 * that is not waiting or a rejection with no reason, and write the
 * before/after pair to `audit_log`. The staff check below only produces a
 * better message than a raw privilege error.
 */
const c = adminReviewCopy;

export interface ReviewState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

async function requireStaff(): Promise<boolean> {
  const context = await getAccountContext();
  return context?.isStaff === true;
}

function refresh() {
  revalidatePath(ROUTES.adminDocuments);
  revalidatePath(ROUTES.admin);
}

export async function reviewDocumentAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  if (!(await requireStaff())) return { error: c.noAccess };

  const documentId = String(formData.get('document_id') ?? '');
  const approve = String(formData.get('decision') ?? '') === 'approve';
  const validUntil = String(formData.get('valid_until') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const hasExpiry = String(formData.get('has_expiry') ?? '') === 'true';

  if (approve && hasExpiry && validUntil === '') {
    return { fieldErrors: { valid_until: c.documents.missingDate } };
  }
  if (!approve && reason === '') {
    return { fieldErrors: { reason: c.documents.missingReason } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_document', {
    p_document_id: documentId,
    p_approve: approve,
    p_valid_until: validUntil === '' ? undefined : validUntil,
    p_rejection_reason: approve ? undefined : reason,
  });

  if (error) return { error: toAppError(error, 'admin.reviewDocument').message };

  refresh();
  return { notice: approve ? c.documents.approved : c.documents.rejected };
}

export async function reviewCompanyAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  if (!(await requireStaff())) return { error: c.noAccess };

  const companyId = String(formData.get('company_id') ?? '');
  const approve = String(formData.get('decision') ?? '') === 'approve';
  const reason = String(formData.get('reason') ?? '').trim();

  if (!approve && reason === '') {
    return { fieldErrors: { reason: c.companies.missingReason } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('review_company', {
    p_company_id: companyId,
    p_approve: approve,
    p_reason: approve ? undefined : reason,
  });

  if (error) return { error: toAppError(error, 'admin.reviewCompany').message };

  refresh();
  return { notice: approve ? c.companies.approved : c.companies.rejected };
}
