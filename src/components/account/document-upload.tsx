'use client';

import { useActionToast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';
import { FAILURE_MESSAGES, failureKind } from '@/lib/continuity/network';
import { announceSessionExpired } from '@/lib/continuity/session-store';
import { registerDocumentAction } from '@/app/cont/fleet-actions';
import type { ActionState } from '@/app/cont/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  documentStoragePath,
} from '@/lib/documents';
import { onboardingCopy } from '@/content/onboarding';
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
 *
 * Two shapes, one implementation. With several `kinds` it is the form on
 * the documents list: choose which, choose a file. With exactly one it is
 * the single-document screen, and then the camera comes first — the
 * person doing this is standing at a desk with a folder open and a
 * telephone in their hand, and „choose a file" on a telephone is three
 * taps into a file manager for a document they are holding.
 */
export function DocumentUpload({
  companyId,
  vehicleId = null,
  kinds,
  cameraFirst = false,
}: {
  companyId: string;
  vehicleId?: string | null;
  kinds: { kind: DocumentKind; label: string }[];
  /** Single-document screen: two buttons, the camera first. */
  cameraFirst?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [state, setState] = useState<ActionState>({});
  // The result where the person is looking: the save button sticks to
  // the bottom of a phone, and the top of this form may be off screen.
  useActionToast(state);
  const [pending, startTransition] = useTransition();
  // A file already in the bucket whose registration failed: a retry
  // registers it again instead of uploading a second copy — before, every
  // retry left the previous upload behind, attached to nothing.
  const uploaded = useRef<{ file: string; documentId: string } | null>(null);
  // The camera-first screen has no button of its own; after a failure it
  // gets one, so the photo already taken is sent again rather than taken
  // again.
  const [canRetry, setCanRetry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (kinds.length === 0) return null;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const kind = data.get('kind') as DocumentKind | null;
        // Two inputs carry this name on the single-document screen — the
        // camera and the file picker — and only one of them holds
        // anything. `get` would return the first, which is empty
        // whenever somebody used the second.
        const file = data
          .getAll('file')
          .find((entry): entry is File => entry instanceof File && entry.size > 0);

        if (!kind || file === undefined) {
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
          setCanRetry(false);
          const identity = `${file.name}:${file.size}:${file.lastModified}:${kind}`;
          try {
            let documentId = uploaded.current?.file === identity ? uploaded.current.documentId : null;
            if (documentId === null) {
              documentId = crypto.randomUUID();
              const path = documentStoragePath(companyId, documentId, file.name);
              const { error } = await createClient()
                .storage.from('documents')
                .upload(path, file, { contentType: file.type, upsert: false });

              if (error) {
                // The file stays chosen: pressing again sends the same one.
                setState({ error: 'Fișierul nu a putut fi încărcat. A rămas ales — încearcă din nou.' });
                setCanRetry(true);
                return;
              }
              uploaded.current = { file: identity, documentId };
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
              uploaded.current = null;
              form.reset();
              router.refresh();
            } else {
              setCanRetry(true);
            }
          } catch (error) {
            const failure = failureKind(error);
            if (failure === null) throw error;
            if (failure === 'session') announceSessionExpired();
            setState({ error: FAILURE_MESSAGES[failure] });
            setCanRetry(true);
          }
        });
      }}
    >
      {cameraFirst ? (
        <>
          {/* The kind is decided by the screen, not by the person. */}
          <input type="hidden" name="kind" value={kinds[0]!.kind} />

          <label
            htmlFor={`${id}-camera`}
            // The file input after it is hidden; the label draws its focus.
            className={`${buttonClasses('primary', 'md')} w-full cursor-pointer justify-center sm:w-auto [&:has(+input:focus-visible)]:outline-2 [&:has(+input:focus-visible)]:outline-offset-2 [&:has(+input:focus-visible)]:outline-foreground`}
          >
            {onboardingCopy.documents.camera}
          </label>
          <input
            id={`${id}-camera`}
            name="file"
            type="file"
            accept="image/*"
            // The telephone's own camera, rear lens. A document is never
            // photographed with the front one.
            capture="environment"
            className="sr-only"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />

          <label
            htmlFor={`${id}-file`}
            className="cursor-pointer text-small text-muted underline underline-offset-4 hover:text-foreground [&:has(+input:focus-visible)]:outline-2 [&:has(+input:focus-visible)]:outline-offset-2 [&:has(+input:focus-visible)]:outline-foreground"
          >
            {onboardingCopy.documents.file}
          </label>
          <input
            id={`${id}-file`}
            name="file"
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
            className="sr-only"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />

          <p className="text-small text-muted">PDF sau fotografie, cel mult 10 MB.</p>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-kind`} className="text-body font-medium">
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
            <label htmlFor={`${id}-file`} className="text-body font-medium">
              Fișier
            </label>
            <input
              id={`${id}-file`}
              name="file"
              type="file"
              required
              accept={ACCEPTED_DOCUMENT_TYPES.join(',')}
              aria-describedby={`${id}-file-hint`}
              className={`${FIELD_CLASSES} file:mr-3 file:rounded-tight file:border-0 file:bg-foreground/10 file:px-2 file:py-1 file:text-body`}
            />
            <p id={`${id}-file-hint`} className="text-small text-muted">
              PDF sau fotografie, cel mult 10 MB.
            </p>
          </div>
        </div>
      )}

      <FormError>{state.error}</FormError>

      {cameraFirst ? (
        pending ? (
          <p className="text-small text-muted">Se încarcă…</p>
        ) : canRetry ? (
          <div>
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              className={buttonClasses('secondary', 'sm')}
            >
              Încearcă din nou
            </button>
          </div>
        ) : null
      ) : (
        <div>
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
            {pending ? 'Se încarcă…' : 'Încarcă documentul'}
          </button>
        </div>
      )}
    </form>
  );
}
