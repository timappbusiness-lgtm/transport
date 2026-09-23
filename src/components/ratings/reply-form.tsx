'use client';

import { useActionState, useId, useState } from 'react';
import { replyToRatingAction, type RatingState } from '@/app/cont/evaluari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ratingsCopy } from '@/content/evaluari';
import { MAX_COMMENT, charsLeft } from '@/lib/ratings';

const EMPTY: RatingState = {};
const c = ratingsCopy.reply;

/** Răspunsul firmei evaluate. Unul singur, și rămâne cum a fost scris. */
export function ReplyForm({ ratingId, slug }: { ratingId: string; slug: string | null }) {
  const [state, action, pending] = useActionState(replyToRatingAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const id = useId();

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
    <form action={action} className="mt-3 flex flex-col gap-2">
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
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          Renunță
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
