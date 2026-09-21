import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { OfferThread } from '@/components/offers/offer-thread';
import { WithdrawOffer } from '@/components/offers/withdraw-offer';
import { buttonClasses } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { requireAccountContext } from '@/lib/auth/account';
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_ORDER,
  formatDay,
  formatMoney,
  isLive,
  isUrgent,
  timeLeft,
  type OfferStatus,
} from '@/lib/offers';
import { loadMyOffers, loadOfferThread, type MyOffer, type OfferBox } from '@/lib/offers-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: offersCopy.meta.title };
export const dynamic = 'force-dynamic';

const TONES = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
  expired: 'neutral',
} as const;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text !== '' ? text : null;
}

function parseBox(value: string | null, canSend: boolean): OfferBox {
  if (value === 'primite') return 'primite';
  if (value === 'trimise') return 'trimise';
  return canSend ? 'trimise' : 'primite';
}

function parseStatus(value: string | null): OfferStatus | null {
  return (OFFER_STATUS_ORDER as readonly string[]).includes(value ?? '')
    ? (value as OfferStatus)
    : null;
}

/**
 * „Oferte", both directions in one place.
 *
 * A firm that both carries and forwards sends and receives on the same
 * day, so the two are tabs rather than two pages. Which tab opens first
 * is decided by what the account does: a carrier lands on „Trimise", a
 * private client on „Primite".
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await requireAccountContext(ROUTES.accountOffers);
  const params = await searchParams;

  const company = context.activeCompany;
  const canSend = company !== null;
  const box = parseBox(one(params, 'cutie'), canSend);
  const status = parseStatus(one(params, 'stare'));

  const all = await loadMyOffers(box, status);

  // A deep link from an e-mail about one offer opens that offer, not a
  // list of twelve with it somewhere inside.
  const only = one(params, 'oferta');
  const offers = only === null ? all : all.filter((offer) => offer.id === only);

  // The threads of the live offers, fetched together: a list of six
  // would otherwise be six round trips opened one at a time.
  const threads = new Map(
    await Promise.all(
      offers
        .filter((offer) => offer.conversation_id !== null)
        .map(async (offer) => [offer.id, await loadOfferThread(offer.id)] as const),
    ),
  );

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={offersCopy.meta.title} actions={[]} />

      <nav aria-label="Cutii" className="flex flex-wrap gap-1.5">
        {canSend ? (
          <Tab href={`${ROUTES.accountOffers}?cutie=trimise`} label="Trimise" active={box === 'trimise'} />
        ) : null}
        <Tab href={`${ROUTES.accountOffers}?cutie=primite`} label="Primite" active={box === 'primite'} />
      </nav>

      <nav aria-label="Stare" className="flex flex-wrap gap-1.5">
        <Tab href={`${ROUTES.accountOffers}?cutie=${box}`} label="Toate" active={status === null} small />
        {OFFER_STATUS_ORDER.map((value) => (
          <Tab
            key={value}
            href={`${ROUTES.accountOffers}?cutie=${box}&stare=${value}`}
            label={OFFER_STATUS_LABELS[value]}
            active={status === value}
            small
          />
        ))}
      </nav>

      {only !== null && offers.length > 0 ? (
        <p className="text-sm">
          <Link href={`${ROUTES.accountOffers}?cutie=${box}`} className="underline underline-offset-4">
            Vezi toate ofertele
          </Link>
        </p>
      ) : null}

      {offers.length === 0 ? (
        <Card className="p-6">
          <h2 className="text-[1.0625rem]">
            {box === 'trimise' ? offersCopy.sent.empty : offersCopy.received.empty}
          </h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">
            {box === 'trimise' ? offersCopy.sent.emptyBody : offersCopy.received.emptyBody}
          </p>
          {box === 'trimise' ? (
            <Link href={ROUTES.requests} className={`${buttonClasses('primary', 'md')} mt-5`}>
              {offersCopy.sent.emptyAction}
            </Link>
          ) : null}
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {offers.map((offer) => (
            <Row
              key={offer.id}
              offer={offer}
              box={box}
              messages={threads.get(offer.id) ?? []}
              now={now}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  offer,
  box,
  messages,
  now,
}: {
  offer: MyOffer;
  box: OfferBox;
  messages: Awaited<ReturnType<typeof loadOfferThread>>;
  now: Date;
}) {
  const urgent = isUrgent(offer.valid_until, now);

  return (
    <li className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem]">
            <Link href={requestRoute(offer.request_id)} className="underline underline-offset-4">
              {offer.request_title ?? `${offer.from_city} — ${offer.to_city}`}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {offer.from_city} — {offer.to_city} · încărcare de la {formatDay(offer.loading_from)}
          </p>
          {offer.counterparty !== null ? (
            <p className="mt-0.5 text-sm text-muted">{offer.counterparty}</p>
          ) : null}
        </div>

        <div className="text-right">
          <p className="font-display text-[1.25rem] leading-none tabular-nums">
            {formatMoney(offer.price_amount, offer.currency)}
          </p>
          <p className="mt-1.5">
            <StatusBadge tone={TONES[offer.status]}>
              {OFFER_STATUS_LABELS[offer.status]}
            </StatusBadge>
          </p>
          {isLive(offer.status) ? (
            <p className={cn('mt-1 text-xs', urgent ? 'text-danger' : 'text-muted')}>
              {timeLeft(offer.valid_until, now)}
            </p>
          ) : null}
        </div>
      </div>

      {offer.status === 'accepted' ? (
        <div className="mt-4 rounded-card border border-success/45 bg-success/8 p-4">
          <p className="text-sm font-medium">{offersCopy.sent.accepted}</p>
          <p className="mt-1 max-w-[62ch] text-sm">{offersCopy.sent.acceptedBody}</p>
          {offer.transport_id !== null ? (
            <p className="mt-2 text-sm">
              <Link
                href={`${ROUTES.accountTransports}/${offer.transport_id}`}
                className="underline underline-offset-4"
              >
                {offersCopy.sent.seeOrder}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {box === 'trimise' && isLive(offer.status) ? (
          <WithdrawOffer offerId={offer.id} />
        ) : null}
        {box === 'trimise' && !isLive(offer.status) && offer.status !== 'accepted' ? (
          <Link href={requestRoute(offer.request_id)} className={buttonClasses('secondary', 'sm')}>
            {offersCopy.sent.again}
          </Link>
        ) : null}
        {offer.unread_messages > 0 ? (
          <StatusBadge tone="warning">
            {offer.unread_messages === 1
              ? 'Un mesaj nou'
              : `${offer.unread_messages} mesaje noi`}
          </StatusBadge>
        ) : null}
      </div>

      <OfferThread offerId={offer.id} messages={messages} />
    </li>
  );
}

function Tab({
  href,
  label,
  active,
  small = false,
}: {
  href: string;
  label: string;
  active: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-pill border',
        small ? 'px-3 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        active
          ? 'border-foreground bg-foreground text-white'
          : 'border-border text-muted hover:border-border-strong',
      )}
    >
      {label}
    </Link>
  );
}
