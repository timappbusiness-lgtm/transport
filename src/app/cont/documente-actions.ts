'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import { readDocumentAnswer, type DocumentReading } from '@/lib/document-reading';

/**
 * The model's side of the documents screen: read a registered document,
 * say what an unlabelled one is, keep the date the carrier confirmed.
 *
 * All three go through `parse-document`, which asks the database with the
 * caller's own token before it touches anything (see its modes.ts). None
 * of them approves anything: a person does that, in admin.
 */

async function requireCompanyId(): Promise<string> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.accountDocuments);
  const company = context.activeCompany;
  if (!company) throw new Error('Adaugă întâi firma.');
  return company.id;
}

async function invoke(body: Record<string, unknown>): Promise<{ status: number | null; data: unknown }> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke('parse-document', { body });
  if (!error) return { status: 200, data };
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    return { status: response.status, data: await response.json().catch(() => null) };
  }
  return { status: null, data: null };
}

/** Reads a registered document: its date, its type as the model sees it. */
export async function readDocumentAction(documentId: string): Promise<DocumentReading> {
  await requireCompanyId();
  const { status, data } = await invoke({ document_id: documentId });
  revalidatePath(ROUTES.accountDocuments);
  return readDocumentAnswer(status, data);
}

/**
 * Says what a file from the gallery is, before anybody has labelled it.
 * The path has to be in this firm's own folder: the function checks that
 * too, through Storage's policy, but a wrong folder is refused here first.
 */
export async function classifyDocumentAction(filePath: string): Promise<DocumentReading> {
  const companyId = await requireCompanyId();
  if (!filePath.startsWith(`${companyId}/`)) return { status: 'failed', message: null };
  const { status, data } = await invoke({ mode: 'classify', file_path: filePath });
  return readDocumentAnswer(status, data);
}

/** Keeps the expiry date the carrier confirmed, beside the one the model read. */
export async function declareDocumentAction(
  documentId: string,
  validUntil: string,
): Promise<{ ok: boolean }> {
  await requireCompanyId();
  const { status } = await invoke({ mode: 'declare', document_id: documentId, valid_until: validUntil });
  revalidatePath(ROUTES.accountDocuments);
  return { ok: status === 200 };
}
