'use client';

import { useActionState, useId, useState } from 'react';
import {
  hideRatingAction,
  hideRatingReplyAction,
  unhideRatingAction,
  type RatingState,
} from '@/app/cont/evaluari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ratingsCopy } from '@/content/evaluari';

const EMPTY: RatingState = {};

type Kind = 'hide' | 'unhide' | 'hideReply';

const ACTIONS = {
  hide: hideRatingAction,
  unhide: unhideRatingAction,
  hideReply: hideRatingReplyAction,
} as const;

const WORDS: Record<Kind, { open: string; title: string; hint?: string; submit: string }> = {
  hide: {
    open: ratingsCopy.admin.hide.title,
    title: ratingsCopy.admin.hide.title,
    hint: ratingsCopy.admin.hide.lede,
    submit: ratingsCopy.admin.hide.submit,
  },
  unhide: {
    open: ratingsCopy.admin.unhide.title,
    title: ratingsCopy.admin.unhide.title,
    submit: ratingsCopy.admin.unhide.submit,
  },
  hideReply: {
    open: ratingsCopy.admin.hideReply.action,
    title: ratingsCopy.admin.hideReply.action,
    submit: ratingsCopy.admin.hide.submit,
  },
};

/**
 * Cele trei decizii de moderare, într-un singur formular.
 *
 * Toate trei cer un motiv, toate trei ajung în jurnal, și niciuna nu
 * schimbă un cuvânt din ce a scris omul. Un singur component pentru că
 * altfel ar fi trei care uită, pe rând, câte ceva din cele trei.
 */
export function ModerateRating({
  kind,
  ratingId,
  replyId,
}: {
  kind: Kind;
  ratingId?: string;
  replyId?: string;
}) {
  const [state, action, pending] = useActionState(ACTIONS[kind], EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();
  const words = WORDS[kind];

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[0.75rem] text-muted underline underline-offset-4 hover:text-foreground"
      >
        {words.open}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3"
    >
      {ratingId !== undefined ? <input type="hidden" name="rating_id" value={ratingId} /> : null}
      {replyId !== undefined ? <input type="hidden" name="reply_id" value={replyId} /> : null}

      <label htmlFor={`${id}-reason`} className="text-[0.8125rem] font-medium">
        {words.title}
      </label>
      {words.hint !== undefined ? <p className="text-xs text-muted">{words.hint}</p> : null}
      <input
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      />
      <p className="text-[0.6875rem] text-muted">{ratingsCopy.admin.hide.reasonHint}</p>
      <FormError>{state.fieldErrors?.reason}</FormError>

      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {words.submit}
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
