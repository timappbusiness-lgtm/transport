import Link from 'next/link';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { SeatDeck } from '@/components/ui/seat-deck';
import { departureRoute } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
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

/**
 * One departure on the board.
 *
 * Everything shown comes from `v_departures_public`, so there is no way to
 * leak a company, a plate or an address from here: the data simply is not
 * in the row. The carrier's name is added on the detail page, and only for
 * a signed-in visitor.
 */
export function DepartureCard({ departure }: { departure: PublicDeparture }) {
  const waypoints = readWaypoints(departure.waypoints);
  const seats = seatsSentence(departure);
  const price = priceSentence(departure);
  const full = isFull(departure);
  const c = departuresCopy.card;

  return (
    <li className="rounded-card border border-border bg-surface">
      <Link
        href={departureRoute(departure.truck_listing_id)}
        className="flex flex-col gap-4 p-5 hover:bg-ground-alt/60"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-medium">
              <span className="inline-flex items-center gap-1.5">
                <CountryTag cc={departure.from_country} />
                {departure.from_city}
              </span>
              <span aria-hidden="true" className="text-muted">
                →
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CountryTag cc={departure.to_country} />
                {departure.to_city}
              </span>
            </p>
            {waypoints.length > 0 ? (
              <p className="mt-1.5 text-xs text-muted">
                prin {waypoints.map((w) => w.city).join(' · ')}
              </p>
            ) : null}
          </div>

          <StatusBadge tone={full ? 'warning' : 'neutral'}>
            {DIRECTION_LABELS[departure.direction]}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted">{departuresCopy.detail.window}</dt>
              <dd className="font-mono tabular-nums">
                {formatWindow(departure.available_from, departure.available_to)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{departuresCopy.detail.seats}</dt>
              <dd className={full ? 'text-warning' : undefined}>{seats ?? c.seatsUnknown}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{departuresCopy.detail.price}</dt>
              <dd className="font-mono tabular-nums">{price ?? c.noPrice}</dd>
            </div>
          </dl>

          {departure.platform_slots_total !== null ? (
            <div className="w-[min(13rem,60%)]">
              <SeatDeck
                taken={departure.slots_taken}
                total={departure.platform_slots_total}
                compact
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {departure.service_types.map((service) => (
            <span
              key={service}
              className="rounded-pill border border-border px-2.5 py-1 font-mono text-label tracking-[0.04em] text-muted"
            >
              {SERVICE_TYPE_LABELS[service]}
            </span>
          ))}
          {departure.accepted_vehicle_types.map((category) => (
            <span
              key={category}
              className="rounded-pill border border-border bg-ground-alt px-2.5 py-1 text-xs text-muted"
            >
              {CARGO_CATEGORY_LABELS[category]}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}
