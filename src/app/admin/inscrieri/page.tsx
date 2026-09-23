import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Card, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, onboardingRoute } from '@/config/routes';
import { onboardingCopy } from '@/content/inscrieri';
import {
  CONSENT_LABELS,
  STATUS_LABELS,
  STEPS,
  daysUntilPurge,
  doneCount,
  expiryLabel,
  isAssistedStatus,
  needsChasing,
  resumeAt,
  type AssistedStatus,
} from '@/lib/onboarding';
import { loadOnboardings, stepsOf } from '@/lib/onboarding-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: onboardingCopy.admin.meta.title };
export const dynamic = 'force-dynamic';

const c = onboardingCopy.admin;
const FILTERS: (AssistedStatus | null)[] = [null, 'in_lucru', 'trimis', 'revendicat', 'expirat'];

type Params = Record<string, string | string[] | undefined>;

function tone(status: AssistedStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'revendicat') return 'success';
  if (status === 'trimis') return 'warning';
  if (status === 'expirat') return 'danger';
  return 'neutral';
}

/**
 * Înscrierile asistate, cu ce le lipsește.
 *
 * Ordinea vine din `admin_assisted_onboardings()`: întâi ce are nevoie
 * de cineva azi. Accesul este treaba layoutului de administrare — un
 * vizitator primește 404 — iar funcția refuză încă o dată în bază.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const raw = params.stare;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const status = isAssistedStatus(value) ? value : null;

  const rows = await loadOnboardings(status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <EyebrowPill>{c.eyebrow}</EyebrowPill>
          <h1 className="mt-2 text-h2">{c.title}</h1>
          <p className="mt-2 max-w-[68ch] text-sm text-muted">{c.lede}</p>
        </div>
        <Link href={ROUTES.adminOnboardingNew} className={buttonClasses('primary', 'md')}>
          {c.add}
        </Link>
      </div>

      <nav aria-label={c.filters.title} className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <Link
            key={option ?? 'toate'}
            href={
              option === null
                ? ROUTES.adminOnboardings
                : `${ROUTES.adminOnboardings}?stare=${option}`
            }
            aria-current={option === status ? 'page' : undefined}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-small',
              option === status
                ? 'border-transparent bg-foreground text-ground'
                : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {option === null ? c.filters.all : STATUS_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-body-lg">{status === null ? c.empty : c.emptyFiltered}</p>
          <p className="mt-1 max-w-[56ch] text-sm text-muted">
            {status === null ? c.emptyBody : c.emptyFilteredBody}
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const state = stepsOf(row);
            const chasing = needsChasing(row.claim_sent_at, row.status);
            return (
              <li key={row.id}>
                <Card className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                        <span className="font-medium">{row.company_name ?? c.noCompany}</span>
                        <StatusBadge tone={tone(row.status)}>
                          {STATUS_LABELS[row.status]}
                        </StatusBadge>
                        {chasing ? <StatusBadge tone="danger">{c.chase}</StatusBadge> : null}
                      </p>
                      <p className="mt-1 text-small text-muted">
                        {row.contact_name} · {row.contact_phone} · {row.contact_email}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {c.columns.staff}: {row.staff_name} · {c.columns.contact.toLowerCase()}{' '}
                        {CONSENT_LABELS[row.consent_channel].toLowerCase()}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs text-muted">
                        {c.steps(doneCount(state), STEPS.length)}
                      </span>
                      {row.status !== 'revendicat' ? (
                        <Link
                          href={onboardingRoute(row.id, resumeAt(state))}
                          className={buttonClasses('secondary', 'sm')}
                        >
                          {c.open}
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <ol className="mt-3 flex flex-wrap gap-1.5">
                    {STEPS.map((step) => (
                      <li
                        key={step}
                        className={cn(
                          'rounded-pill border px-2.5 py-0.5 text-xs',
                          state[step]
                            ? 'border-success/45 bg-success/8 text-foreground'
                            : 'border-border text-muted',
                        )}
                      >
                        {step}
                      </li>
                    ))}
                  </ol>

                  {row.status === 'trimis' ? (
                    <p className="mt-2 text-xs text-muted">
                      {c.columns.link}: {expiryLabel(row.claim_expires_at)} ·{' '}
                      {c.purgeIn(daysUntilPurge(row.created_at))}
                    </p>
                  ) : null}

                  {chasing && row.claim_sent_at !== null ? (
                    <p className="mt-2 max-w-[62ch] rounded-input border border-warning/45 bg-warning/8 p-2.5 text-small">
                      {c.chaseHint(row.days_open)}
                    </p>
                  ) : null}

                  {row.solo_reviews > 0 ? (
                    <p className="mt-2 text-xs font-medium text-foreground">{c.soloReviews(row.solo_reviews)}</p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
