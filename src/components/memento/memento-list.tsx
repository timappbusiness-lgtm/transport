import Link from 'next/link';
import { MementoStateText } from '@/components/memento/state-text';
import { RenewForm, type MementoAction } from '@/components/memento/renew-form';
import { mementoVehicleRoute } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import {
  daysLeft,
  displayPlate,
  fleetView,
  formatDay,
  mementoLabel,
  nextReminderDay,
  type FleetFilter,
  type FleetSort,
} from '@/lib/memento';
import type { MementoVehicle } from '@/lib/memento-source';
import { cn } from '@/lib/utils';

const c = mementoCopy.account;

/** `?vedere=…&filtru=…&ordine=…`, keeping what is already chosen. */
function query(base: Record<string, string | undefined>, change: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...base, ...change })) {
    if (value !== undefined && value !== '' && value !== 'toate' && value !== 'urgenta') params.set(key, value);
  }
  const text = params.toString();
  return text === '' ? '?' : `?${text}`;
}

/**
 * The filters and the order, as links: the choice lives in the address,
 * so a refresh, the back button and a shared link keep it.
 */
export function FleetControls({
  basePath,
  view,
  filter,
  sort,
  keep = {},
}: {
  basePath: string;
  view: string | undefined;
  filter: FleetFilter;
  sort: FleetSort;
  /** Parameters every link carries as they are: the harness's section. */
  keep?: Record<string, string>;
}) {
  const base = { ...keep, vedere: view, filtru: filter, ordine: sort };
  const chip = (active: boolean) =>
    cn(
      'rounded-pill border px-3 py-1.5 text-small',
      active ? 'border-foreground bg-foreground text-white' : 'border-border-strong text-foreground hover:bg-ground-alt',
    );
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" data-memento-controls>
      <nav aria-label={c.filterLabel} className="flex flex-wrap gap-2">
        {(['toate', '30', 'expirate'] as const).map((value) => (
          <Link
            key={value}
            href={`${basePath}${query(base, { filtru: value })}`}
            aria-current={filter === value ? 'page' : undefined}
            className={chip(filter === value)}
            data-memento-filter={value}
          >
            {c.filters[value]}
          </Link>
        ))}
      </nav>
      <nav aria-label={c.sortLabel} className="flex flex-wrap items-center gap-2 text-small">
        <span className="text-muted">{c.sortLabel}:</span>
        {(['urgenta', 'numar'] as const).map((value) => (
          <Link
            key={value}
            href={`${basePath}${query(base, { ordine: value })}`}
            aria-current={sort === value ? 'page' : undefined}
            className={cn('underline-offset-4', sort === value ? 'font-medium text-foreground' : 'text-muted underline')}
            data-memento-sort={value}
          >
            {c.sorts[value]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/**
 * Vehicles and their dates. Each date says how many days are left and
 * what that means, with „Am reînnoit" beside it; the vehicle's name leads
 * to its page — photos, history, the person responsible.
 *
 * No badge, no tick, no accent, no word the verification uses: these are
 * the person's own dates, and the list says so above itself.
 */
export function MementoList({
  vehicles,
  today,
  filter,
  sort,
  renewIds = [],
  responsibleNames,
  renewAction,
  canEdit = true,
}: {
  vehicles: readonly MementoVehicle[];
  today: string;
  filter: FleetFilter;
  sort: FleetSort;
  /** The entries a reminder's link named: their renew forms start open. */
  renewIds?: readonly string[];
  /** Firm vehicles: who receives the reminders, by user id. */
  responsibleNames?: ReadonlyMap<string, string> | undefined;
  renewAction?: MementoAction | undefined;
  canEdit?: boolean;
}) {
  const shown = fleetView(vehicles, filter, sort, today);
  if (shown.length === 0) {
    return (
      <p className="rounded-card border border-border bg-surface px-5 py-6 text-body text-muted" data-memento-empty>
        {vehicles.length === 0 ? c.empty : c.emptyFiltered}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-memento-list>
      {shown.map((vehicle) => {
        const name = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
        const responsible = vehicle.responsibleUserId ? responsibleNames?.get(vehicle.responsibleUserId) : undefined;
        return (
          <li
            key={vehicle.id}
            className="overflow-hidden rounded-card border border-border bg-surface"
            data-memento-vehicle={vehicle.plate}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
              <Link href={mementoVehicleRoute(vehicle.id)} className="min-w-0 hover:underline">
                <span className="font-mono text-body font-medium">{displayPlate(vehicle.plate)}</span>
                {name !== '' ? <span className="ml-2 text-small text-muted">{name}</span> : null}
              </Link>
              {responsible ? <span className="text-small text-muted">{c.responsible(responsible)}</span> : null}
            </div>
            {vehicle.entries.length === 0 ? (
              <p className="px-4 py-3 text-small text-muted sm:px-5">
                {c.noDates} ·{' '}
                <Link href={mementoVehicleRoute(vehicle.id)} className="underline underline-offset-4">
                  {c.addDates}
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {vehicle.entries.map((entry) => {
                  const label = mementoLabel(entry.kind, entry.customName);
                  const left = entry.validUntil === null ? null : daysLeft(entry.validUntil, today);
                  const next = entry.validUntil === null ? null : nextReminderDay(entry.validUntil, today);
                  return (
                    <li
                      key={entry.id}
                      className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
                      data-memento-entry={entry.kind}
                    >
                      <div className="min-w-0">
                        <p className="text-body">
                          <span className="font-medium">{label}</span>
                          {entry.validUntil !== null ? (
                            <span className="ml-2 font-mono text-small">{formatDay(entry.validUntil)}</span>
                          ) : null}
                          {entry.dueKm !== null ? (
                            <span className="ml-2 text-small text-muted">
                              {c.kmDue(entry.dueKm.toLocaleString('ro-RO'))}
                            </span>
                          ) : null}
                        </p>
                        {left !== null ? <MementoStateText days={left} /> : null}
                        {next !== null && left !== null && left >= 0 ? (
                          <p className="text-small text-muted">{c.nextReminder(formatDay(next))}</p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <RenewForm
                          entryId={entry.id}
                          label={label}
                          kind={entry.kind}
                          open={renewIds.includes(entry.id)}
                          {...(renewAction ? { action: renewAction } : {})}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
