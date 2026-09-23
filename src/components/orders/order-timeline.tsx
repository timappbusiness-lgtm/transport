import { ordersCopy } from '@/content/comenzi';
import { Icon, IconLabel } from '@/components/ui/icon';
import { iconForContent, iconForOrderStep } from '@/lib/icons';
import {
  asideEvents,
  buildTimeline,
  formatMoment,
  orderStatusLabel,
  sideLabel,
  type TimelineEvent,
} from '@/lib/orders';
import { cn } from '@/lib/utils';

const c = ordersCopy.timeline;

/**
 * The seven steps, with what happened against each.
 *
 * Every step is a row, including the ones still to come: a list of what
 * has happened cannot show what has not, and what has not is the thing
 * somebody opened the page to find out. The current step is the one
 * marked, not the last one done — „unde este mașina mea acum" is the
 * question, and the answer is a place on a line.
 */
export function OrderTimeline({
  status,
  events,
  autoCompleted = false,
}: {
  status: string;
  events: readonly TimelineEvent[];
  autoCompleted?: boolean;
}) {
  const rows = buildTimeline(status, events);
  const aside = asideEvents(events);

  return (
    <section aria-labelledby="istoric" className="rounded-card border border-border bg-surface p-5">
      <h2 id="istoric" className="text-h3">
        <IconLabel as={iconForContent('comanda')} size="md" tone="strong">
          {c.title}
        </IconLabel>
      </h2>

      <ol className="mt-4 flex flex-col">
        {rows.map((row) => (
          <li key={row.status} className="flex gap-3 pb-4 last:pb-0">
            {/* The rail: the step's own icon rather than a dot, which is
                what `ORDER_STEP_ICONS` was written for — seven steps read
                from top to bottom are exactly the case where recognising
                one is faster than reading it. The state stays in the
                treatment: ink and a ring for now, success for done, muted
                and hollow for what is left. The line stops at the last
                row so it does not dangle into nothing.

                The „current" marker once named `border-accent` when no
                such token existed, so it resolved to nothing and the step
                somebody opened the page to find was the one step not
                marked. The token exists now, and marking the current step
                is one of the six places it is spent. */}
            <div className="flex flex-none flex-col items-center">
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border',
                  row.state === 'done' && 'border-success/40 bg-success/10 text-success',
                  row.state === 'current' &&
                    'border-accent bg-surface text-accent ring-2 ring-accent/20',
                  row.state === 'todo' && 'border-border-strong bg-surface text-muted',
                )}
              >
                {iconForOrderStep(row.status) ? (
                  <Icon as={iconForOrderStep(row.status)!} size="sm" />
                ) : (
                  <span aria-hidden className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
              <span
                aria-hidden
                className={cn(
                  'w-px flex-1',
                  row.state === 'done' ? 'bg-success/40' : 'bg-border',
                  'last:hidden',
                )}
              />
            </div>

            <div className="min-w-0 pb-1">
              <p
                className={cn(
                  'text-body',
                  row.state === 'todo' ? 'text-muted' : 'font-medium',
                )}
              >
                {row.label}
                {row.state === 'current' ? (
                  <span className="ml-2 text-small font-normal text-muted">{c.waiting}</span>
                ) : null}
              </p>
              {row.at !== null ? (
                <p className="mt-0.5 text-small text-muted">
                  {formatMoment(row.at)}
                  {row.who !== null ? ` · ${row.who}` : ''}
                </p>
              ) : null}
              {row.note !== null ? (
                <p className="mt-1 whitespace-pre-line text-small">{row.note}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {autoCompleted ? (
        <p className="mt-2 text-small text-muted">{c.autoCompleted}</p>
      ) : null}

      {aside.length > 0 ? (
        <>
          <h3 className="mt-5 text-body font-medium">{c.aside}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {aside.map((event) => (
              <li key={event.id} className="text-small">
                <span className="text-muted">{formatMoment(event.created_at)} · </span>
                <span>
                  {event.actor_name ?? sideLabel(event.actor_side)}
                  {event.from_status !== event.to_status
                    ? ` — ${orderStatusLabel(event.to_status)}`
                    : ''}
                </span>
                {event.note !== null ? (
                  <span className="block whitespace-pre-line text-muted">{event.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
