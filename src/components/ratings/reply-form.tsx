'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { draftKey } from '@/lib/continuity/drafts';
import { useTextDraft } from '@/lib/continuity/use-text-draft';
import { replyToRatingAction, type RatingState } from '@/app/cont/evaluari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ratingsCopy } from '@/content/evaluari';
import { MAX_COMMENT, charsLeft } from '@/lib/ratings';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: RatingState = {};

function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const c = ratingsCopy.reply;

/** Răspunsul firmei evaluate. Unul singur, și rămâne cum a fost scris. */
export function ReplyForm({ ratingId, slug }: { ratingId: string; slug: string | null }) {
  const [state, action, pending] = useKeptActionState(replyToRatingAction, EMPTY);
  // Kept while it is written; a reply half-written before a refresh opens
  // the form by itself with the words in it.
  const [body, setBody, clearBody] = useTextDraft(draftKey('raspuns', ratingId));
  const [chosen, setOpen] = useState<boolean | null>(null);
  // Opened from the e-mail about this rating: the form is already open.
  const linked = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash === `#evaluare-${ratingId}`,
    () => false,
  );
  const open = chosen ?? (body !== '' || linked);
  const id = useId();
  const sent = state.notice !== undefined;
  useEffect(() => {
    if (sent) clearBody();
  }, [sent, clearBody]);

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonClasses('secondary', 'sm')} mt-3`}
      >
        {c.title}
      </button>
    );
  }

  return (
    <KeepingForm action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="rating_id" value={ratingId} />
      {slug !== null ? <input type="hidden" name="slug" value={slug} /> : null}

      <label htmlFor={`${id}-body`} className="text-body font-medium">
        {c.body}
      </label>
      <p className="text-small text-muted">{c.hint}</p>
      <textarea
        id={`${id}-body`}
        name="body"
        rows={3}
        required
        maxLength={MAX_COMMENT}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
      />
      <p className="text-small text-muted">{ratingsCopy.form.charsLeft(charsLeft(body))}</p>
      <FormError>{state.fieldErrors?.body}</FormError>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? c.submitting : c.submit}
        </button>
        <button
          type="button"
          onClick={() => {
            // „Renunță" is a decision about the words, not only the box.
            clearBody();
            setOpen(false);
          }}
          className={buttonClasses('secondary', 'sm')}
        >
          Renunță
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
