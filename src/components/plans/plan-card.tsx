import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { RequestPlanButton } from '@/components/plans/request-plan-button';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { plansCopy } from '@/content/plans';
import {
  audienceParam,
  cardFeatures,
  formatLei,
  freeMonthsLabel,
  limitLabel,
  priceAt,
  savingLabel,
  totalLabel,
  type BillingMonths,
  type Plan,
  type PricingSettings,
} from '@/lib/plans';
import { cn } from '@/lib/utils';

const c = plansCopy.card;

/** What the visitor may do about this plan, decided on the server. */
export type PlanAction =
  | { kind: 'free' }
  | { kind: 'signedOut' }
  | { kind: 'request'; companyId: string }
  | { kind: 'current' }
  | { kind: 'pending' }
  | { kind: 'notManager' };

/**
 * One plan.
 *
 * The price shown is the one for the period the visitor selected, and the
 * saving under it is computed from that period's total against the monthly
 * rate — never a percentage, and never a crossed-out figure that was never
 * charged. "2 luni gratuite" appears only when the totals really divide
 * that way; otherwise the saving is stated in lei.
 *
 * The recommendation is labelled "Recomandat pentru transportatori", not
 * "cel mai popular": we have not measured what is popular, and the badge
 * is deliberately nothing like the verified one — a plan is not a check on
 * anybody's documents.
 */
export function PlanCard({
  plan,
  months,
  settings,
  action,
  recommendedLabel,
}: {
  plan: Plan;
  months: BillingMonths;
  settings: PricingSettings;
  action: PlanAction;
  recommendedLabel: string;
}) {
  const price = priceAt(plan, months) ?? priceAt(plan, 1);
  const isFree = plan.monthlyPrice === 0;

  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col p-6',
        plan.highlight && 'border-foreground/25 ring-1 ring-foreground/10',
      )}
    >
      {plan.highlight ? (
        <p className="mb-4 inline-flex w-fit rounded-pill border border-border-strong/45 px-3 py-1 font-mono text-label uppercase tracking-[0.12em] text-muted">
          {recommendedLabel}
        </p>
      ) : null}

      <h3 className="text-lg">{plan.name}</h3>
      {plan.description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{plan.description}</p>
      ) : null}

      <div className="mt-5">
        {isFree ? (
          <p className="font-display text-figure tabular-nums text-accent">
            {c.free}
          </p>
        ) : price ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-figure tabular-nums text-accent">
                {formatLei(price.perMonth)}
              </span>
              <span className="text-body text-muted">{c.perMonth}</span>
            </p>
            {price.months > 1 ? (
              <p className="mt-2 text-sm text-muted">{c.billed(totalLabel(price))}</p>
            ) : null}
            {price.freeMonths !== null ? (
              <p className="mt-2 inline-flex rounded-pill border border-success/35 bg-success/8 px-2.5 py-1 text-small">
                {freeMonthsLabel(price.freeMonths)}
              </p>
            ) : price.saving > 0 ? (
              <p className="mt-2 text-small text-muted">{savingLabel(price.saving)}</p>
            ) : null}
            {settings.vatLabel ? (
              <p className="mt-2 text-xs text-muted">{settings.vatLabel}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">{c.noPeriod}</p>
        )}
      </div>

      <Limits plan={plan} />

      {cardFeatures(plan).length > 0 ? (
        <ul className="mt-5 grid gap-2.5">
          {cardFeatures(plan).map((feature) => (
            <li key={feature.key} className="flex gap-2.5 text-body text-muted">
              {feature.status === 'coming_soon' ? (
                <Icon as={uiIcon('pending')} size="md" className="mt-0.5 text-muted" />
              ) : (
                <Icon as={uiIcon('check')} size="md" className="mt-0.5 text-success" />
              )}
              <span>
                {feature.label}
                {feature.status === 'coming_soon' ? (
                  <span className="text-muted"> · {c.comingSoon}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex-1" />
      <Action plan={plan} months={months} action={action} settings={settings} />
    </Card>
  );
}

function Limits({ plan }: { plan: Plan }) {
  const rows: [string, string][] = [
    [c.limits.contacts, limitLabel(plan.limits.contactsPerMonth, '')],
    [c.limits.trucks, limitLabel(plan.limits.activeTruckListings, '')],
    [c.limits.cargo, limitLabel(plan.limits.activeCargoListings, '')],
    [c.limits.searches, limitLabel(plan.limits.savedSearches, '')],
  ];

  return (
    <dl className="mt-5 grid gap-1.5 border-t border-border pt-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-3">
          <dt className="min-w-0 flex-1 text-small text-muted">{label}</dt>
          <dd className="font-mono text-small tabular-nums">{value.trim()}</dd>
        </div>
      ))}
    </dl>
  );
}

function Action({
  plan,
  months,
  action,
  settings,
}: {
  plan: Plan;
  months: BillingMonths;
  action: PlanAction;
  settings: PricingSettings;
}) {
  switch (action.kind) {
    case 'free':
      return (
        <Link
          href={`${ROUTES.signUpCompany}?tip=transport`}
          className={cn(buttonClasses('secondary', 'md'), 'w-full')}
        >
          {c.cta.free}
        </Link>
      );

    case 'signedOut':
      // The plan and the period ride through sign-up, so somebody who picks
      // "12 luni" here is not asked to pick it again afterwards.
      return (
        <Link
          href={`${ROUTES.signUpCompany}?tip=${plan.audience === 'forwarder' ? 'expeditie' : 'transport'}&plan=${plan.code}&perioada=${months}`}
          className={cn(buttonClasses('primary', 'md'), 'w-full')}
        >
          {c.cta.signedOut}
        </Link>
      );

    case 'request':
      return (
        <RequestPlanButton
          companyId={action.companyId}
          plan={plan}
          months={months}
          settings={settings}
        />
      );

    case 'current':
      return (
        <span className={cn(buttonClasses('secondary', 'md'), 'w-full opacity-50')}>
          {c.cta.current}
        </span>
      );

    case 'pending':
      return (
        <span className={cn(buttonClasses('secondary', 'md'), 'w-full opacity-50')}>
          {c.cta.pending}
        </span>
      );

    case 'notManager':
      return <p className="text-center text-small text-muted">{c.cta.notManager}</p>;
  }
}

/** The plan a visitor is looking at, with the audience kept in the link. */
export function plansHref(plan: Plan, months: BillingMonths): string {
  const params = new URLSearchParams();
  if (plan.audience) params.set('pentru', audienceParam(plan.audience));
  if (months !== 1) params.set('perioada', String(months));
  const query = params.toString();
  return query === '' ? ROUTES.plans : `${ROUTES.plans}?${query}`;
}
