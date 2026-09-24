'use client';

import { successCopy } from '@/content/success';
import { SuccessMoment } from '@/components/ui/success-moment';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  acceptOfferAction,
  rejectOfferAction,
  type OfferState,
} from '@/app/cont/oferte/actions';
import { OfferThread } from '@/components/offers/offer-thread';
import { OrderContacts } from '@/components/offers/order-contacts';
import { buttonClasses } from '@/components/ui/button';
import { Figure, StatusBadge } from '@/components/ui/primitives';
import { IconLabel } from '@/components/ui/icon';
import { iconForContent } from '@/lib/icons';
import { ReputationInline } from '@/components/ratings/reputation-block';
import { companyRoute } from '@/config/routes';
import { ratingsCopy } from '@/content/evaluari';
import { DEFAULT_THRESHOLDS, publicAverage } from '@/lib/ratings';
import { offersCopy } from '@/content/oferte';
import {
  COMPARE_LIMIT,
  OFFER_STATUS_LABELS,
  SORT_LABELS,
  formatDay,
  formatMoney,
  isLive,
  isUrgent,
  sortOffers,
  timeLeft,
  type OfferSort,
} from '@/lib/offers';
import type { OfferForRequest, ThreadMessage } from '@/lib/offers-source';
import { VEHICLE_TYPE_LABELS } from '@/lib/vehicles';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OfferState = {};
const c = offersCopy.received;

/**
 * The publication threshold, as the card applies it.
 *
 * The real one is `rating_settings.min_public_ratings`, which this is a
 * client component and cannot read. The default is the same number in
 * both places and a unit test compares them; what this cannot do is
 * follow a change made in the settings until the page is reloaded, which
 * for a threshold that moves once a year is the right trade.
 */
const MIN_PUBLIC_RATINGS = DEFAULT_THRESHOLDS.minPublicRatings;

/**
 * „Oferte primite", which replaces the placeholder that has sat on the
 * request page since phase 2.
 *
 * Sorted by price by default because that is the question people open
 * the list with, and comparable side by side on a wide screen because
 * four cards of nine fields each are not comparable by scrolling.
 */
export function ReceivedOffers({
  listingId,
  offers,
  threads,
  now,
}: {
  listingId: string;
  offers: readonly OfferForRequest[];
  threads: Record<string, ThreadMessage[]>;
  /** The snapshot's clock, so countdowns are stable across a render. */
  now: string;
}) {
  // The order is in the address (`?ordine=livrare`), so it survives a
  // refresh, the way back from a carrier's profile and a shared link.
  // It used to be component state, and every one of those reset it.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get('ordine');
  const sort: OfferSort = fromUrl !== null && fromUrl in SORT_LABELS ? (fromUrl as OfferSort) : 'pret';
  function setSort(next: OfferSort) {
    const params = new URLSearchParams(window.location.search);
    if (next === 'pret') params.delete('ordine');
    else params.set('ordine', next);
    const query = params.toString();
    window.history.replaceState(null, '', `${pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`);
  }
  const [comparing, setComparing] = useState(false);

  const live = offers.filter((offer) => isLive(offer.status));
  const settled = offers.filter((offer) => !isLive(offer.status));
  const accepted = offers.find((offer) => offer.status === 'accepted');
  const sorted = sortOffers(live, sort);
  const clock = new Date(now);

  if (offers.length === 0) {
    return (
      <EmptyState title={c.empty} body={c.emptyBody} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {accepted !== undefined ? <AcceptedNote offer={accepted} /> : null}

      {live.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-body">
            {c.sortBy}
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as OfferSort)}
              className="rounded-input border border-border-strong bg-surface px-3 py-1.5 text-body"
            >
              {(Object.keys(SORT_LABELS) as OfferSort[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          {/* Hidden on a phone: five columns at 390px is not a
              comparison, it is a horizontal scrollbar. */}
          <button
            type="button"
            onClick={() => setComparing((value) => !value)}
            className={cn(buttonClasses('secondary', 'sm'), 'hidden lg:inline-flex')}
          >
            {comparing ? c.closeCompare : c.compare}
          </button>
        </div>
      ) : null}

      {comparing ? <CompareTable offers={sorted.slice(0, COMPARE_LIMIT)} /> : null}

      <ul className="flex flex-col gap-4">
        {sorted.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            listingId={listingId}
            messages={threads[offer.id] ?? []}
            now={clock}
            canAct={accepted === undefined}
          />
        ))}
      </ul>

      {settled.length > 0 ? (
        <details className="rounded-card border border-border bg-surface p-4">
          <summary className="cursor-pointer text-body text-muted">
            {settled.length === 1
              ? 'O ofertă închisă'
              : `${settled.length} oferte închise`}
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {settled.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-baseline justify-between gap-2 text-body">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {offer.company_name ?? 'Transportator'}
                </span>
                <span className="text-muted">
                  {formatMoney(offer.price_amount, offer.currency)} ·{' '}
                  {OFFER_STATUS_LABELS[offer.status]}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function AcceptedNote({ offer }: { offer: OfferForRequest }) {
  // The third moment, on the client's side. The next action is the
  // telephone, so the contacts are the first thing under the sentence.
  return (
    <SuccessMoment
      as="h3"
      title={successCopy.offerAccepted.title}
      body={successCopy.offerAccepted.body}
    >
      <p className="flex flex-wrap items-center gap-2 text-body">
        <StatusBadge tone="success">{offersCopy.accept.done}</StatusBadge>
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {offer.company_name} ·{' '}
          <span className="font-mono font-medium tabular-nums text-accent">
            {formatMoney(offer.price_amount, offer.currency)}
          </span>
        </span>
      </p>
      <div className="mt-4 max-w-[26rem]">
        <OrderContacts offerId={offer.id} />
      </div>

      <p className="mt-4 text-body font-medium">{offersCopy.accept.nextSteps}</p>
      <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
        {offersCopy.accept.steps.map((step) => (
          <li key={step} className="text-body text-muted">
            {step}
          </li>
        ))}
      </ol>
    </SuccessMoment>
  );
}

function OfferCard({
  offer,
  listingId,
  messages,
  now,
  canAct,
}: {
  offer: OfferForRequest;
  listingId: string;
  messages: readonly ThreadMessage[];
  now: Date;
  canAct: boolean;
}) {
  const [acceptState, accept, accepting] = useKeptActionState(acceptOfferAction, EMPTY);
  const [rejectState, reject, rejecting] = useKeptActionState(rejectOfferAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  const urgent = isUrgent(offer.valid_until, now);

  return (
    <li className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3">
            {/* A firm, not a seal: `iconForContent('firma')` is a plain
                building. The verification badge below is a word, which
                is what `docs/13-iconuri.md` requires — nothing beside a
                company name may look like a mark it earned. */}
            <IconLabel as={iconForContent('firma')} size="md" tone="strong" wrap>
              {offer.company_name ?? 'Transportator'}
            </IconLabel>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-small">
            {offer.company_verified === true ? (
              <StatusBadge tone="success">{c.verified}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">{c.notVerified}</StatusBadge>
            )}
            {offer.company_verified_at !== null ? (
              <span className="text-muted">
                {c.verifiedOn(new Date(offer.company_verified_at).toLocaleDateString('ro-RO'))}
              </span>
            ) : null}
          </p>
          <p className="mt-1">
            <ReputationInline
              rep={{
                ratingAvg: offer.company_rating_avg,
                ratingCount: offer.company_rating_count,
                completedAsCarrier: offer.company_completed,
                punctualityPct: offer.company_punctuality,
              }}
              minPublic={MIN_PUBLIC_RATINGS}
            />
          </p>
          {offer.company_slug !== null ? (
            <p className="mt-1.5 text-body">
              <Link
                href={companyRoute(offer.company_slug)}
                className="link-accent"
              >
                {c.profile}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="text-right">
          {/* The key number of the comparison: accent while the offer can
              still be taken, ink once it is history. */}
          <Figure as="p" size="md" tone={isLive(offer.status) || offer.status === 'accepted' ? 'accent' : 'plain'}>
            {formatMoney(offer.price_amount, offer.currency)}
          </Figure>
          <p className={cn('mt-1 text-small', urgent ? 'text-danger' : 'text-muted')}>
            {timeLeft(offer.valid_until, now)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-body sm:grid-cols-3">
        <Cell label={c.pickup} value={offer.estimated_pickup_date} />
        <Cell label={c.delivery} value={offer.estimated_delivery_date} />
        <div>
          {/* The type, not the plate. What a client is choosing between
              is „platformă închisă" and „platformă deschisă" — the
              registration number tells them nothing at this point and
              is operational detail. It appears on the order, where it
              is what somebody at the loading point checks against. */}
          <dt className="text-small text-muted">{c.vehicle}</dt>
          <dd className="mt-0.5">
            {offer.vehicle_type === null
              ? '—'
              : (VEHICLE_TYPE_LABELS[offer.vehicle_type as keyof typeof VEHICLE_TYPE_LABELS] ??
                offer.vehicle_type)}
          </dd>
        </div>
      </dl>

      {offer.conditions !== null ? (
        <div className="mt-4">
          <p className="text-small text-muted">{c.conditions}</p>
          <p className="mt-1 whitespace-pre-line break-words text-body">{offer.conditions}</p>
        </div>
      ) : null}

      {offer.payment_term_days !== null ? (
        <p className="mt-2 text-body text-muted">{c.paymentTerm(offer.payment_term_days)}</p>
      ) : null}

      {offer.message !== null ? (
        <p className="mt-3 whitespace-pre-line break-words text-body">{offer.message}</p>
      ) : null}

      {canAct ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {confirming ? (
            <KeepingForm action={accept} className="w-full rounded-card border border-border bg-ground-alt p-4">
              <input type="hidden" name="offer_id" value={offer.id} />
              <input type="hidden" name="listing_id" value={listingId} />
              <p className="text-body font-medium">{offersCopy.accept.title}</p>
              <p className="mt-2 text-body">
                {formatMoney(offer.price_amount, offer.currency)}
                {offer.estimated_pickup_date !== null
                  ? ` · ridicare ${formatDay(offer.estimated_pickup_date)}`
                  : ''}
                {offer.estimated_delivery_date !== null
                  ? ` · livrare ${formatDay(offer.estimated_delivery_date)}`
                  : ''}
              </p>
              {offer.conditions !== null ? (
                <p className="mt-1 whitespace-pre-line break-words text-body text-muted">{offer.conditions}</p>
              ) : null}
              <p className="mt-2 text-body text-muted">{offersCopy.accept.body}</p>
              <p className="mt-1 text-body text-muted">{offersCopy.accept.others}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={accepting}
                  className={buttonClasses('primary', 'sm')}
                >
                  {accepting ? offersCopy.accept.confirming : offersCopy.accept.confirm}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-body text-muted underline underline-offset-4"
                >
                  {offersCopy.accept.cancel}
                </button>
              </div>
            </KeepingForm>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={buttonClasses('primary', 'sm')}
              >
                {c.accept}
              </button>
              <KeepingForm action={reject}>
                <input type="hidden" name="offer_id" value={offer.id} />
                <input type="hidden" name="listing_id" value={listingId} />
                <button
                  type="submit"
                  disabled={rejecting}
                  className={buttonClasses('secondary', 'sm')}
                >
                  {c.reject}
                </button>
              </KeepingForm>
            </>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        <OfferThread offerId={offer.id} messages={messages} />
      </div>

      {acceptState.error !== undefined || rejectState.error !== undefined ? (
        <p role="alert" className="mt-3 text-body text-danger">
          {acceptState.error ?? rejectState.error}
        </p>
      ) : null}
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-small text-muted">{label}</dt>
      <dd className="mt-0.5">{value === null ? c.noDate : formatDay(value)}</dd>
    </div>
  );
}

/**
 * Up to five offers side by side.
 *
 * A table, because that is what a comparison is, and it scrolls inside
 * itself rather than pushing the page sideways.
 */
function CompareTable({ offers }: { offers: readonly OfferForRequest[] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface p-4">
      <p className="mb-3 text-body font-medium">{offersCopy.received.compareTitle}</p>
      <table className="w-full min-w-[40rem] text-left text-body">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-1 pr-3 font-normal">Firmă</th>
            <th scope="col" className="py-1 pr-3 font-normal">Preț</th>
            <th scope="col" className="py-1 pr-3 font-normal">Evaluare</th>
            <th scope="col" className="py-1 pr-3 font-normal">{c.pickup}</th>
            <th scope="col" className="py-1 pr-3 font-normal">{c.delivery}</th>
            <th scope="col" className="py-1 font-normal">{c.conditions}</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id} className="border-t border-border align-top">
              <th scope="row" className="py-2 pr-3 font-normal">
                {offer.company_name ?? 'Transportator'}
              </th>
              <td className="py-2 pr-3 tabular-nums">
                {formatMoney(offer.price_amount, offer.currency)}
              </td>
              <td className="py-2 pr-3">
                {publicAverage(
                  {
                    ratingAvg: offer.company_rating_avg,
                    ratingCount: offer.company_rating_count,
                  },
                  MIN_PUBLIC_RATINGS,
                ) ?? <span className="text-muted">{ratingsCopy.profile.tooFew}</span>}
              </td>
              <td className="py-2 pr-3">
                {offer.estimated_pickup_date === null
                  ? c.noDate
                  : formatDay(offer.estimated_pickup_date)}
              </td>
              <td className="py-2 pr-3">
                {offer.estimated_delivery_date === null
                  ? c.noDate
                  : formatDay(offer.estimated_delivery_date)}
              </td>
              <td className="py-2 text-muted">{offer.conditions ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
