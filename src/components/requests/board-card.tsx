import type { ReactNode } from 'react';
import Link from 'next/link';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { requestRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CARGO_CATEGORY_LABELS, SERVICE_TYPE_LABELS, formatWindow } from '@/lib/departures';
import { IconLabel } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';
import { formatKm, vehicleLine, type PublicRequest } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = requestsCopy.card;

/**
 * One request in the board's list.
 *
 * Wider than the homepage card and carrying the three things a dispatcher
 * decides on: when it loads, whether it rolls onto the platform by itself,
 * and whether the person asking is a firm or a private owner. Everything
 * comes from `v_requests_public` — there is no note, no price, no contact
 * and no name here, because none of that was fetched.
 *
 * No hooks, so it renders to static markup in a test.
 */
export function BoardRequestCard({
  request,
  note,
}: {
  request: PublicRequest;
  /**
   * A line under the card explaining why it is on this list — the detour
   * when the board is filtered to „potrivite cu firma mea". Outside the
   * link, because it is an explanation and not a second destination.
   */
  note?: ReactNode;
}) {
  const km = formatKm(request.estimated_km);
  const vehicle = vehicleLine(request);

  return (
    <li>
      <Link
        href={requestRoute(request.id)}
        className={cn(
          'flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:p-5',
          'transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-raised',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-label uppercase tracking-[0.12em] text-muted">
          {/* The icon helps somebody scan a column of cards for the
              one kind they carry; the label is what says which. */}
          <IconLabel as={iconForCategory(request.category)} size="sm" tone="strong">
            {CARGO_CATEGORY_LABELS[request.category]}
          </IconLabel>
          <span className="flex-none">
            {request.board === 'curse' ? c.fromCompany : c.fromIndividual}
          </span>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-lg">
          <span className="font-medium">{request.from_city}</span>
          <CountryTag cc={request.from_country} />
          <span className="text-muted">→</span>
          <span className="font-medium">{request.to_city}</span>
          <CountryTag cc={request.to_country} />
        </p>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted">
          <span>{formatWindow(request.loading_from, request.loading_to)}</span>
          {km ? <span className="font-mono tabular-nums">{km}</span> : null}
          {vehicle ? <span className="min-w-0 truncate">{vehicle}</span> : null}
          {request.weight_kg !== null ? (
            <span className="font-mono tabular-nums">{c.weight(request.weight_kg)}</span>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={request.needs_winch ? 'warning' : 'success'}>
            {request.needs_winch ? c.winch : c.running}
          </StatusBadge>
          {request.service_type !== 'pe_sens' ? (
            <StatusBadge tone="neutral">{SERVICE_TYPE_LABELS[request.service_type]}</StatusBadge>
          ) : null}
          {request.photo_count > 0 ? (
            <StatusBadge tone="neutral">{c.photos(request.photo_count)}</StatusBadge>
          ) : null}
        </div>
      </Link>
      {note === undefined ? null : <div className="mt-1.5 text-xs text-muted">{note}</div>}
    </li>
  );
}
