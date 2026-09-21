import { ordersCopy } from '@/content/comenzi';
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
      <h2 id="istoric" className="text-[1.0625rem]">
        {c.title}
      </h2>

      <ol className="mt-4 flex flex-col">
        {rows.map((row) => (
          <li key={row.status} className="flex gap-3 pb-4 last:pb-0">
            {/* The rail: a filled dot for done, a ring for now, an empty
                one for what is left. The line stops at the last row so
                it does not dangle into nothing. */}
            <div className="flex flex-none flex-col items-center">
              <span
                aria-hidden
                className={cn(
                  'mt-1 h-2.5 w-2.5 rounded-full border',
                  row.state === 'done' && 'border-success bg-success',
                  row.state === 'current' && 'border-accent bg-surface ring-2 ring-accent/30',
                  row.state === 'todo' && 'border-border-strong bg-surface',
                )}
              />
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
                  'text-sm',
                  row.state === 'todo' ? 'text-muted' : 'font-medium',
                )}
              >
                {row.label}
                {row.state === 'current' ? (
                  <span className="ml-2 text-xs font-normal text-muted">{c.waiting}</span>
                ) : null}
              </p>
              {row.at !== null ? (
                <p className="mt-0.5 text-xs text-muted">
                  {formatMoment(row.at)}
                  {row.who !== null ? ` · ${row.who}` : ''}
                </p>
              ) : null}
              {row.note !== null ? (
                <p className="mt-1 whitespace-pre-line text-[0.8125rem]">{row.note}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {autoCompleted ? (
        <p className="mt-2 text-[0.8125rem] text-muted">{c.autoCompleted}</p>
      ) : null}

      {aside.length > 0 ? (
        <>
          <h3 className="mt-5 text-sm font-medium">{c.aside}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {aside.map((event) => (
              <li key={event.id} className="text-[0.8125rem]">
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
