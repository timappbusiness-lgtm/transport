'use client';

import { useActionState, useId, useState } from 'react';
import { reportRatingAction, type RatingState } from '@/app/cont/evaluari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ratingsCopy } from '@/content/evaluari';

const EMPTY: RatingState = {};
const c = ratingsCopy.report;

/**
 * Sesizarea unei evaluări.
 *
 * Scrie explicit că o evaluare nu se ascunde pentru că este mică. Un
 * buton de sesizare fără propoziția aia este un buton pe care oamenii îl
 * apasă de fiecare dată când primesc trei stele.
 */
export function ReportRating({ ratingId }: { ratingId: string }) {
  const [state, action, pending] = useActionState(reportRatingAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.action}
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3">
      <input type="hidden" name="rating_id" value={ratingId} />

      <label htmlFor={`${id}-reason`} className="text-small font-medium">
        {c.title}
      </label>
      <p className="text-xs text-muted">{c.hint}</p>
      <textarea
        id={`${id}-reason`}
        name="reason"
        rows={3}
        required
        minLength={10}
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
      />
      <FormError>{state.fieldErrors?.reason}</FormError>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {c.submit}
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
