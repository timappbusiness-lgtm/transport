import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HideEvidence } from '@/components/admin/hide-evidence';
import { ResolveDispute } from '@/components/admin/resolve-dispute';
import { ComparisonView, EvidenceGallery } from '@/components/orders/evidence-gallery';
import { OrderTimeline } from '@/components/orders/order-timeline';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute, transportRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { formatMoney } from '@/lib/offers';
import { formatMoment, formatWindow, orderStatusLabel } from '@/lib/orders';
import {
  loadEvidence,
  loadOrder,
  loadTimeline,
  signEvidence,
  signRequestPhotos,
} from '@/lib/orders-source';

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
 * One order, for the team.
 *
 * The same evidence and the same timeline both parties see, plus the
 * one decision staff make: closing a dispute. Nothing here changes a
 * transport's terms — `transports` has no update policy the parties can
 * write through, and the staff one exists for the two RPCs below rather
 * than for a form.
 *
 * `order_detail()` returns `my_side = 'staff'`, which is how the same
 * loaders serve this page without a second set of read models.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await loadOrder(id);
  if (order === null) notFound();

  const [events, evidence] = await Promise.all([loadTimeline(id), loadEvidence(id)]);
  const paths = evidence.map((row) => row.file_path).filter((p): p is string => p !== null);
  const [urls, publicUrls] = await Promise.all([
    signEvidence(paths),
    signRequestPhotos(order.request_photos ?? []),
  ]);

  const pickupPhotos = evidence.filter((row) => row.kind === 'pickup_photo');
  const deliveryPhotos = evidence.filter((row) => row.kind === 'delivery_photo');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href={ROUTES.adminOrders} className="text-muted underline-offset-4 hover:underline">
            ← {ordersCopy.admin.title}
          </Link>
        </p>
        <EyebrowPill>{ordersCopy.admin.eyebrow}</EyebrowPill>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-h2">
          {order.from_city ?? '—'} → {order.to_city ?? '—'}
          <StatusBadge tone={order.status === 'disputed' ? 'warning' : 'neutral'}>
            {orderStatusLabel(order.status)}
          </StatusBadge>
          {/* The nightly check flags; it never cancels. Staff see the same
              badge the carrier does, because the two of us are who can do
              anything about a lorry whose copie conformă lapsed on Sunday. */}
          {order.vehicle_flagged ? (
            <StatusBadge tone="warning">{ordersCopy.list.flagged}</StatusBadge>
          ) : null}
        </h1>
      </div>

      {order.status === 'disputed' ? (
        <>
          <section className="rounded-card border border-warning/45 bg-warning/8 p-5">
            <h2 className="text-h3">{ordersCopy.dispute.openTitle}</h2>
            <p className="mt-1 text-xs text-muted">
              {ordersCopy.dispute.openedAt} {formatMoment(order.disputed_at)} ·{' '}
              {order.dispute_category}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm">{order.dispute_reason}</p>
          </section>
          <ResolveDispute orderId={order.id} />
        </>
      ) : null}

      {order.dispute_resolution !== null ? (
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-h3">{ordersCopy.dispute.decision}</h2>
          <p className="mt-1 text-xs text-muted">
            {ordersCopy.dispute.resolvedAt} {formatMoment(order.dispute_resolved_at)}
          </p>
          <p className="mt-2 whitespace-pre-line text-sm">{order.dispute_resolution}</p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex flex-col gap-6">
          <OrderTimeline
            status={order.status}
            events={events}
            autoCompleted={order.auto_completed}
          />

          <ComparisonView
            title={ordersCopy.evidence.comparePickup}
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

          <EvidenceGallery rows={evidence} urls={urls}>
            {(row) =>
              row.is_hidden ? null : <HideEvidence evidenceId={row.id} orderId={order.id} />
            }
          </EvidenceGallery>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-h3">{c.summary}</h2>
            <dl className="mt-3 flex flex-col">
              <Row label={c.price}>{formatMoney(order.agreed_price, order.currency as never)}</Row>
              <Row label={c.pickupWindow}>{formatWindow(order.pickup_from, order.pickup_to)}</Row>
              <Row label={c.deliveryWindow}>
                {formatWindow(order.delivery_from, order.delivery_to)}
              </Row>
              <Row label={c.driver}>{order.driver_name ?? c.noCrew}</Row>
              <Row label={c.vehicle}>{order.plate_number ?? c.noCrew}</Row>
              <Row label={c.client}>{order.client_name ?? '—'}</Row>
              <Row label={c.carrier}>{order.carrier_name ?? '—'}</Row>
              <Row label={c.agreedOn}>{formatMoment(order.created_at)}</Row>
            </dl>
          </section>

          <div className="flex flex-col gap-2 text-sm">
            <Link href={transportRoute(order.id)} className="underline underline-offset-4">
              {ordersCopy.list.open}
            </Link>
            {order.request_id !== null ? (
              <Link
                href={requestRoute(order.request_id)}
                className="text-muted underline underline-offset-4"
              >
                {c.request}
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
