'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { registerDocument } from '@/app/actions/documents';
import type { ActionState } from '@/lib/action-state';
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentStoragePath } from '@/lib/documents';
import type { Database } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';
import { Field, FormMessage, inputClasses } from './forms';
import { buttonClasses } from '@/components/ui/button';

type DocumentKind = Database['public']['Enums']['document_kind'];

/**
 * Uploads straight from the browser into documents/<company_id>/, so the
 * file never passes through a server action body limit. Storage policies
 * allow a new object only in the member's company folder, and never an
 * overwrite.
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
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startTransition] = useTransition();

  if (kinds.length === 0) return null;

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const kind = data.get('kind') as DocumentKind | null;
        const file = data.get('file');
        if (!kind || !(file instanceof File) || file.size === 0) {
          setState({ ok: false, message: 'Alege tipul documentului și fișierul.' });
          return;
        }
        if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type) || file.size > MAX_DOCUMENT_BYTES) {
          setState({ ok: false, message: 'Încarcă un PDF sau o fotografie (JPG, PNG, WEBP, HEIC) de cel mult 10 MB.' });
          return;
        }

        startTransition(async () => {
          setState(undefined);
          const documentId = crypto.randomUUID();
          const path = documentStoragePath(companyId, documentId, file.name);
          const { error } = await createClient()
            .storage.from('documents')
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            setState({ ok: false, message: 'Fișierul nu a putut fi încărcat. Încearcă din nou.' });
            return;
          }
          const result = await registerDocument({
            documentId,
            companyId,
            vehicleId,
            kind,
            fileName: file.name,
            mime: file.type,
            size: file.size,
          });
          setState(result);
          if (result?.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipul documentului" htmlFor={`${id}-kind`}>
          <select id={`${id}-kind`} name="kind" defaultValue="" required className={inputClasses}>
            <option value="" disabled>
              Alege…
            </option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fișier" htmlFor={`${id}-file`} hint="PDF sau fotografie, cel mult 10 MB.">
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            required
            accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
            className={`${inputClasses} file:mr-3 file:rounded-[4px] file:border-0 file:bg-foreground/10 file:px-2 file:py-1 file:text-sm`}
          />
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? 'Se încarcă…' : 'Încarcă documentul'}
        </button>
      </div>
    </form>
  );
}
