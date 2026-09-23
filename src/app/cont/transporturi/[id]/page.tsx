import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/app/top-bar';
import { HelpLink } from '@/components/help/help-link';
import { ReturnLeg } from '@/components/orders/return-leg';
import { OrderContacts } from '@/components/offers/order-contacts';
import {
  AssignCrew,
  CancelOrder,
  ConditionForm,
  ConfirmDelivery,
  ConfirmationCode,
  HandoverForm,
  NextStep,
  OpenDispute,
} from '@/components/orders/order-actions';
import { ComparisonView, EvidenceGallery } from '@/components/orders/evidence-gallery';
import { OrderTimeline } from '@/components/orders/order-timeline';
import { PhotoCapture } from '@/components/orders/photo-capture';
import { OrderRatingCard } from '@/components/ratings/order-rating-card';
import { buttonClasses } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, companyRoute, myRequestRoute, offerRoute, requestRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { messagesCopy } from '@/content/mesaje';
import { requireAccountContext } from '@/lib/auth/account';
import { formatMoney } from '@/lib/offers';
import { formatMoment, formatWindow, isFinished, orderStatusLabel } from '@/lib/orders';
import {
  countByKind,
  loadCrewOptions,
  loadDisputeReasons,
  loadEvidence,
  loadOrder,
  loadTimeline,
  signEvidence,
  signRequestPhotos,
} from '@/lib/orders-source';
import { loadOrderRatingState } from '@/lib/ratings-source';
import { loadOrderConversationId } from '@/lib/messages-source';

export const metadata: Metadata = { title: ordersCopy.detail.title };
export const dynamic = 'force-dynamic';

const c = ordersCopy.detail;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-small text-muted sm:w-[12rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * One order, for whichever of its four readers opened it.
 *
 * The page is the same for all of them and the differences come from
 * `my_side`, which the database decides — a client sees the
 * confirmation code and no capture flow, a driver sees the capture flow
 * and no code, a dispatcher sees the scheduling, and staff see
 * everything and may act on none of it except a dispute.
 *
 * Everything is read through RPCs that begin by asking
 * `can_see_order()`, so a page that forgot a check would get a refusal
 * rather than somebody else's transport.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccountContext(`${ROUTES.accountTransports}/${id}`);

  const order = await loadOrder(id);
  if (order === null) notFound();

  const [events, evidence, crew, reasons, rating] = await Promise.all([
    loadTimeline(id),
    loadEvidence(id),
    order.my_side === 'carrier' || order.my_side === 'staff'
      ? loadCrewOptions(id)
      : Promise.resolve([]),
    order.my_side === 'client' ? loadDisputeReasons() : Promise.resolve([]),
    // Staff get `side = null` back and the card draws nothing; asking
    // anyway keeps this list free of a condition that would then have to
    // agree with the one inside the card.
    loadOrderRatingState(id),
  ]);

  const conversationId = await loadOrderConversationId(id);

  const counts = countByKind(evidence);
  const paths = evidence.map((row) => row.file_path).filter((p): p is string => p !== null);
  const [urls, publicUrls] = await Promise.all([
    signEvidence(paths),
    signRequestPhotos(order.request_photos ?? []),
  ]);

  const now = new Date().toISOString();
  const side = order.my_side;
  const capturing =
    (side === 'driver' || side === 'carrier') &&
    (order.status === 'pickup_scheduled' || order.status === 'delivery_scheduled');
  const captureKind = order.status === 'pickup_scheduled' ? 'pickup_photo' : 'delivery_photo';

  const pickupPhotos = evidence.filter((row) => row.kind === 'pickup_photo');
  const deliveryPhotos = evidence.filter((row) => row.kind === 'delivery_photo');

  return (
    <div className="flex flex-col gap-6">
      <TopBar
        title={`${order.from_city ?? '—'} → ${order.to_city ?? '—'}`}
        crumbs={[{ href: ROUTES.accountTransports, label: ordersCopy.list.title }]}
        actions={[]}
      />

      <p className="flex flex-wrap gap-x-4">
        <HelpLink topic="order" />
        <HelpLink topic="proof" label="Cum se face dovada livrării" />
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={badgeTone(order.status)}>{orderStatusLabel(order.status)}</StatusBadge>
        {order.vehicle_flagged ? (
          <StatusBadge tone="warning">{ordersCopy.list.flagged}</StatusBadge>
        ) : null}
      </div>

      {order.status === 'disputed' ? <DisputeNote order={order} /> : null}
      {order.cancelled_at !== null ? (
        <Card className="border-danger/40 bg-danger/8 p-5">
          <p className="text-sm font-medium">{orderStatusLabel('cancelled')}</p>
          <p className="mt-1 text-sm">{order.cancel_reason}</p>
          <p className="mt-1 text-xs text-muted">{formatMoment(order.cancelled_at)}</p>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-6">
          <OrderTimeline
            status={order.status}
            events={events}
            autoCompleted={order.auto_completed}
          />

          {capturing ? (
            <Card className="p-5">
              <h2 className="text-h3">{ordersCopy.capture.title}</h2>
              <div className="mt-4 max-w-[26rem]">
                <PhotoCapture
                  orderId={order.id}
                  kind={captureKind}
                  count={counts[captureKind] ?? 0}
                  done={
                    order.status === 'pickup_scheduled' && (counts.condition_report ?? 0) === 0 ? (
                      <ConditionForm orderId={order.id} />
                    ) : order.status === 'delivery_scheduled' ? (
                      <HandoverForm orderId={order.id} />
                    ) : null
                  }
                />
              </div>
            </Card>
          ) : null}

          <ComparisonView
            title={ordersCopy.evidence.compareTitle}
            leftLabel={ordersCopy.evidence.fromClient}
            rightLabel={ordersCopy.evidence.kinds.pickup_photo ?? ''}
            left={order.request_photos ?? []}
            right={pickupPhotos}
            urls={urls}
            publicUrls={publicUrls}
          />
          <ComparisonView
            title={ordersCopy.evidence.compareDelivery}
            leftLabel={ordersCopy.evidence.kinds.pickup_photo ?? ''}
            rightLabel={ordersCopy.evidence.kinds.delivery_photo ?? ''}
            left={pickupPhotos}
            right={deliveryPhotos}
            urls={urls}
            publicUrls={publicUrls}
          />

          <EvidenceGallery rows={evidence} urls={urls} />
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {side === 'client' && order.confirmation_code !== null && !isFinished(order.status) ? (
            <ConfirmationCode code={order.confirmation_code} />
          ) : null}

          {order.status === 'vehicle_delivered' && side === 'client' ? (
            <>
              <ConfirmDelivery
                orderId={order.id}
                deliveredAt={order.delivered_at}
                hours={order.auto_complete_hours}
                now={now}
              />
              <OpenDispute orderId={order.id} reasons={reasons} />
            </>
          ) : (
            <NextStep
              orderId={order.id}
              status={order.status}
              side={side}
              evidence={counts}
              needsCrew={order.driver_id === null || order.vehicle_id === null}
            />
          )}

          {/* Din clipa în care livrarea este programată: atunci
              transportatorul știe unde va fi și încă are timp să caute
              marfă pentru drumul înapoi. Numai pentru el — clientul nu
              are ce publica pe retur. */}
          {side === 'carrier'
            && (order.status === 'delivery_scheduled'
              || order.status === 'vehicle_delivered'
              || order.status === 'order_completed') ? (
            <ReturnLeg
              fromCity={order.from_city ?? '—'}
              toCity={order.to_city ?? '—'}
              vehicleId={order.vehicle_id}
              deliveryDate={
                (order.delivered_at ?? order.delivery_from)?.slice(0, 10) ?? null
              }
              today={now.slice(0, 10)}
            />
          ) : null}

          <OrderRatingCard orderId={order.id} state={rating} />

          <Card className="p-5">
            <h2 className="text-h3">{c.summary}</h2>
            <dl className="mt-3 flex flex-col">
              <Row label={c.price}>{formatMoney(order.agreed_price, order.currency as never)}</Row>
              {order.payment_term_days !== null ? (
                <Row label={c.paymentTerm}>{c.paymentTermValue(order.payment_term_days)}</Row>
              ) : null}
              <Row label={c.pickupWindow}>
                {formatWindow(order.pickup_from, order.pickup_to)}
              </Row>
              <Row label={c.deliveryWindow}>
                {formatWindow(order.delivery_from, order.delivery_to)}
              </Row>
              <Row label={c.agreedOn}>{formatMoment(order.created_at)}</Row>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-h3">{c.crew}</h2>
            <dl className="mt-3 flex flex-col">
              <Row label={c.driver}>{order.driver_name ?? c.noCrew}</Row>
              <Row label={c.vehicle}>{order.plate_number ?? c.noCrew}</Row>
            </dl>
            {(side === 'carrier' || side === 'staff') && !isFinished(order.status) ? (
              <AssignCrew
                orderId={order.id}
                options={crew}
                driverId={order.driver_id}
                vehicleId={order.vehicle_id}
              />
            ) : null}
          </Card>

          {/* Firul comenzii, care s-a creat odată cu ea. Contactele sunt
              deja schimbate aici, deci nimic nu se maschează — spre
              deosebire de discuțiile de dinainte, care rămân așa cum au
              fost trimise. */}
          {conversationId !== null ? (
            <Link
              href={`${ROUTES.accountMessages}/${conversationId}`}
              className={`${buttonClasses('secondary', 'md')} w-full`}
            >
              {messagesCopy.entry.orderTab}
            </Link>
          ) : null}

          <Card className="p-5">
            <h2 className="text-h3">{c.parties}</h2>
            <dl className="mt-3 flex flex-col">
              <Row label={c.client}>{order.client_name ?? '—'}</Row>
              <Row label={c.carrier}>
                {order.carrier_name ?? '—'}
                {order.carrier_slug !== null ? (
                  <Link
                    href={companyRoute(order.carrier_slug)}
                    className="mt-0.5 block text-xs link-accent"
                  >
                    {c.profile}
                  </Link>
                ) : null}
              </Row>
            </dl>
            {order.offer_id !== null ? (
              <div className="mt-4 max-w-[22rem]">
                <OrderContacts offerId={order.offer_id} />
              </div>
            ) : null}
          </Card>

          <div className="flex flex-col gap-3 text-sm">
            {order.request_id !== null ? (
              <div className="flex flex-wrap gap-4">
                <Link href={requestRoute(order.request_id)} className="link-accent">
                  {c.request}
                </Link>
                {side === 'client' ? (
                  <Link
                    href={myRequestRoute(order.request_id)}
                    className="text-muted underline underline-offset-4"
                  >
                    {ordersCopy.detail.offer}
                  </Link>
                ) : null}
                {order.offer_id !== null && side !== 'client' ? (
                  <Link
                    href={offerRoute(order.offer_id)}
                    className="text-muted underline underline-offset-4"
                  >
                    {c.offer}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* Cancelling is only ever offered while it is still
                possible: after pickup the database refuses everybody
                but staff, and a button that always fails is worse than
                no button. */}
            {(side === 'client' || side === 'carrier') &&
            (order.status === 'order_confirmed' || order.status === 'pickup_scheduled') ? (
              <CancelOrder orderId={order.id} side={side} />
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function DisputeNote({
  order,
}: {
  order: { dispute_category: string | null; dispute_reason: string | null; disputed_at: string | null; dispute_resolution: string | null; dispute_resolved_at: string | null };
}) {
  return (
    <Card className="border-warning/45 bg-warning/8 p-5">
      <p className="text-sm font-medium">{ordersCopy.dispute.openTitle}</p>
      <p className="mt-1 text-xs text-muted">
        {ordersCopy.dispute.openedAt} {formatMoment(order.disputed_at)}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm">{order.dispute_reason}</p>
      {order.dispute_resolution !== null ? (
        <>
          <p className="mt-3 text-sm font-medium">{ordersCopy.dispute.decision}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{order.dispute_resolution}</p>
        </>
      ) : null}
      <p className="mt-2 text-xs text-muted">{ordersCopy.dispute.noMoney}</p>
    </Card>
  );
}

function badgeTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'order_completed') return 'success';
  if (status === 'disputed') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}
