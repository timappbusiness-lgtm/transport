import type { Metadata } from 'next';
import { EyebrowPill, Figure as KeyFigure, StatusBadge } from '@/components/ui/primitives';
import { pilotCopy } from '@/content/pilot';
import {
  chartCeiling,
  chronological,
  countRo,
  defaultRange,
  enoughHistory,
  humanHours,
  parseIsoDate,
  progress,
  type PilotWeek,
} from '@/lib/pilot';
import { PilotTools } from '@/components/admin/pilot-tools';
import { loadAssistedPilot } from '@/lib/onboarding-source';
import { loadPilot } from '@/lib/pilot-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: pilotCopy.meta.title };

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

const c = pilotCopy;

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The pilot, on one page.
 *
 * The exit criteria have been written down since the roadmap and readable
 * nowhere: the data sat in five tables and nothing added it up, which is
 * how a criterion becomes something nobody checks. Access is the admin
 * layout's job — a non-staff visitor gets a 404 — and the two functions
 * behind it refuse them a second time in the database.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const fallback = defaultRange(new Date());
  const from = parseIsoDate(one(params, 'de-la')) ?? fallback.from;
  const to = parseIsoDate(one(params, 'pana-la')) ?? fallback.to;

  const [{ overview, weeks, error }, assisted] = await Promise.all([
    loadPilot(from, to),
    loadAssistedPilot(from, to),
  ]);
  const ordered = chronological(weeks);

  const carriers = progress(overview?.carriers_weekly ?? 0, overview?.carriers_target ?? 20);
  const forwarders = progress(
    overview?.forwarders_weekly ?? 0,
    overview?.forwarders_target ?? 5,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.hero.lede}</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-ground-alt p-4">
        <label className="flex flex-col gap-1 text-body">
          {c.range.from}
          <input
            type="date"
            name="de-la"
            defaultValue={from}
            className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          />
        </label>
        <label className="flex flex-col gap-1 text-body">
          {c.range.to}
          <input
            type="date"
            name="pana-la"
            defaultValue={to}
            className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          />
        </label>
        <button
          type="submit"
          className="rounded-pill border border-border-strong px-4 py-2 text-body"
        >
          {c.range.submit}
        </button>
      </form>

      {error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
          {c.error}
        </p>
      ) : null}

      <section aria-labelledby="criterii" className="flex flex-col gap-3">
        <div>
          <h2 id="criterii" className="text-h3">
            {c.criteria.title}
          </h2>
          <p className="mt-1 max-w-[70ch] text-body text-muted">{c.criteria.lede}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Criterion
            label={c.criteria.carriers}
            progress={carriers}
            noun={['transportator', 'transportatori']}
          />
          <Criterion
            label={c.criteria.forwarders}
            progress={forwarders}
            noun={['casă de expediții', 'case de expediții']}
          />
        </div>

        <p className="text-small text-muted">{c.criteria.definition}</p>
      </section>

      <section aria-labelledby="inscrisi" className="flex flex-col gap-3">
        <h2 id="inscrisi" className="text-h3">
          {c.verified.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure label={c.verified.carriers} value={overview?.verified_carriers ?? 0} />
          <Figure label={c.verified.forwarders} value={overview?.verified_forwarders ?? 0} />
        </div>
        <p className="text-small text-muted">{c.verified.note}</p>
      </section>

      <section aria-labelledby="flux" className="flex flex-col gap-3">
        <h2 id="flux" className="text-h3">
          {c.flow.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure label={c.flow.pending} value={overview?.documents_pending ?? 0} />
          <Figure
            label={c.flow.oldest}
            text={humanHours(overview?.oldest_pending_hours ?? null)}
          />
          <Figure
            label={c.flow.median}
            text={humanHours(overview?.median_hours_to_first_contact ?? null)}
            note={c.flow.medianNote}
          />
          <Figure
            label={c.flow.failed}
            value={overview?.notifications_failed_24h ?? 0}
            tone={(overview?.notifications_failed_24h ?? 0) > 0 ? 'warning' : 'neutral'}
          />
          <Figure
            label={c.flow.staff}
            value={overview?.staff_interventions ?? 0}
            note={c.flow.staffNote}
          />
        </div>
      </section>

      <section aria-labelledby="asistate" className="flex flex-col gap-3">
        <div>
          <h2 id="asistate" className="text-h3">
            {c.assisted.title}
          </h2>
          <p className="mt-1 max-w-[70ch] text-body text-muted">{c.assisted.lede}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure label={c.assisted.started} value={assisted?.started ?? 0} />
          <Figure label={c.assisted.sent} value={assisted?.sent ?? 0} />
          <Figure label={c.assisted.claimed} value={assisted?.claimed ?? 0} />
          <Figure label={c.assisted.expired} value={assisted?.expired ?? 0} />
          <Figure label={c.assisted.verified} value={assisted?.verified ?? 0} />
          <Figure
            label={c.assisted.median}
            text={humanHours(assisted?.median_hours_to_verified ?? null)}
            note={c.assisted.medianNote}
          />
          {/* Kept out of the grid's rhythm on purpose: the four-eyes
              exception is the one number here that should feel like an
              exception rather than a statistic. */}
          <Figure
            label={c.assisted.solo}
            value={assisted?.solo_reviews ?? 0}
            tone={(assisted?.solo_reviews ?? 0) > 0 ? 'warning' : 'neutral'}
            note={c.assisted.soloNote}
          />
        </div>
      </section>

      <section aria-labelledby="unelte" className="flex flex-col gap-3">
        <h2 id="unelte" className="text-h3">
          Unelte de pilot
        </h2>
        <PilotTools />
      </section>

      <section aria-labelledby="saptamani" className="flex flex-col gap-3">
        <h2 id="saptamani" className="text-h3">
          {c.weekly.title}
        </h2>

        {ordered.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface p-4 text-body text-muted">
            {c.weekly.empty}
          </p>
        ) : (
          <>
            {!enoughHistory(ordered) ? (
              <p className="rounded-card border border-border-strong bg-surface p-4 text-body text-muted">
                {c.weekly.tooShort}
              </p>
            ) : null}
            <WeeklyTable weeks={ordered} />
          </>
        )}
      </section>
    </div>
  );
}

function Criterion({
  label,
  progress: p,
  noun,
}: {
  label: string;
  progress: ReturnType<typeof progress>;
  noun: [string, string];
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="text-small text-muted">{label}</p>
      <p className="mt-2 font-mono text-figure-sm tabular-nums">
        {p.current}
        <span className="text-body text-muted"> / {p.target}</span>
      </p>

      <div
        role="img"
        aria-label={`${p.current} din ${p.target}`}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ground-alt"
      >
        <div
          className={cn('h-full rounded-full', p.met ? 'bg-success' : 'bg-border-strong')}
          style={{ width: `${Math.round(p.ratio * 100)}%` }}
        />
      </div>

      <p className="mt-3 text-body">
        {p.met ? (
          <StatusBadge tone="success">{pilotCopy.criteria.met}</StatusBadge>
        ) : (
          <span className="text-muted">
            {pilotCopy.criteria.remaining(p.remaining, countRo(p.target, noun[0], noun[1]))}
          </span>
        )}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  text,
  note,
  tone = 'neutral',
}: {
  label: string;
  value?: number;
  text?: string;
  note?: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-card border bg-surface p-4',
        tone === 'warning' ? 'border-warning/45' : 'border-border',
      )}
    >
      <p className="text-small text-muted">{label}</p>
      <KeyFigure as="p" size="sm" tone="plain" className="mt-1">
        {text ?? value ?? 0}
      </KeyFigure>
      {note !== undefined ? (
        <p className="mt-2 max-w-[42ch] text-small text-muted">{note}</p>
      ) : null}
    </div>
  );
}

function WeeklyTable({ weeks }: { weeks: PilotWeek[] }) {
  const ceiling = chartCeiling(weeks);
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-body">
        <thead className="border-b border-border text-left text-small text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Săptămâna</th>
            <th className="px-4 py-3 font-medium">{pilotCopy.weekly.carriers}</th>
            <th className="px-4 py-3 font-medium">{pilotCopy.weekly.forwarders}</th>
            <th className="px-4 py-3 font-medium">{pilotCopy.weekly.requests}</th>
            <th className="px-4 py-3 font-medium">{pilotCopy.weekly.departures}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {weeks.map((week) => (
            <tr key={week.week_start}>
              <td className="px-4 py-3 whitespace-nowrap font-mono text-small">{week.week_start}</td>
              <td className="px-4 py-3">
                <Bar value={week.active_carriers} ceiling={ceiling} />
              </td>
              <td className="px-4 py-3">
                <Bar value={week.active_forwarders} ceiling={ceiling} />
              </td>
              <td className="px-4 py-3 tabular-nums">{week.requests_published}</td>
              <td className="px-4 py-3 tabular-nums">{week.departures_published}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A number and, next to it, how big it is. */
function Bar({ value, ceiling }: { value: number; ceiling: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-6 tabular-nums">{value}</span>
      <span className="h-1.5 w-full max-w-[8rem] overflow-hidden rounded-full bg-ground-alt">
        <span
          className="block h-full rounded-full bg-border-strong"
          style={{ width: `${Math.round((value / ceiling) * 100)}%` }}
        />
      </span>
    </span>
  );
}
