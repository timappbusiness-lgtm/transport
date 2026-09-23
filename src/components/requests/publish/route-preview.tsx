import { CountryTag, Figure } from '@/components/ui/primitives';
import { requestsCopy } from '@/content/cereri';
import { formatKm } from '@/lib/requests';
import { cn } from '@/lib/utils';

/**
 * The route, drawn as it is chosen.
 *
 * Empty, it is two open rings and a dashed arc — a place for a route.
 * With the origin chosen, its ring fills; with both, the arc is drawn
 * solid in the accent and the distance appears beside it as the key
 * number. A static drawing that changes state, not an animation: every
 * change is a colour and a fill, so reduced motion has nothing to stop.
 *
 * The distance is the one the board will show — see `estimatedKm` — and
 * says so, and it only appears when both places were picked from the
 * list, because a typed name has no coordinates and a guessed distance
 * is an invented number.
 */
export function RoutePreview({
  fromCity,
  fromCountry,
  toCity,
  toCountry,
  km,
}: {
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  km: number | null;
}) {
  const c = requestsCopy.form.route;
  const hasFrom = fromCity.trim() !== '';
  const hasTo = toCity.trim() !== '';
  const both = hasFrom && hasTo;

  return (
    <div
      data-route-preview
      data-state={both ? 'both' : hasFrom ? 'from' : 'empty'}
      className="rounded-card border border-border bg-background p-4 sm:p-5"
    >
      <svg
        viewBox="0 0 320 84"
        role="img"
        aria-label={c.mapLabel(fromCity.trim(), toCity.trim())}
        className="h-auto w-full"
      >
        {/* The ground line, and the arc a truck takes over it. */}
        <path d="M18 70h284" className="stroke-border" strokeWidth="1" />
        <path
          d="M30 62 C 110 4, 210 4, 290 62"
          fill="none"
          strokeWidth={both ? 2.6 : 1.6}
          strokeLinecap="round"
          strokeDasharray={both ? undefined : '4 6'}
          className={both ? 'stroke-accent' : 'stroke-border-strong'}
        />
        {/* Origin: a ring that fills when it is chosen. */}
        <circle
          cx="30"
          cy="62"
          r="7"
          strokeWidth="2.2"
          className={hasFrom ? 'fill-accent stroke-accent' : 'fill-surface stroke-border-strong'}
        />
        {/* Destination: a ring with a dot, like a pin seen from above. */}
        <circle
          cx="290"
          cy="62"
          r="9"
          strokeWidth="2.6"
          className={cn('fill-surface', hasTo ? 'stroke-accent' : 'stroke-border-strong')}
        />
        {hasTo ? <circle cx="290" cy="62" r="3.5" className="fill-accent" /> : null}
      </svg>

      <div className="mt-2 flex items-start justify-between gap-4">
        <Place label={c.mapFrom} city={fromCity} country={fromCountry} align="left" />
        <Place label={c.mapTo} city={toCity} country={toCountry} align="right" />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        {km !== null && both ? (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-small text-muted">{c.distance}</span>
            <span data-distance>
              <Figure size="sm">{formatKm(km)}</Figure>
            </span>
            <span className="w-full text-xs text-muted">{c.distanceNote}</span>
          </p>
        ) : (
          <p className="text-small text-muted">{c.distanceWaiting}</p>
        )}
      </div>
    </div>
  );
}

function Place({
  label,
  city,
  country,
  align,
}: {
  label: string;
  city: string;
  country: string;
  align: 'left' | 'right';
}) {
  const chosen = city.trim() !== '';
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 flex min-w-0 items-center gap-1.5',
          align === 'right' && 'justify-end',
        )}
      >
        <span className={cn('truncate text-body', chosen ? 'font-semibold text-foreground' : 'text-muted')}>
          {chosen ? city : '—'}
        </span>
        {chosen ? <CountryTag cc={country} /> : null}
      </p>
    </div>
  );
}
