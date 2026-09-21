import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/app/top-bar';
import { OrderContacts } from '@/components/offers/order-contacts';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, myRequestRoute, offerRoute, requestRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { requireAccountContext } from '@/lib/auth/account';
import { formatDay, formatMoney } from '@/lib/offers';
import { loadOrder } from '@/lib/offers-source';

export const dynamic = 'force-dynamic';

const c = offersCopy.order;

export const metadata: Metadata = { title: c.title };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-[0.8125rem] text-muted sm:w-[12rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-[0.875rem]">{children}</dd>
    </div>
  );
}

/**
 * One confirmed order — a summary and two telephone numbers.
 *
 * Deliberately not an execution screen. `transports` has had columns for
 * loading, delivery and invoicing since phase 0, and a table is not a
 * feature: filling this page with empty boxes for them would promise a
 * workflow nobody has built. What it does do is the thing the accepted
 * offer sends people here for — see what was agreed, and reach the other
 * side — and say plainly what comes next.
 *
 * Who may open it is `transports_select_parties`, which returns nothing
 * to anybody but the two parties and staff; a row that does not come
 * back renders as a 404 rather than as a refusal, because a refusal
 * confirms the order exists.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccountContext(`${ROUTES.accountTransports}/${id}`);

  const order = await loadOrder(id);
  if (order === null) notFound();

  return (
    <div className="flex flex-col gap-8">
      <TopBar title={c.title} actions={[]} />

      <p className="text-sm">
        <Link href={ROUTES.accountOffers} className="text-muted underline-offset-4 hover:underline">
          ← {c.back}
        </Link>
      </p>

      <Card className="p-5">
        <h2 className="text-[1.0625rem]">{c.summary}</h2>
        <dl className="mt-4 flex flex-col">
          <Row label={c.route}>
            {order.from_city !== null && order.to_city !== null
              ? `${order.from_city} → ${order.to_city}`
              : '—'}
            {order.loading_from !== null ? (
              <span className="block text-xs text-muted">{formatDay(order.loading_from)}</span>
            ) : null}
          </Row>
          <Row label={c.price}>{formatMoney(order.agreed_price, order.currency)}</Row>
          {order.payment_term_days !== null ? (
            <Row label={c.paymentTerm}>{c.paymentTermValue(order.payment_term_days)}</Row>
          ) : null}
          {order.vehicle_plate !== null ? (
            <Row label={c.vehicle}>{order.vehicle_plate}</Row>
          ) : null}
          <Row label={c.agreedOn}>{new Date(order.created_at).toLocaleString('ro-RO')}</Row>
          <Row label={c.status}>
            <StatusBadge tone={order.status === 'cancelled' ? 'danger' : 'success'}>
              {c.statusLabels[order.status] ?? order.status}
            </StatusBadge>
          </Row>
        </dl>

        <div className="mt-5 max-w-[26rem]">
          {order.offer_id !== null ? <OrderContacts offerId={order.offer_id} /> : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          {order.offer_id !== null ? (
            <Link href={offerRoute(order.offer_id)} className="underline underline-offset-4">
              {c.offer}
            </Link>
          ) : null}
          {order.cargo_listing_id !== null ? (
            <>
              <Link
                href={requestRoute(order.cargo_listing_id)}
                className="underline underline-offset-4"
              >
                {c.request}
              </Link>
              <Link
                href={myRequestRoute(order.cargo_listing_id)}
                className="text-muted underline underline-offset-4"
              >
                {offersCopy.received.title}
              </Link>
            </>
          ) : null}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[1rem]">{c.soonTitle}</h2>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">{c.soonBody}</p>
      </Card>
    </div>
  );
}
