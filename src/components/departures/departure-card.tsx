import Link from 'next/link';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { SeatDeck } from '@/components/ui/seat-deck';
import { IconLabel } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';
import { departureRoute } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { relativeTimeRo } from '@/lib/requests';
import { Badge } from '@/components/ui/badge';
import { isNew } from '@/lib/badges';
import {
  CARGO_CATEGORY_LABELS,
  DIRECTION_LABELS,
  SERVICE_TYPE_LABELS,
  formatWindow,
  isFull,
  priceSentence,
  readWaypoints,
  seatsSentence,
  type PublicDeparture,
} from '@/lib/departures';
import { cn } from '@/lib/utils';

/** Enough to tell one platform from another; the rest is on the page. */
const CATEGORIES_SHOWN = 3;

/**
 * One departure on the board, in the same shape as a request.
 *
 * Route first and biggest, then when it was published, then the one line
 * that decides it — window, free seats, indicative price — then one
 * button. A dispatcher who has learnt one board has learnt both.
 *
 * Everything shown comes from `v_departures_public`, so there is no way
 * to leak a company, a plate or an address from here: the data simply is
 * not in the row. The carrier's name is added on the detail page, and
 * only for a signed-in visitor.
 *
 * The link stretches over the card and the button beside it is
 * `aria-hidden`, for the reason written on `BoardRequestCard`: one card,
 * one destination, one stop on a keyboard.
 */
export function DepartureCard({ departure, now }: { departure: PublicDeparture; now: Date }) {
  const waypoints = readWaypoints(departure.waypoints);
  const seats = seatsSentence(departure);
  const price = priceSentence(departure);
  const full = isFull(departure);
  const c = departuresCopy.card;
  const categories = departure.accepted_vehicle_types;
  const shown = categories.slice(0, CATEGORIES_SHOWN);
  const rest = categories.length - shown.length;

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
              href={departureRoute(departure.truck_listing_id)}
              className="after:absolute after:inset-0 after:content-['']"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{departure.from_city}</span>
                <CountryTag cc={departure.from_country} />
                <span aria-hidden="true" className="text-muted">
                  →
                </span>
                <span className="sr-only">spre</span>
                <span>{departure.to_city}</span>
                <CountryTag cc={departure.to_country} />
              </span>
            </Link>
          </h3>
          {/* `published_at` is nullable on this view; a route with no
              date says nothing rather than saying „chiar acum". */}
          {departure.published_at === null ? null : (
            <span className="flex flex-none items-center gap-1.5">
              {isNew(departure.published_at, now) ? (
                <Badge kind="new">{c.isNew}</Badge>
              ) : null}
              <Badge kind="time">
                <time dateTime={departure.published_at}>
                  {relativeTimeRo(departure.published_at, now)}
                </time>
              </Badge>
            </span>
          )}
        </div>

        {waypoints.length > 0 ? (
          <p className="text-xs text-muted">prin {waypoints.map((w) => w.city).join(' · ')}</p>
        ) : null}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
          <span className="font-mono tabular-nums text-foreground">
            {formatWindow(departure.available_from, departure.available_to)}
          </span>
          <span className={full ? 'text-warning' : 'text-foreground'}>
            {seats ?? c.seatsUnknown}
          </span>
          <span className="font-mono tabular-nums">{price ?? c.noPrice}</span>
        </p>

        {departure.platform_slots_total === null ? null : (
          <div className="w-[min(13rem,60%)]">
            <SeatDeck taken={departure.slots_taken} total={departure.platform_slots_total} compact />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* Full is a state, and states keep their chip. Otherwise the
                leg is a sign — „Pe retur" is the cheap one — and a sign
                is a badge. */}
            {full ? (
              <StatusBadge tone="warning">{DIRECTION_LABELS[departure.direction]}</StatusBadge>
            ) : departure.direction === 'retur' ? (
              <Badge kind="return">{DIRECTION_LABELS.retur}</Badge>
            ) : (
              <StatusBadge tone="neutral">{DIRECTION_LABELS.tur}</StatusBadge>
            )}
            {shown.map((category) => (
              <IconLabel
                key={category}
                as={iconForCategory(category)}
                size="sm"
                tone="strong"
                className="text-small text-muted"
              >
                {CARGO_CATEGORY_LABELS[category]}
              </IconLabel>
            ))}
            {rest > 0 ? <span className="text-small text-muted">+{rest}</span> : null}
            {departure.service_types.includes('expres') ? (
              <Badge kind="express">{SERVICE_TYPE_LABELS.expres}</Badge>
            ) : null}
          </div>

          <span
            aria-hidden="true"
            className="rounded-input border border-border-strong px-3 py-1.5 text-small font-medium"
          >
            {c.open}
          </span>
        </div>
      </article>
    </li>
  );
}
