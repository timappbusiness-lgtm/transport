import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { FaqAccordion } from '@/components/faq/accordion';
import { PlanCard, type PlanAction } from '@/components/plans/plan-card';
import { PlanComparison } from '@/components/plans/comparison';
import { PricingControls } from '@/components/plans/controls';
import { Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { plansCopy } from '@/content/plans';
import type { FaqEntry } from '@/content/faq';
import { getAccountContext, isManager, type AccountContext } from '@/lib/auth/account';
import {
  parseAudience,
  parseMonths,
  plansFor,
  type Plan,
  type PricingSettings,
} from '@/lib/plans';
import { loadPricing } from '@/lib/plans-source';
import { loadCompanySubscription, type CompanySubscription } from '@/lib/subscription-source';
import { pluralRo } from '@/lib/requests';

const c = plansCopy;

export const metadata: Metadata = {
  title: c.meta.title,
  description: c.meta.description,
  alternates: { canonical: ROUTES.plans },
  // Nothing on this site is indexed before launch; the app-wide default in
  // the root layout says so, and this repeats it so a later change there
  // does not quietly expose the page.
  robots: { index: false, follow: true },
};

/** Reads the session to decide what each button may do. */
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const audience = parseAudience(params['pentru']);
  const months = parseMonths(params['perioada']);

  const [pricing, context] = await Promise.all([loadPricing(), getAccountContext()]);
  const subscription = await loadCompanySubscription(context?.activeCompany?.id ?? null);

  return (
    <PricingBody
      plans={pricing.plans}
      settings={pricing.settings}
      audience={audience}
      months={months}
      actionFor={(plan) => actionFor(plan, context, subscription)}
    />
  );
}

/**
 * The page, given its data rather than fetching it — which is what lets a
 * populated state be rendered for a screenshot without a database, and what
 * keeps the layout testable.
 *
 * `actionFor` is passed in rather than computed here because deciding what
 * a button may do needs the session, and this component deliberately has no
 * access to one.
 */
export function PricingBody({
  plans,
  settings,
  audience,
  months,
  actionFor: decide,
}: {
  plans: readonly Plan[];
  settings: PricingSettings;
  audience: ReturnType<typeof parseAudience>;
  months: ReturnType<typeof parseMonths>;
  actionFor: (plan: Plan) => PlanAction;
}) {
  const pricing = { plans, settings };
  const shown = plansFor(pricing.plans, audience);

  return (
    <Container className="py-12 sm:py-16">
      <header className="max-w-[48rem]">
        <h1 className="text-h1">{c.header.heading}</h1>
        <Lede className="mt-4">{c.header.subtitle}</Lede>
        <p className="mt-3 text-body text-muted">
          {pricing.settings.trialDays > 0
            ? c.header.trust(pluralRo(pricing.settings.trialDays, 'zi', 'zile'))
            : c.header.noTrial}
        </p>
      </header>

      <div className="mt-10">
        <PricingControls audience={audience} months={months} />
      </div>

      {shown.length > 0 ? (
        <ul
          className={[
            'mt-8 grid gap-4',
            // On a phone the cards scroll sideways with snap points, and the
            // recommended one is first so it is the one in view.
            'auto-cols-[minmax(17rem,85%)] grid-flow-col overflow-x-auto snap-x snap-mandatory pb-2',
            'sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3',
          ].join(' ')}
        >
          {shown.map((plan) => (
            <li
              key={plan.code}
              className={[
                'min-w-0 snap-start',
                // First in the scroller, so the phone opens on it; in price
                // order on desktop, where all three are visible anyway.
                plan.highlight ? 'order-first sm:order-none' : '',
              ].join(' ')}
            >
              <PlanCard
                plan={plan}
                months={months}
                settings={pricing.settings}
                recommendedLabel={c.card.recommended[audience]}
                action={decide(plan)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-body text-muted">{c.card.noPeriod}</p>
      )}

      <PlanComparison plans={shown} />

      <NeverPay />
      <BillingFaq settings={pricing.settings} />
    </Container>
  );
}

/**
 * What the button on a card may do.
 *
 * Every branch is decided here, on the server, from the session and the
 * company's current subscription — the card is handed a decision rather
 * than the facts to make one from, so a client component can never talk
 * itself into showing "Alege planul" to somebody who may not.
 */
function actionFor(
  plan: Plan,
  context: AccountContext | null,
  subscription: CompanySubscription | null,
): PlanAction {
  if (plan.monthlyPrice === 0) return { kind: 'free' };
  if (!context) return { kind: 'signedOut' };

  const company = context.activeCompany;
  if (!company) return { kind: 'signedOut' };
  if (!isManager(context.activeRole)) return { kind: 'notManager' };

  if (subscription?.planCode === plan.code && subscription.status === 'active') {
    return { kind: 'current' };
  }
  if (subscription?.pendingRequest) return { kind: 'pending' };

  return { kind: 'request', companyId: company.id };
}

function NeverPay() {
  return (
    <section aria-labelledby="niciodata" className="mt-16">
      <h2 id="niciodata" className="text-h3">
        {c.never.title}
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {c.never.items.map((item) => (
          <li key={item.title} className="rounded-card border border-border bg-surface p-5">
            <h3 className="text-body font-medium">{item.title}</h3>
            <p className="mt-2 text-body leading-relaxed text-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The billing questions, answered from the settings rather than from
 * memory: what "cum se face plata" says depends on whether billing is
 * still manual, and that is a switch the team owns.
 */
function BillingFaq({ settings }: { settings: PricingSettings }) {
  const entries: FaqEntry[] = c.faq.items.map((item) => ({
    id: item.id,
    question: item.question,
    answer: [answerFor(item, settings)],
  }));

  return (
    <section aria-labelledby="facturare" className="mt-16">
      <h2 id="facturare" className="text-h3">
        {c.faq.title}
      </h2>
      <FaqAccordion entries={entries} columns={2} className="mt-6" />
      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-body">
        {[c.faq.links.faq, c.faq.links.verification].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="link-accent"
          >
            {link.label}
          </Link>
        ))}
      </p>
    </section>
  );
}

function answerFor(
  item: (typeof c.faq.items)[number],
  settings: PricingSettings,
): string {
  if ('manual' in item) return settings.manualBilling ? item.manual : item.automatic;
  if ('answerWithTrial' in item) {
    return settings.trialDays > 0
      ? item.answerWithTrial(pluralRo(settings.trialDays, 'zi', 'zile'))
      : item.answerNoTrial;
  }
  return item.answer;
}
