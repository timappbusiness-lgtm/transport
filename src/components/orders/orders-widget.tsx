import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES, transportRoute } from '@/config/routes';
import { appCopy } from '@/content/app';
import { formatWindow, nextAction, orderStatusLabel } from '@/lib/orders';
import type { OrderRow } from '@/lib/orders-source';
import { IconLabel } from '@/components/ui/icon';
import { iconForContent } from '@/lib/icons';

/**
 * What an order needs from whoever just opened the application.
 *
 * Three things, in the order they hurt: what is waiting on them, what
 * is in dispute, and when the next lorry turns up. A widget of zeroes
 * is not rendered at all — a dashboard full of noughts reads as a
 * broken account rather than a quiet week, and there is nothing to act
 * on in a nought.
 */
export function OrdersWidget({
  orders,
  side,
}: {
  orders: readonly OrderRow[];
  /** Which words to use: a carrier schedules, a client confirms. */
  side: 'carrier' | 'client';
}) {
  if (orders.length === 0) return null;

  const c = side === 'carrier' ? appCopy.carrier.orders : appCopy.clientOrders;
  const waiting = orders.filter((order) => order.needs_me);
  const disputed = orders.filter((order) => order.status === 'disputed');
  const inFlight = orders.filter(
    (order) => order.status === 'in_transit' || order.status === 'vehicle_picked_up',
  );

  // The soonest pickup that has actually been scheduled.
  const nextPickup = [...orders]
    .filter((order) => order.pickup_from !== null && order.status !== 'order_completed')
    .sort((a, b) => (a.pickup_from ?? '').localeCompare(b.pickup_from ?? ''))[0];

  return (
    <section aria-labelledby="transporturi">
      <h2 id="transporturi" className="text-h3">
        <IconLabel as={iconForContent('comanda')} size="md" tone="strong">
          {c.title}
        </IconLabel>
      </h2>

      <Card className="mt-3 p-5">
        <ul className="flex flex-col gap-2 text-body">
          {waiting.length > 0 ? (
            <li>
              <Link
                href={`${ROUTES.accountTransports}?cutie=active&ale-mele=da`}
                className="link-accent"
              >
                {side === 'carrier'
                  ? appCopy.carrier.orders.awaiting(waiting.length)
                  : waiting.length === 1
                    ? appCopy.clientOrders.awaiting
                    : appCopy.clientOrders.awaitingMany(waiting.length)}
              </Link>
            </li>
          ) : null}

          {disputed.length > 0 ? (
            <li className="text-danger">
              {/* A dispute keeps the colour of its row, never the accent. */}
              <Link
                href={`${ROUTES.accountTransports}?cutie=anulate`}
                className="underline underline-offset-4"
              >
                {appCopy.carrier.orders.disputes(disputed.length)}
              </Link>
            </li>
          ) : null}

          {side === 'client' && inFlight.length > 0 ? (
            <li className="text-muted">{appCopy.clientOrders.inFlight(inFlight.length)}</li>
          ) : null}

          {nextPickup !== undefined ? (
            <li className="text-muted">
              {appCopy.carrier.orders.nextPickup}:{' '}
              <Link href={transportRoute(nextPickup.id)} className="link-accent">
                {nextPickup.from_city ?? '—'} → {nextPickup.to_city ?? '—'}
              </Link>
              {' · '}
              {formatWindow(nextPickup.pickup_from, null)}
            </li>
          ) : null}

          {waiting.length === 0 && disputed.length === 0 && nextPickup === undefined ? (
            <li className="text-muted">
              {orders.length === 1
                ? orderStatusLabel(orders[0]!.status)
                : appCopy.carrier.orders.none}
            </li>
          ) : null}
        </ul>

        <Link
          href={ROUTES.accountTransports}
          className={`${buttonClasses('secondary', 'sm')} mt-4`}
        >
          {c.action}
        </Link>
      </Card>
    </section>
  );
}

/** Whether there is anything here worth a widget. */
export function hasOrderNews(orders: readonly OrderRow[]): boolean {
  return orders.some(
    (order) => order.needs_me || order.status === 'disputed' || order.pickup_from !== null,
  );
}

export { nextAction };
