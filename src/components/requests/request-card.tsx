import Link from 'next/link';
import { RelativeTime } from '@/components/requests/relative-time';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { requestRoute } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { IconLabel } from '@/components/ui/icon';
import { iconForCategory } from '@/lib/icons';
import {
  SCOPE_LABELS,
  formatKm,
  relativeTimeRo,
  scopeOf,
  vehicleLine,
  type PublicRequest,
} from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = homeCopy.activity.feed;

/**
 * One request, as a visitor sees it.
 *
 * Everything on this card comes from `v_requests_public`, which is the
 * whole of what is public: a locality, a country, a vehicle and a date.
 * There is nothing here to redact, because nothing private was fetched.
 *
 * No hooks of its own, so it renders to static markup in a test — which is
 * how "the card never shows a note" is checked without a browser.
 */
export function RequestCard({
  request,
  now,
  className,
}: {
  request: PublicRequest;
  /** Passed in so the server and the test agree on what "now" means. */
  now: Date;
  className?: string | undefined;
}) {
  const scope = scopeOf(request.from_country, request.to_country);
  const km = formatKm(request.estimated_km);
  const vehicle = vehicleLine(request);

  return (
    <li className={cn('min-w-0', className)}>
      <Link
        href={requestRoute(request.id)}
        className={cn(
          'flex h-full flex-col rounded-card border border-border bg-surface p-4 sm:p-5',
          'transition-[border-color] duration-150 hover:border-border-strong',
        )}
      >
        <p className="flex items-center justify-between gap-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">
          <IconLabel as={iconForCategory(request.category)} size="sm" tone="strong">
            {CARGO_CATEGORY_LABELS[request.category]}
          </IconLabel>
          <span className="flex-none">{SCOPE_LABELS[scope]}</span>
        </p>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem]">
          <span className="sr-only">{c.routeLabel(request.from_city, request.to_city)}</span>
          <span aria-hidden="true" className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{request.from_city}</span>
            <CountryTag cc={request.from_country} />
            <span className="text-muted">→</span>
            <span className="font-medium">{request.to_city}</span>
            <CountryTag cc={request.to_country} />
          </span>
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted">
          {km ? (
            <span className="rounded-pill border border-border px-2 py-0.5 font-mono tabular-nums">
              {km}
            </span>
          ) : null}
          {vehicle ? <span className="min-w-0 truncate">{vehicle}</span> : null}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={request.is_running ? 'success' : 'warning'}>
            {request.is_running ? c.running : c.notRunning}
          </StatusBadge>
          {request.service_type === 'expres' ? (
            <StatusBadge tone="neutral">{c.express}</StatusBadge>
          ) : null}
        </div>

        <p className="mt-4 pt-1 font-mono text-[0.6875rem] text-muted">
          <RelativeTime
            publishedAt={request.published_at}
            initial={relativeTimeRo(request.published_at, now)}
          />
        </p>
      </Link>
    </li>
  );
}
