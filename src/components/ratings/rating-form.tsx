'use client';

import { useActionState, useId, useState } from 'react';
import { editRatingAction, postRatingAction, type RatingState } from '@/app/cont/evaluari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { Stars, StarInput } from '@/components/ratings/star-input';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ratingsCopy } from '@/content/evaluari';
import { MAX_COMMENT, charsLeft, editWindowLeft, subScoresFor, type RatingSide } from '@/lib/ratings';
import type { OrderRatingState } from '@/lib/ratings-source';

const EMPTY: RatingState = {};
const c = ratingsCopy.form;

/**
 * Formularul de evaluare, cu previzualizare.
 *
 * Previzualizarea nu este decor: evaluarea este publică și aproape
 * definitivă, iar „așa va apărea pe profil" este singurul moment în care
 * cineva își vede propriile cuvinte cu ochii celui care le va citi.
 * Butonul de trimis stă și pe previzualizare, ca să nu fie nevoie de
 * întors.
 */
export function RatingForm({
  orderId,
  side,
  slug,
  existing,
}: {
  orderId: string;
  side: RatingSide;
  slug: string | null;
  /** Evaluarea deja dată, când formularul este o corectură. */
  existing?: OrderRatingState;
}) {
  const editing = existing?.rating_id != null;
  const [state, action, pending] = useActionState(
    editing ? editRatingAction : postRatingAction,
    EMPTY,
  );
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [preview, setPreview] = useState(false);
  const [score, setScore] = useState<number | null>(existing?.score ?? null);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  const left =
    editing && existing?.edit_deadline
      ? editWindowLeft(existing.edit_deadline, 0, new Date())
      : null;

  return (
    <Card className="p-5">
      <h2 className="text-h3">
        {editing ? c.editTitle : side === 'client' ? c.title : c.titleCarrier}
      </h2>
      {editing ? <p className="mt-1 text-small text-muted">{c.editHint}</p> : null}

      <form action={action} className="mt-4 flex flex-col gap-5">
        <input type="hidden" name="order_id" value={orderId} />
        {slug !== null ? <input type="hidden" name="slug" value={slug} /> : null}
        {editing ? <input type="hidden" name="rating_id" value={existing.rating_id ?? ''} /> : null}

        <div className={preview ? 'hidden' : 'contents'}>
          <StarInput
            name="score"
            label={c.score}
            hint={c.scoreHint}
            required
            defaultValue={existing?.score ?? null}
            onPick={setScore}
            {...(state.fieldErrors?.score ? { error: state.fieldErrors.score } : {})}
          />

          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <p className="text-body font-medium">{c.subScores}</p>
            {subScoresFor(side).map((sub) => (
              <StarInput
                key={sub.key}
                name={sub.key}
                label={sub.label}
                size="sm"
                defaultValue={(existing?.[sub.key] as number | null) ?? null}
                {...(state.fieldErrors?.[sub.key] ? { error: state.fieldErrors[sub.key] } : {})}
              />
            ))}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <label htmlFor={`${id}-comment`} className="text-body font-medium">
              {c.comment}
            </label>
            <p className="text-small text-muted">{c.commentHint}</p>
            <textarea
              id={`${id}-comment`}
              name="comment"
              rows={4}
              maxLength={MAX_COMMENT}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
            />
            <p className="text-small text-muted">{c.charsLeft(charsLeft(comment))}</p>
            <FormError>{state.fieldErrors?.comment}</FormError>
          </div>
        </div>

        {preview ? (
          <div className="rounded-card border border-border bg-ground-alt p-4">
            <p className="text-small text-muted">{c.previewTitle}</p>
            <div className="mt-2">
              {score !== null ? <Stars score={score} /> : null}
              {comment.trim() !== '' ? (
                <p className="mt-2 whitespace-pre-line break-words text-body">{comment}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
            {pending ? c.submitting : editing ? c.editSubmit : c.submit}
          </button>
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className={buttonClasses('secondary', 'md')}
          >
            {preview ? c.back : c.preview}
          </button>
        </div>

        {left !== null ? <p className="text-small text-muted">{c.editable(left)}</p> : null}
        <FormError>{state.error}</FormError>
      </form>
    </Card>
  );
}
