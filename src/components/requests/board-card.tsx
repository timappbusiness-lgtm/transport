import type { ReactNode } from 'react';
import Link from 'next/link';
import { RelativeTime } from '@/components/requests/relative-time';
import { Badge } from '@/components/ui/badge';
import { isNew } from '@/lib/badges';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { requestRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CARGO_CATEGORY_LABELS, SERVICE_TYPE_LABELS, formatWindow } from '@/lib/departures';
import { IconLabel } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';
import { formatKm, relativeTimeRo, vehicleLine, type PublicRequest } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = requestsCopy.card;

/**
 * One request in the board's list, readable in about a second.
 *
 * The order is the order a dispatcher reads in: the route first and
 * biggest, because that is the only thing that decides whether the rest
 * matters; then when it was published, because a board people check
 * twice a day is a feed; then the load in one line; then the two facts
 * that change the price — the winch and the express; then one button.
 *
 * Everything comes from `v_requests_public` — no note, no price, no
 * contact and no name, because none of that was fetched.
 *
 * The whole card is clickable and there is still a visible button. The
 * link stretches over the card with `after:absolute`, so a screen reader
 * hears exactly one link, named by the route; the button beside it is
 * `aria-hidden` because it is the same destination drawn again for the
 * eye. Two real links to one place would be two stops on a keyboard for
 * no reason.
 */
export function BoardRequestCard({
  request,
  now,
  note,
}: {
  request: PublicRequest;
  /** Passed in so the server and the test agree on what „now" means. */
  now: Date;
  /**
   * A line under the card explaining why it is on this list — the detour
   * when the board is filtered to „potrivite cu firma mea". Outside the
   * card, because it is an explanation and not a second destination.
   */
  note?: ReactNode;
}) {
  const km = formatKm(request.estimated_km);
  const vehicle = vehicleLine(request);

  return (
    <li>
      <article
        className={cn(
          'relative flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:p-5',
          'transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-raised',
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="min-w-0 text-h3">
            <Link
              href={requestRoute(request.id)}
              className="after:absolute after:inset-0 after:content-['']"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{request.from_city}</span>
                <CountryTag cc={request.from_country} />
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="sr-only">spre</span>
                <span>{request.to_city}</span>
                <CountryTag cc={request.to_country} />
              </span>
            </Link>
          </h3>
          <span className="flex flex-none items-center gap-1.5">
            {isNew(request.published_at, now) ? <Badge kind="new">{c.isNew}</Badge> : null}
            <Badge kind="time">
              <RelativeTime
                publishedAt={request.published_at}
                initial={relativeTimeRo(request.published_at, now)}
              />
            </Badge>
          </span>
        </div>

        {/* One line for the load. The icon is what a dispatcher scans a
            column of cards with; the label is what says which. */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
          <IconLabel as={iconForCategory(request.category)} size="sm" tone="strong">
            <span className="text-foreground">{CARGO_CATEGORY_LABELS[request.category]}</span>
          </IconLabel>
          <span className="font-mono tabular-nums">
            {formatWindow(request.loading_from, request.loading_to)}
          </span>
          {km ? <span className="font-mono tabular-nums">{km}</span> : null}
          {request.weight_kg !== null ? (
            <span className="font-mono tabular-nums">{c.weight(request.weight_kg)}</span>
          ) : null}
          {vehicle ? <span className="min-w-0 truncate">{vehicle}</span> : null}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={request.needs_winch ? 'warning' : 'success'}>
              {request.needs_winch ? c.winch : c.running}
            </StatusBadge>
            {request.service_type === 'expres' ? (
              <Badge kind="express">{SERVICE_TYPE_LABELS.expres}</Badge>
            ) : request.service_type !== 'pe_sens' ? (
              <StatusBadge tone="neutral">{SERVICE_TYPE_LABELS[request.service_type]}</StatusBadge>
            ) : null}
            <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
              {request.board === 'curse' ? c.fromCompany : c.fromIndividual}
              {request.photo_count > 0 ? ` · ${c.photos(request.photo_count)}` : ''}
            </span>
          </div>

          {/* The same destination as the heading, drawn for the eye. */}
          <span
            aria-hidden="true"
            className="rounded-input border border-border-strong px-3 py-1.5 text-small font-medium"
          >
            {c.open}
          </span>
        </div>
      </article>
      {note === undefined ? null : <div className="mt-1.5 text-xs text-muted">{note}</div>}
    </li>
  );
}
