'use client';

import { useActionState } from 'react';
import { seriesStateAction, type SeriesState } from '@/app/cont/trasee/series-actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { departuresCopy } from '@/content/departures';
import { describe as describeRule } from '@/lib/recurrence';
import type { SeriesRow } from '@/lib/series-source';

const EMPTY: SeriesState = {};
const c = departuresCopy.series;

/**
 * O serie, cu ce urmează din ea.
 *
 * Motivul pauzei se arată întreg, cu propoziția pe care a scris-o baza
 * — „Vehiculul nu mai are documentele valide…" spune omului exact ce
 * are de făcut, iar un „Pe pauză" fără motiv îl trimite să ne scrie.
 */
export function SeriesCard({ row, upcoming }: { row: SeriesRow; upcoming: readonly string[] }) {
  const [state, action, pending] = useActionState(seriesStateAction, EMPTY);

  const ended = row.ended_at !== null;
  const rule = describeRule({
    kind: row.kind,
    weekdays: row.weekdays,
    everyNDays: row.every_n_days,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  });

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body">
            <span className="font-medium">
              {row.from_city} → {row.to_city}
            </span>
            <StatusBadge tone={ended ? 'neutral' : row.is_paused ? 'warning' : 'success'}>
              {ended ? c.ended : row.is_paused ? c.paused : c.live}
            </StatusBadge>
          </p>
          <p className="mt-1 text-small text-muted">
            {rule} · {c.until(row.ends_on)} · {row.plate_number ?? '—'}
          </p>
          <p className="mt-0.5 text-small text-muted">{c.published(row.published)}</p>
        </div>

        {!ended ? (
          <form action={action} className="flex flex-wrap gap-2">
            <input type="hidden" name="series_id" value={row.id} />
            <button
              type="submit"
              name="action"
              value={row.is_paused ? 'reluare' : 'pauza'}
              disabled={pending}
              className={buttonClasses('secondary', 'sm')}
            >
              {row.is_paused ? c.resume : c.pause}
            </button>
            <button
              type="submit"
              name="action"
              value="oprire"
              disabled={pending}
              className="text-small text-danger underline-offset-4 hover:underline"
            >
              {c.end}
            </button>
          </form>
        ) : null}
      </div>

      {row.paused_reason !== null && row.is_paused ? (
        <p className="mt-3 max-w-[62ch] rounded-input border border-warning/45 bg-warning/8 p-2.5 text-small">
          {row.paused_reason}
        </p>
      ) : null}

      {upcoming.length > 0 && !row.is_paused ? (
        <div className="mt-3">
          <p className="text-small text-muted">{c.next}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {upcoming.map((day) => (
              <li
                key={day}
                className="rounded-pill border border-border px-2.5 py-0.5 font-mono text-label tabular-nums"
              >
                {day}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.notice !== undefined ? <FormNotice>{state.notice}</FormNotice> : null}
      <FormError>{state.error}</FormError>
    </li>
  );
}
