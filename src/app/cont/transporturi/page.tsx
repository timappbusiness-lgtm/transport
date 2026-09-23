import { TabLink } from '@/components/ui/tab';
import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { buttonClasses } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, transportRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { requireAccountContext } from '@/lib/auth/account';
import { formatMoney } from '@/lib/offers';
import {
  BOX_LABELS,
  formatWindow,
  nextAction,
  orderStatusLabel,
  parseBox,
  type OrderBox,
} from '@/lib/orders';
import { loadMyOrders, type OrderRow } from '@/lib/orders-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: ordersCopy.list.title };
export const dynamic = 'force-dynamic';

const c = ordersCopy.list;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text !== '' ? text : null;
}

/**
 * Every order this person is part of.
 *
 * The same page for all four readers, because the difference is what
 * comes back rather than what is drawn: `my_orders()` already gives a
 * driver only the orders assigned to them, and „necesită acțiunea ta"
 * is computed there too, so the list and the detail page cannot
 * disagree about whose turn it is.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await requireAccountContext(ROUTES.accountTransports);
  const params = await searchParams;

  const box: OrderBox = parseBox(one(params, 'cutie'));
  const onlyMine = one(params, 'ale-mele') === 'da';
  const all = await loadMyOrders(box);
  const orders = onlyMine ? all.filter((order) => order.needs_me) : all;

  const isDriver = context.activeRole === 'driver';
  const waiting = all.filter((order) => order.needs_me).length;

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={isDriver ? ordersCopy.driver.title : c.title} actions={[]} />

      {!isDriver ? <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p> : null}

      <nav aria-label="Cutii" className="flex flex-wrap gap-1.5">
        {(Object.keys(BOX_LABELS) as OrderBox[]).map((value) => (
          <Tab
            key={value}
            href={`${ROUTES.accountTransports}?cutie=${value}`}
            label={BOX_LABELS[value]}
            active={box === value}
          />
        ))}
      </nav>

      {box === 'active' && waiting > 0 ? (
        <nav aria-label="Filtru" className="flex flex-wrap gap-1.5">
          <Tab
            href={`${ROUTES.accountTransports}?cutie=active`}
            label={c.filterAll}
            active={!onlyMine}
            small
          />
          <Tab
            href={`${ROUTES.accountTransports}?cutie=active&ale-mele=da`}
            label={`${c.filterNeedsMe} (${waiting})`}
            active={onlyMine}
            small
          />
        </nav>
      ) : null}

      {orders.length === 0 ? (
        <Card className="p-6">
          <h2 className="text-lg">
            {isDriver && box === 'active' ? ordersCopy.driver.none : c.empty[box]}
          </h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">
            {isDriver && box === 'active' ? ordersCopy.driver.noneBody : c.empty[`${box}Body`]}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  const step = nextAction(order.status);
  const mine = order.needs_me;

  return (
    <li
      className={cn(
        'rounded-card border bg-surface p-4 sm:p-5',
        mine ? 'border-foreground/35' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium">
            {order.from_city ?? '—'} → {order.to_city ?? '—'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
            <span>{order.carrier_name ?? order.client_name ?? '—'}</span>
            {order.plate_number !== null ? <span>{order.plate_number}</span> : null}
            {order.driver_name !== null ? <span>{order.driver_name}</span> : null}
          </p>
          <p className="mt-1 text-small text-muted">
            {ordersCopy.detail.pickupWindow}: {formatWindow(order.pickup_from, null)}
          </p>
        </div>

        <div className="flex flex-none flex-col items-end gap-2">
          <p className="font-display text-lg leading-none tabular-nums">
            {formatMoney(order.agreed_price, order.currency as never)}
          </p>
          <StatusBadge tone={mine ? 'warning' : 'neutral'}>
            {orderStatusLabel(order.status)}
          </StatusBadge>
        </div>
      </div>

      {order.vehicle_flagged ? (
        <p className="mt-3">
          <StatusBadge tone="warning">{ordersCopy.list.flagged}</StatusBadge>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={transportRoute(order.id)} className={buttonClasses(mine ? 'primary' : 'secondary', 'sm')}>
          {mine && step !== null ? step.label : ordersCopy.list.open}
        </Link>
        {mine ? (
          <span className="text-small font-medium text-foreground">{ordersCopy.list.needsMe}</span>
        ) : step !== null ? (
          <span className="text-small text-muted">{step.waitingFor}</span>
        ) : null}
      </div>
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
    <TabLink href={href} active={active} size={small ? 'sm' : 'md'}>
      {label}
    </TabLink>
  );
}
