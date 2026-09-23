import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { RequestFeed } from '@/components/requests/request-feed';
import { Sparkline } from '@/components/requests/sparkline';
import { buttonClasses } from '@/components/ui/button';
import { SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { formatNumber, pluralRo, showFeed, showStats } from '@/lib/requests';
import { loadHomepageActivity, type HomepageActivity } from '@/lib/requests-source';
import { iconForContent } from '@/lib/icons';

const c = homeCopy.activity;

/**
 * What is happening on the platform, said with numbers that exist.
 *
 * Both halves are behind a threshold the team sets. Three published
 * requests are not a statistic and a grid with two cards in it looks like a
 * site nobody uses, so below those numbers the section says plainly that
 * the first requests will appear here — which is true, and costs less than
 * a fabricated counter would.
 *
 * The data is read once a minute for everybody rather than once per
 * visitor: see `loadHomepageActivity`.
 */
export async function Activity() {
  const activity = await loadHomepageActivity();
  return <ActivitySection {...activity} renderedAt={new Date().toISOString()} />;
}

/**
 * The section itself, given its data rather than fetching it.
 *
 * Split out so the arrangement can be rendered — in a test, in a preview —
 * without a database behind it. `Activity` above is the only thing that
 * reads one.
 */
export function ActivitySection({
  stats,
  thresholds,
  requests,
  renderedAt,
}: HomepageActivity & { renderedAt: string }) {
  const withStats = showStats(stats, thresholds);
  const withFeed = showFeed(stats, requests, thresholds);

  return (
    <section id="cereri" className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForContent('cerere')} strong={c.strong} soft={c.soft} />

        {withStats && stats ? (
          <dl className="mt-8 grid gap-6 rounded-card border border-border bg-surface p-5 sm:grid-cols-3 sm:p-6">
            <div className="min-w-0">
              <dt className="font-mono text-label uppercase tracking-[0.12em] text-muted">
                {c.stats.sparklineCaption}
              </dt>
              <dd className="mt-3">
                <Sparkline values={stats.daily} label={c.stats.sparklineLabel} />
              </dd>
            </div>

            <Figure
              value={c.stats.km(formatNumber(stats.totalKm))}
              note={c.stats.kmNote}
            />
            <Figure
              value={c.stats.week(pluralRo(stats.publishedLast7d, 'cerere', 'cereri'))}
              note={c.stats.weekNote}
            />
          </dl>
        ) : null}

        <div className="mt-8">
          {withFeed ? (
            <>
              <RequestFeed initial={requests} renderedAt={renderedAt} />
              <p className="mt-6">
                <Link href={ROUTES.requests} className={buttonClasses('secondary', 'md')}>
                  {c.feed.all}
                </Link>
              </p>
            </>
          ) : (
            <Empty />
          )}
        </div>

        <Cta />
      </Container>
    </section>
  );
}

/**
 * A figure and the sentence that says where it comes from.
 *
 * `dt` before `dd` because that is the order a definition list is defined
 * in and the order a screen reader reads; `flex-col-reverse` puts the
 * number on top, where the eye wants it. `justify-end` is the top in a
 * reversed column, so the cell still aligns with the sparkline beside it.
 */
function Figure({ value, note }: { value: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse justify-end">
      <dt className="mt-2 text-small text-muted">{note}</dt>
      <dd className="font-display text-h2 leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * Below the threshold, or with nothing published yet.
 *
 * No sample cards: a demonstration grid on the homepage of an exchange is
 * indistinguishable from a claim that the exchange is busy.
 */
function Empty() {
  return (
    <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
      <p className="max-w-[54ch] text-body-lg">{c.empty.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
          {c.empty.primary}
        </Link>
        {/* The board itself, not only the form. A carrier reading this
            section wants to see what is there, and "nothing yet" is a
            thing they are allowed to see for themselves — hiding the
            board until it is busy is how a marketplace stays empty. */}
        <Link href={ROUTES.requests} className={buttonClasses('secondary', 'md')}>
          {c.empty.board}
        </Link>
        <Link href={ROUTES.routes} className={buttonClasses('secondary', 'md')}>
          {c.empty.secondary}
        </Link>
      </div>
    </div>
  );
}

/**
 * The three steps, and the button.
 *
 * There is no fourth step about e-mail alerts to carriers whose routes
 * match: `saved_searches` holds the subscriptions, but nothing sends them
 * yet, and a step describing something that does not happen is the kind of
 * copy people find out about later.
 */
function Cta() {
  return (
    <div className="mt-8 grid gap-8 rounded-card border border-border bg-ground-alt p-6 sm:p-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
      <div className="min-w-0">
        <h3 className="text-h2">
          {c.cta.strong} <span className="text-ink-soft">{c.cta.soft}</span>
        </h3>
        <div className="mt-6">
          <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
            {c.cta.button}
          </Link>
          <p className="mt-3 max-w-[38ch] text-small text-muted">{c.cta.note}</p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">
          {c.cta.stepsTitle}
        </p>
        <ol className="mt-4 flex flex-col gap-4">
          {c.cta.steps.map((step, index) => (
            <li key={step} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex size-7 flex-none items-center justify-center rounded-full border border-border-strong font-mono text-xs tabular-nums"
              >
                {index + 1}
              </span>
              <span className="min-w-0 max-w-[52ch] text-body leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
