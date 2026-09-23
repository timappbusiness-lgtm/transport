'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { registerDocumentAction } from '@/app/cont/fleet-actions';
import type { ActionState } from '@/app/cont/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  documentStoragePath,
} from '@/lib/documents';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

type DocumentKind = Database['public']['Enums']['document_kind'];

const FIELD_CLASSES =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

/**
 * Uploads straight from the browser into documents/<company_id>/, so the
 * file never passes through a server action's body limit. The storage
 * policies allow a new object only inside the member's own company folder,
 * and never an overwrite — a renewal is a new document, not an edit of the
 * old one.
 */
export function DocumentUpload({
  companyId,
  vehicleId = null,
  kinds,
}: {
  companyId: string;
  vehicleId?: string | null;
  kinds: { kind: DocumentKind; label: string }[];
}) {
  const id = useId();
  const router = useRouter();
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  if (kinds.length === 0) return null;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const kind = data.get('kind') as DocumentKind | null;
        const file = data.get('file');

        if (!kind || !(file instanceof File) || file.size === 0) {
          setState({ error: 'Alege tipul documentului și fișierul.' });
          return;
        }
        if (
          !(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type) ||
          file.size > MAX_DOCUMENT_BYTES
        ) {
          setState({
            error:
              'Încarcă un PDF sau o fotografie (JPG, PNG, WEBP, HEIC) de cel mult 10 MB.',
          });
          return;
        }

        startTransition(async () => {
          setState({});
          const documentId = crypto.randomUUID();
          const path = documentStoragePath(companyId, documentId, file.name);

          const { error } = await createClient()
            .storage.from('documents')
            .upload(path, file, { contentType: file.type, upsert: false });

          if (error) {
            setState({ error: 'Fișierul nu a putut fi încărcat. Încearcă din nou.' });
            return;
          }

          const result = await registerDocumentAction({
            documentId,
            vehicleId,
            kind,
            fileName: file.name,
            mime: file.type,
            size: file.size,
          });

          setState(result);
          if (!result.error) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-kind`} className="text-sm font-medium">
            Tipul documentului
          </label>
          <select id={`${id}-kind`} name="kind" defaultValue="" required className={FIELD_CLASSES}>
            <option value="" disabled>
              Alege…
            </option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-file`} className="text-sm font-medium">
            Fișier
          </label>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            required
            accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
            aria-describedby={`${id}-file-hint`}
            className={`${FIELD_CLASSES} file:mr-3 file:rounded-tight file:border-0 file:bg-foreground/10 file:px-2 file:py-1 file:text-sm`}
          />
          <p id={`${id}-file-hint`} className="text-xs text-muted">
            PDF sau fotografie, cel mult 10 MB.
          </p>
        </div>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Se încarcă…' : 'Încarcă documentul'}
        </button>
      </div>
    </form>
  );
}
