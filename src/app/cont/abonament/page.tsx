import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { DataRow, EyebrowPill, StatusBadge, type StatusTone } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { requireManagerContext } from '@/lib/auth/guards';
import { formatDateRo } from '@/lib/format';
import { audienceParam, formatLei, limitLabel, type Plan } from '@/lib/plans';
import { loadPricing } from '@/lib/plans-source';
import {
  loadCompanySubscription,
  loadSubscriptionUsage,
  type CompanySubscription,
  type SubscriptionUsage,
} from '@/lib/subscription-source';
import { pluralRo } from '@/lib/requests';

const c = accountCopy.subscription;

export const metadata: Metadata = { title: c.title };

/**
 * The company's plan, and what it has used of it.
 *
 * The usage figures are counted from the same rows the quotas are checked
 * against, so a carrier told "3 din 3" here is a carrier the next reveal
 * will refuse — the page and the rule cannot disagree.
 */
export default async function Page() {
  // A dispatcher is refused here, not merely un-linked from it.
  const context = await requireManagerContext(ROUTES.accountSubscription);
  const company = context.activeCompany;

  const [pricing, subscription, usage] = await Promise.all([
    loadPricing(),
    loadCompanySubscription(company.id),
    loadSubscriptionUsage(company.id),
  ]);

  const plan = pricing.plans.find((p) => p.code === subscription?.planCode) ?? null;
  const audience = company.company_type === 'expeditie' ? 'forwarder' : 'carrier';
  const plansHref = `${ROUTES.plans}?pentru=${audienceParam(audience)}`;
  const hasPlan = subscription !== null && subscription.status !== 'none';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{accountCopy.nav.subscription}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">{c.lede}</p>
      </div>

      {hasPlan ? (
        <Current subscription={subscription} plan={plan} />
      ) : (
        <section className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm text-muted">{c.none}</p>
        </section>
      )}

      {subscription?.pendingRequest ? (
        <Pending request={subscription.pendingRequest} plans={pricing.plans} />
      ) : null}

      {usage && plan ? <Usage usage={usage} plan={plan} /> : null}

      <div>
        <Link href={plansHref} className={buttonClasses('secondary', 'md')}>
          {hasPlan ? c.change : c.choose}
        </Link>
      </div>
    </div>
  );
}

function Current({
  subscription,
  plan,
}: {
  subscription: CompanySubscription;
  plan: Plan | null;
}) {
  const end = subscription.periodEnd === '' ? null : new Date(subscription.periodEnd);

  const tone: StatusTone = subscription.isTrial
    ? 'warning'
    : subscription.status === 'active'
      ? 'success'
      : 'neutral';

  return (
    <section
      aria-labelledby="plan-curent"
      className="rounded-card border border-border bg-surface p-5"
    >
      <h2 id="plan-curent" className="sr-only">
        {c.plan}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[1.125rem]">{plan?.name ?? subscription.planCode}</p>
        <StatusBadge tone={tone}>
          {subscription.isTrial
            ? 'Perioadă gratuită'
            : subscription.status === 'active'
              ? 'Activ'
              : subscription.status}
        </StatusBadge>
      </div>

      {plan ? (
        <p className="mt-1 font-mono text-[0.875rem] tabular-nums text-muted">
          {formatLei(plan.monthlyPrice)} pe lună
        </p>
      ) : null}

      {end ? (
        <p className="mt-4 text-[0.9375rem] text-muted">
          {subscription.isTrial ? c.trialUntil(formatDateRo(end)) : c.renewsOn(formatDateRo(end))}
          {subscription.daysLeft > 0 ? (
            <span className="block text-[0.8125rem]">
              {c.endsIn(pluralRo(subscription.daysLeft, 'zi', 'zile'))}
            </span>
          ) : (
            <span className="block text-[0.8125rem]">{c.ended}</span>
          )}
        </p>
      ) : null}
    </section>
  );
}

function Pending({
  request,
  plans,
}: {
  request: NonNullable<CompanySubscription['pendingRequest']>;
  plans: readonly Plan[];
}) {
  const plan = plans.find((p) => p.code === request.planCode);

  return (
    <section
      aria-labelledby="cerere"
      className="rounded-card border border-warning/40 bg-warning/8 p-5"
    >
      <h2 id="cerere" className="text-[0.9375rem] font-medium">
        {c.pending.title}
      </h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
        {c.pending.body(plan?.name ?? request.planCode, pluralRo(request.months, 'lună', 'luni'))}
      </p>
      {request.status === 'contacted' ? (
        <p className="mt-2 text-[0.8125rem] text-muted">{c.pending.contacted}</p>
      ) : null}
    </section>
  );
}

function Usage({ usage, plan }: { usage: SubscriptionUsage; plan: Plan }) {
  const rows: [string, string][] = [
    [
      c.usage.contacts,
      c.usage.of(
        String(usage.contactsThisMonth),
        limitLabel(plan.limits.contactsPerMonth, '').trim().toLowerCase(),
      ),
    ],
    [
      c.usage.trucks,
      c.usage.of(
        String(usage.activeTruckListings),
        limitLabel(plan.limits.activeTruckListings, '').trim().toLowerCase(),
      ),
    ],
    [c.usage.members, String(usage.members)],
  ];

  return (
    <section aria-labelledby="consum">
      <h2 id="consum" className="text-[1.0625rem]">
        {c.usage.title}
      </h2>
      <div className="mt-3 rounded-card border border-border bg-surface px-5 py-2">
        {rows.map(([label, value]) => (
          <DataRow key={label} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}
