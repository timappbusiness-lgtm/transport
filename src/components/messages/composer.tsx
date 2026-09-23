'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { sendMessageAction, type MessageState } from '@/app/cont/mesaje/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';
import { MAX_ATTACHMENTS, MAX_BODY, validateAttachment } from '@/lib/messages';

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
 */
export function Composer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendMessageAction, EMPTY);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
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
    <form
      ref={formRef}
      action={action}
      className="sticky bottom-0 border-t border-border bg-ground px-3 py-3 sm:px-0"
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
    </form>
  );
}
