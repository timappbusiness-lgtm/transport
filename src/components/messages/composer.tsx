'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { draftKey } from '@/lib/continuity/drafts';
import { useTextDraft } from '@/lib/continuity/use-text-draft';
import { sendMessageAction, type MessageState } from '@/app/cont/mesaje/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';
import { MAX_ATTACHMENTS, MAX_BODY, validateAttachment } from '@/lib/messages';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: MessageState = {};
const c = messagesCopy.composer;

/**
 * Caseta de scris.
 *
 * Enter trimite, Shift+Enter trece pe rând nou — convenția pe care o au
 * toate aplicațiile de mesaje, și pe care oamenii o încearcă înainte să
 * citească orice indicație. Indicația scrie totuși dedesubt, pentru cine
 * nu o încearcă.
 *
 * Imaginile se aleg local și se trimit odată cu formularul; nu se
 * încarcă în fundal, pentru că un mesaj pe jumătate trimis dintr-o
 * pagină închisă este o imagine fără mesaj în bucket.
 *
 * Textul se păstrează în browser cât e scris (o reîncărcare, un mesaj
 * primit între timp nu-l mai șterg) și se golește numai după ce a
 * plecat. Înainte, caseta era remontată la fiecare mesaj nou din fir —
 * inclusiv la unul primit în timp ce scriai.
 */
export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useKeptActionState(sendMessageAction, EMPTY);
  const [body, setBody, clearBody] = useTextDraft(draftKey('mesaj', conversationId));
  const [files, setFiles] = useState<File[]>([]);
  const [handled, setHandled] = useState(state);
  // Sent: the text, the chosen images and the file input go, together.
  // A failure keeps all three, so pressing again sends the same thing.
  if (handled !== state) {
    setHandled(state);
    if (state.sent === true) {
      clearBody();
      setFiles([]);
    }
  }
  const [problem, setProblem] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  function pick(list: FileList | null) {
    if (!list) return;
    const chosen = [...list].slice(0, MAX_ATTACHMENTS);
    for (const file of chosen) {
      const bad = validateAttachment(file);
      if (bad !== null) {
        setProblem(bad);
        return;
      }
    }
    setProblem(null);
    setFiles(chosen);
  }

  return (
    <KeepingForm
      ref={formRef}
      action={action}
      resetOn={state.sent === true ? state : null}
      className="sticky bottom-0 border-t border-border bg-background px-3 py-3 sm:px-0"
    >
      <input type="hidden" name="conversation_id" value={conversationId} />

      {offline ? <p className="mb-2 text-small font-medium text-foreground">{c.offline}</p> : null}

      {files.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5 text-small text-muted">
          {files.map((file) => (
            <li key={file.name} className="rounded-pill border border-border px-2 py-0.5">
              {file.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <label htmlFor={`${id}-body`} className="sr-only">
          {c.placeholder}
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={2}
          maxLength={MAX_BODY}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder={c.placeholder}
          className="min-h-[2.75rem] flex-1 resize-y rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
        />

        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {pending ? c.sending : c.send}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className="cursor-pointer text-small link-accent">
          {c.attach}
          <input
            ref={fileRef}
            type="file"
            name="attachments"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            onChange={(e) => pick(e.target.files)}
            className="sr-only"
          />
        </label>
        <span className="text-small text-muted">{c.hint}</span>
      </div>
      <p className="mt-1 text-small text-muted">{c.attachHint}</p>

      <FormError>{problem ?? state.fieldErrors?.body ?? state.fieldErrors?.attachments}</FormError>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
