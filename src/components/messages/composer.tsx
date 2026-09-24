'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { draftKey } from '@/lib/continuity/drafts';
import { useTextDraft } from '@/lib/continuity/use-text-draft';
import { sendMessageAction, type MessageState } from '@/app/cont/mesaje/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { Thumbnail, UploadLine } from '@/components/ui/upload-line';
import { uploadRoute } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { MAX_ATTACHMENTS, MAX_BODY, validateAttachment } from '@/lib/messages';
import { shrinkPhoto } from '@/lib/photo-shrink';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { newUploadId } from '@/lib/uploads/paths';
import { SEND_ERROR_MESSAGES, SendError, postUpload } from '@/lib/uploads/transport';
import { useUploadQueue } from '@/lib/uploads/use-upload-queue';

const EMPTY: MessageState = {};
const c = messagesCopy.composer;

/** The id the next message goes out under, kept until it has gone. */
function messageIdKey(conversationId: string): string {
  return `coridor:mesaj-id:${conversationId}`;
}

function readMessageId(conversationId: string): string | null {
  try {
    return window.localStorage.getItem(messageIdKey(conversationId));
  } catch {
    return null;
  }
}

function keepMessageId(conversationId: string, id: string): void {
  try {
    window.localStorage.setItem(messageIdKey(conversationId), id);
  } catch {
    // A private window: the id lives as long as the page.
  }
}

/**
 * Caseta de scris.
 *
 * Enter trimite, Shift+Enter trece pe rând nou — convenția pe care o au
 * toate aplicațiile de mesaje, și pe care oamenii o încearcă înainte să
 * citească orice indicație. Indicația scrie totuși dedesubt, pentru cine
 * nu o încearcă.
 *
 * Textul se păstrează în browser cât e scris (o reîncărcare, un mesaj
 * primit între timp nu-l mai șterg) și se golește numai după ce a
 * plecat.
 *
 * Imaginile alese se păstrează pe dispozitiv (IndexedDB) din clipa în
 * care sunt alese: o reîncărcare sau un tab închis le găsește tot aici.
 * Stau „în așteptare" până pleacă textul; apoi urcă una câte una, fiecare
 * cu progresul ei, legate de mesaj. Una care cade rămâne, cu „Încearcă
 * din nou", și ajunge la același mesaj — nu la unul nou.
 *
 * Mesajul pleacă sub un id ales aici o dată și păstrat până a plecat, așa
 * că a doua apăsare după un răspuns pierdut nu mai face un al doilea mesaj.
 */
export function Composer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [state, action, pending] = useKeptActionState(sendMessageAction, EMPTY);
  const [body, setBody, clearBody] = useTextDraft(draftKey('mesaj', conversationId));
  // The id the next message goes out under, in a hidden field set from
  // the device's copy: kept from before a reload, or new.
  const messageIdRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  const queue = useUploadQueue({
    scope: `mesaj:${conversationId}`,
    send: async (file, onProgress) => {
      if (typeof file.meta.messageId !== 'string') throw new SendError('refused', SEND_ERROR_MESSAGES.refused);
      const small = await shrinkPhoto(new File([file.blob], file.name, { type: file.type }));
      const form = new FormData();
      form.set('id', file.id);
      form.set('conversation_id', conversationId);
      form.set('message_id', file.meta.messageId);
      form.set('photo', small);
      const answer = await postUpload<{ id?: string }>(uploadRoute('atasament'), form, onProgress);
      if (typeof answer.id !== 'string') throw new SendError('server', SEND_ERROR_MESSAGES.server);
      return { id: answer.id };
    },
    onUploaded: () => router.refresh(),
  });
  const chosen = queue.items.filter((item) => item.meta.hold === true);
  const going = queue.items.filter((item) => item.meta.hold !== true && item.status !== 'uploaded');

  useEffect(() => {
    const kept = readMessageId(conversationId);
    const next = kept ?? newUploadId();
    if (kept === null) keepMessageId(conversationId, next);
    if (messageIdRef.current !== null) messageIdRef.current.value = next;
  }, [conversationId]);

  // Sent: the text goes, the chosen images follow the message, and the
  // next message gets a new id. A failure keeps all of it, so pressing
  // again sends the same thing under the same id.
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.sent === true) clearBody();
  }
  const chosenIds = useRef<string[]>([]);
  useEffect(() => {
    chosenIds.current = chosen.map((item) => item.id);
  });
  const { setMeta } = queue;
  useEffect(() => {
    if (state.sent !== true) return;
    if (state.messageId !== undefined) {
      for (const itemId of chosenIds.current) setMeta(itemId, { hold: false, messageId: state.messageId });
    }
    const next = newUploadId();
    keepMessageId(conversationId, next);
    if (messageIdRef.current !== null) messageIdRef.current.value = next;
  }, [state, conversationId, setMeta]);

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
    const room = MAX_ATTACHMENTS - chosen.length;
    const files = [...list].slice(0, Math.max(0, room));
    for (const file of files) {
      const bad = validateAttachment(file);
      if (bad !== null) {
        setProblem(bad);
        return;
      }
    }
    setProblem(list.length > room ? `Cel mult ${MAX_ATTACHMENTS} imagini pe mesaj.` : null);
    if (files.length > 0) queue.add(files, { hold: true });
  }

  return (
    <KeepingForm
      ref={formRef}
      action={action}
      resetOn={state.sent === true ? state : null}
      className="sticky bottom-[var(--bottom-bar,0px)] z-10 border-t border-border bg-background px-3 py-3 sm:px-0"
    >
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input ref={messageIdRef} type="hidden" name="message_id" defaultValue="" />
      <input type="hidden" name="attachment_count" value={chosen.length} />

      {offline ? <p className="mb-2 text-small font-medium text-foreground">{c.offline}</p> : null}

      {going.length > 0 ? (
        <div className="mb-2 flex flex-col gap-2" data-attachments-going={going.length}>
          {going.map((item) => (
            <UploadLine
              key={item.id}
              item={item}
              preview={queue.previewOf(item.id)}
              onRetry={queue.retry}
              onDiscard={queue.discard}
            />
          ))}
        </div>
      ) : null}

      {chosen.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2" data-attachments-chosen={chosen.length}>
          {chosen.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-input border border-border p-1.5 pr-2.5">
              <Thumbnail item={item} preview={queue.previewOf(item.id)} />
              <span className="flex flex-col">
                <span className="max-w-[10rem] truncate text-small">{item.name}</span>
                <button
                  type="button"
                  onClick={() => queue.discard(item.id)}
                  className="text-left text-small text-muted underline underline-offset-4"
                >
                  {c.attachRemove}
                </button>
              </span>
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
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            data-attachment-input
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
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
