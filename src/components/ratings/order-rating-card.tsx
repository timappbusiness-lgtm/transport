import Link from 'next/link';
import { RatingForm } from '@/components/ratings/rating-form';
import { Stars } from '@/components/ratings/star-input';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { ratingsCopy } from '@/content/evaluari';
import { blockedText, ratingDeadline, type RatingSide } from '@/lib/ratings';
import type { OrderRatingState } from '@/lib/ratings-source';

const c = ratingsCopy;

/**
 * Cardul de evaluare de pe pagina comenzii.
 *
 * Patru stări, și una dintre ele este întotdeauna adevărată: poți
 * evalua, ai evaluat și mai poți corecta, ai evaluat și nu mai poți, sau
 * nu poți și scrie de ce. Nu există a cincea stare, în care cardul
 * lipsește fără explicație — pentru cineva care tocmai a primit un
 * e-mail cu „evaluează transportul", un ecran mut este un ecran stricat.
 *
 * Staff nu evaluează: `order_rating_state()` le dă `side = null` și
 * cardul nu se desenează deloc.
 */
export function OrderRatingCard({
  orderId,
  state,
}: {
  orderId: string;
  state: OrderRatingState | null;
}) {
  if (state === null || state.side === null) return null;

  const side = state.side as RatingSide;
  const deadline = ratingDeadline(state.deadline);

  // Nu a evaluat și are voie.
  if (state.can_rate) {
    return (
      <div className="flex flex-col gap-2">
        {deadline !== null && !deadline.passed ? (
          <p className="text-[0.8125rem] text-muted">
            {c.list.deadline(deadline.at)} — {c.list.deadlineLeft(deadline.left)}
          </p>
        ) : null}
        <RatingForm orderId={orderId} side={side} slug={state.rated_company_slug} />
      </div>
    );
  }

  // A evaluat, și fereastra de corectură este încă deschisă.
  if (state.rating_id !== null && state.can_edit) {
    return (
      <RatingForm orderId={orderId} side={side} slug={state.rated_company_slug} existing={state} />
    );
  }

  // A evaluat, și nu mai poate schimba nimic.
  if (state.rating_id !== null) {
    return (
      <Card className="p-5">
        <h2 className="text-[1.0625rem]">{c.form.title}</h2>
        <div className="mt-3">
          {state.score !== null ? <Stars score={state.score} /> : null}
          {state.comment !== null ? (
            <p className="mt-2 whitespace-pre-line text-[0.9375rem]">{state.comment}</p>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-muted">{c.form.notEditable}</p>
        <Link
          href={`${ROUTES.accountRatings}?cutie=date`}
          className="mt-2 inline-block text-[0.8125rem] underline underline-offset-4"
        >
          {c.widget.action}
        </Link>
      </Card>
    );
  }

  // Nu poate, și scrie de ce.
  const why = blockedText(state.blocked_reason);
  if (why === null) return null;

  return (
    <Card className="p-5">
      <h2 className="text-[1.0625rem]">{c.form.title}</h2>
      <p className="mt-2 text-sm text-muted">{why}</p>
    </Card>
  );
}
