'use server';

import { revalidatePath } from 'next/cache';
import { companyRoutes } from '@/config/routes';
import { type ActionState, messageFromError } from '@/lib/action-state';
import { requireMembership } from '@/lib/auth';
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentStoragePath } from '@/lib/documents';
import type { Database } from '@/lib/supabase/database.types';

type DocumentKind = Database['public']['Enums']['document_kind'];

export interface RegisterDocumentInput {
  documentId: string;
  companyId: string;
  vehicleId: string | null;
  kind: DocumentKind;
  fileName: string;
  mime: string;
  size: number;
}

/**
 * Called after the browser has uploaded the file into the company's folder.
 * The row lands as 'uploaded' whatever the client sends (database trigger),
 * then the AI reading runs; a person approves in the review queue.
 */
export async function registerDocument(input: RegisterDocumentInput): Promise<ActionState> {
  const { session } = await requireMembership(input.companyId);
  const { supabase, userId } = session;

  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(input.mime) || input.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: 'Încarcă un PDF sau o fotografie de cel mult 10 MB.' };
  }

  const { error } = await supabase.from('documents').insert({
    id: input.documentId,
    company_id: input.companyId,
    vehicle_id: input.vehicleId,
    scope: input.vehicleId ? 'vehicle' : 'company',
    kind: input.kind,
    file_path: documentStoragePath(input.companyId, input.documentId, input.fileName),
    file_mime: input.mime,
    file_size_bytes: input.size,
    uploaded_by: userId,
  });
  if (error) return { ok: false, message: messageFromError(error) };

  // AI reading pre-fills the reviewer's form. If it is unavailable the
  // document still goes to review; the reviewer types the dates.
  const { error: parseError } = await supabase.functions.invoke('parse-document', {
    body: { document_id: input.documentId },
  });

  const routes = companyRoutes(input.companyId);
  revalidatePath(routes.overview);
  revalidatePath(routes.documents);
  if (input.vehicleId) revalidatePath(routes.vehicle(input.vehicleId));

  return {
    ok: true,
    message: parseError
      ? 'Document încărcat. Îl verificăm și îți confirmăm data de expirare.'
      : 'Document încărcat și citit automat. Urmează verificarea de către echipa platformei.',
  };
}
