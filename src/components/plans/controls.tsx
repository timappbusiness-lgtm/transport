import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { plansCopy } from '@/content/plans';
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  BILLING_MONTHS,
  MONTHS_LABELS,
  audienceParam,
  type BillingMonths,
  type PlanAudience,
} from '@/lib/plans';
import { cn } from '@/lib/utils';

const c = plansCopy.controls;

/**
 * Both controls are links, not buttons.
 *
 * The audience and the period live in the URL, so a price a carrier is
 * looking at can be sent to somebody else and open on the same figures.
 * That also means the page works before any JavaScript arrives, which for
 * a page whose whole job is stating prices is the point.
 */
export function PricingControls({
  audience,
  months,
}: {
  audience: PlanAudience;
  months: BillingMonths;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <Segmented label={c.audience}>
        {AUDIENCES.map((option) => (
          <Option
            key={option}
            href={href(option, months)}
            active={option === audience}
            label={AUDIENCE_LABELS[option]}
          />
        ))}
      </Segmented>

      <Segmented label={c.billing}>
        {BILLING_MONTHS.map((option) => (
          <Option
            key={option}
            href={href(audience, option)}
            active={option === months}
            label={MONTHS_LABELS[option]}
          />
        ))}
      </Segmented>
    </div>
  );
}

function href(audience: PlanAudience, months: BillingMonths): string {
  const params = new URLSearchParams({ pentru: audienceParam(audience) });
  if (months !== 1) params.set('perioada', String(months));
  return `${ROUTES.plans}?${params.toString()}`;
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-label uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <nav aria-label={label} className="flex flex-wrap gap-1.5">
        {children}
      </nav>
    </div>
  );
}

function Option({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-pill border px-4 py-1.5 text-sm whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
        active
          ? 'border-accent bg-accent text-white'
          : 'border-border text-muted hover:border-border-strong',
      )}
    >
      {label}
    </Link>
  );
}
