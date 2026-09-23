import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HideMessage } from '@/components/admin/hide-message';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, myRequestRoute, requestRoute, transportRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { offersCopy } from '@/content/oferte';
import { OFFER_STATUS_LABELS, formatDay, formatMoney } from '@/lib/offers';
import { loadAdminOffer } from '@/lib/offers-admin-source';
import { loadOfferThread } from '@/lib/offers-source';

export const dynamic = 'force-dynamic';

const c = offersCopy.admin.detail;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-small text-muted sm:w-[12rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * One offer, for the team.
 *
 * Everything the two parties see, plus who they are and what came of it.
 * `admin_offer()` and `offer_thread()` both begin by checking
 * `is_platform_admin()`, so the layout's staff guard is the convenience
 * and the functions are the rule.
 *
 * Nothing on this page changes an offer. The single button hides one
 * message, and it asks for a reason that goes into `audit_log`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await loadAdminOffer(id);
  if (offer === null) notFound();

  const thread = await loadOfferThread(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href={ROUTES.adminOffers} className="text-muted underline-offset-4 hover:underline">
            ← {c.back}
          </Link>
        </p>
        <EyebrowPill>{offersCopy.admin.eyebrow}</EyebrowPill>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-h2">
          {formatMoney(offer.price_amount, offer.currency)}
          <StatusBadge tone={offer.status === 'accepted' ? 'success' : 'neutral'}>
            {OFFER_STATUS_LABELS[offer.status]}
          </StatusBadge>
        </h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.readOnly}</p>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-h3">{c.terms}</h2>
        <dl className="mt-4 flex flex-col">
          <Row label={c.sentAt}>{new Date(offer.created_at).toLocaleString('ro-RO')}</Row>
          <Row label={c.validUntil}>
            {offer.valid_until === null
              ? '—'
              : new Date(offer.valid_until).toLocaleString('ro-RO')}
          </Row>
          {offer.expired_at !== null ? (
            <Row label={c.expiredAt}>{new Date(offer.expired_at).toLocaleString('ro-RO')}</Row>
          ) : null}
          <Row label={offersCopy.received.pickup}>
            {offer.estimated_pickup_date === null
              ? offersCopy.received.noDate
              : formatDay(offer.estimated_pickup_date)}
          </Row>
          <Row label={offersCopy.received.delivery}>
            {offer.estimated_delivery_date === null
              ? offersCopy.received.noDate
              : formatDay(offer.estimated_delivery_date)}
          </Row>
          {offer.payment_term_days !== null ? (
            <Row label={offersCopy.form.paymentTerm}>{offer.payment_term_days}</Row>
          ) : null}
          {offer.vehicle_plate !== null ? (
            <Row label={c.vehicle}>{offer.vehicle_plate}</Row>
          ) : null}
          {offer.conditions !== null ? (
            <Row label={offersCopy.received.conditions}>
              <span className="whitespace-pre-line">{offer.conditions}</span>
            </Row>
          ) : null}
          {offer.message !== null ? (
            <Row label={offersCopy.form.message}>
              <span className="whitespace-pre-line">{offer.message}</span>
            </Row>
          ) : null}
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-h3">{c.parties}</h2>
        <dl className="mt-4 flex flex-col">
          <Row label={c.carrier}>
            {offer.company_name ?? offersCopy.admin.list.individual}
            {offer.bidder_name !== null ? (
              <span className="block text-xs text-muted">{offer.bidder_name}</span>
            ) : null}
          </Row>
          <Row label={c.client}>
            {offer.client_company ?? offer.client_name ?? '—'}
            {offer.client_company !== null && offer.client_name !== null ? (
              <span className="block text-xs text-muted">{offer.client_name}</span>
            ) : null}
          </Row>
          <Row label={c.request}>
            {offer.request_id === null ? (
              offersCopy.admin.list.noRequest
            ) : (
              <>
                <span>
                  {offer.from_city} → {offer.to_city}
                </span>
                {offer.loading_from !== null ? (
                  <span className="text-muted"> · {formatDay(offer.loading_from)}</span>
                ) : null}
                <span className="mt-1 flex flex-wrap gap-3 text-xs">
                  <Link href={requestRoute(offer.request_id)} className="underline underline-offset-4">
                    {requestsCopy.card.open}
                  </Link>
                  <Link
                    href={myRequestRoute(offer.request_id)}
                    className="text-muted underline underline-offset-4"
                  >
                    {offersCopy.received.title}
                  </Link>
                </span>
              </>
            )}
          </Row>
          {offer.request_status !== null ? (
            <Row label={c.requestStatus}>
              {requestsCopy.status[offer.request_status as keyof typeof requestsCopy.status] ??
                offer.request_status}
            </Row>
          ) : null}
          <Row label={c.transport}>
            {offer.transport_id === null ? (
              <span className="text-muted">{c.noTransport}</span>
            ) : (
              <Link
                href={transportRoute(offer.transport_id)}
                className="underline underline-offset-4"
              >
                {offer.transport_id}
              </Link>
            )}
          </Row>
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-h3">{c.thread}</h2>
        {thread.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{c.threadEmpty}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {thread.map((message) => (
              <li key={message.id} className="border-b border-border pb-4 last:border-b-0 last:pb-0">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small">
                  <span className="font-medium">{message.sender_name}</span>
                  <span className="text-muted">
                    {new Date(message.created_at).toLocaleString('ro-RO')}
                  </span>
                  {message.was_masked ? (
                    <StatusBadge tone="warning">{c.masked}</StatusBadge>
                  ) : null}
                  {message.is_hidden ? (
                    <StatusBadge tone="danger">{c.hiddenBadge}</StatusBadge>
                  ) : null}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm">{message.body}</p>
                {message.is_hidden ? null : (
                  <div className="mt-2">
                    <HideMessage messageId={message.id} offerId={offer.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
