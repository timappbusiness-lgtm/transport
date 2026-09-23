import Link from 'next/link';
import { CarrierHome } from '@/components/app/dashboard/carrier';
import { OrdersWidget } from '@/components/orders/orders-widget';
import { RatingsWidget } from '@/components/ratings/ratings-widget';
import { PhoneVerification } from '@/components/account/phone-verification';
import { TopBar } from '@/components/app/top-bar';
import { buttonClasses } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { appCopy } from '@/content/app';
import { requestsCopy } from '@/content/cereri';
import { requireAccountContext, type AccountContext } from '@/lib/auth/account';
import { loadCarrierDashboard, NO_CARRIER_DASHBOARD } from '@/lib/dashboard-source';
import { FEATURES } from '@/lib/features';
import {
  loadEligibleVehicles,
  loadMyPendingOffers,
  loadOfferQuota,
  loadOfferSettings,
  loadOwnListings,
} from '@/lib/offers-source';
import { formatWindow } from '@/lib/departures';
import { isOnBoard, type MyRequest } from '@/lib/my-requests';
import { loadMyRequests } from '@/lib/my-requests-source';
import { HandoverBanner } from '@/components/onboarding/handover-banner';
import { loadHandover } from '@/lib/onboarding-source';
import { publishActions } from '@/lib/navigation';
import { navContextOf } from '@/components/app/nav-context';
import { loadMyOrders } from '@/lib/orders-source';
import { loadMyRatings } from '@/lib/ratings-source';
import { loadPricing } from '@/lib/plans-source';
import { loadCompanySubscription } from '@/lib/subscription-source';

const h = appCopy.home;

/**
 * Home, which is a different page for each kind of account.
 *
 * A carrier gets the dashboard with data behind it. An individual and a
 * forwarder get their own requests, which phase 2 finally gives them
 * something to put in. A driver gets the page explaining where their
 * assignments will appear, which is the whole of their application for now.
 */
export default async function Page() {
  const context = await requireAccountContext(ROUTES.account);
  const firstName = context.profile?.full_name?.split(' ')[0] ?? null;
  const actions = publishActions(navContextOf(context));

  return (
    <div className="flex flex-col gap-8">
      <TopBar title={h.greeting(firstName)} actions={actions} />
      <Body context={context} />
    </div>
  );
}

async function Body({ context }: { context: AccountContext }) {
  if (context.activeRole === 'driver') return <DriverHome />;

  const company = context.activeCompany;
  if (!company) return <NoCompany context={context} />;

  // Nothing for a firm nobody onboarded: `assisted_handover_summary()`
  // returns no row, and the banner never renders. It stays for good
  // rather than being dismissible — a list of what somebody else typed
  // into your account is worth re-reading in a month, and the one thing
  // we want people to do with it is check it.
  const handover = await loadHandover(company.id);

  const banner = handover === null ? null : <HandoverBanner summary={handover} />;

  const isCarrier = company.company_type === 'transport' || company.company_type === 'both';
  if (!isCarrier) {
    return (
      <>
        {banner}
        <ForwarderHome context={context} />
      </>
    );
  }

  // Three reads in parallel: the dashboard itself, the plan the limits come
  // from, and the subscription that says which plan is in force.
  const [data, pricing, subscription] = await Promise.all([
    loadCarrierDashboard(company),
    loadPricing(),
    loadCompanySubscription(company.id),
  ]);

  const plan = pricing.plans.find((candidate) => candidate.code === subscription?.planCode);
  const dashboard = data ?? NO_CARRIER_DASHBOARD;
  const orders = FEATURES.transports ? await loadMyOrders('active') : [];
  const pending = FEATURES.ratings ? await loadMyRatings('de-dat') : [];

  return (
    <>
      {banner}
      <OrdersWidget orders={orders} side="carrier" />
      <RatingsWidget pending={pending} />
      <CarrierHome
        company={company}
        context={context}
        data={dashboard}
        contactsLimit={plan?.limits.contactsPerMonth ?? null}
        offering={FEATURES.offers ? await loadOffering(context, company, dashboard.matches) : null}
      />
    </>
  );
}

/**
 * The fleet, the ceilings, the plan's room and the offers already sent —
 * four reads for the whole page rather than four for each match.
 */
async function loadOffering(
  context: AccountContext,
  company: NonNullable<AccountContext['activeCompany']>,
  matches: readonly { id: string }[],
) {
  const ids = matches.map((match) => match.id);
  const [vehicles, settings, quota, pending, own] = await Promise.all([
    company.company_type === 'expeditie'
      ? Promise.resolve([])
      : loadEligibleVehicles(company.id),
    loadOfferSettings(),
    loadOfferQuota(),
    loadMyPendingOffers(ids),
    loadOwnListings(
      ids,
      context.user.id,
      context.memberships.map((membership) => membership.company.id),
    ),
  ]);
  return { vehicles, settings, quota, pending: Object.fromEntries(pending), own };
}

/**
 * Somebody with no company: either an individual, or a company account
 * that has not created its firm yet.
 */
function NoCompany({ context }: { context: AccountContext }) {
  const isIndividual = context.profile?.account_type === 'individual';

  if (!isIndividual) {
    const c = accountCopy.needsCompany;
    return (
      <Card className="p-6">
        <h2 className="text-lg">{c.title}</h2>
        <p className="mt-2 max-w-[52ch] text-sm text-muted">{c.lede}</p>
        <Link
          href={ROUTES.accountCompanyCreate}
          className={`${buttonClasses('primary', 'md')} mt-5`}
        >
          {c.action}
        </Link>
      </Card>
    );
  }

  return <IndividualHome context={context} />;
}

async function IndividualHome({ context }: { context: AccountContext }) {
  const c = appCopy.individual;
  const verified = context.profile?.phone_verified === true;
  const [requests, orders, pending] = await Promise.all([
    loadMyRequests(context),
    FEATURES.transports ? loadMyOrders('active') : Promise.resolve([]),
    FEATURES.ratings ? loadMyRatings('de-dat') : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Not a formality: the publish guard refuses a private person's
          request without a confirmed number, so this card is the difference
          between a request on the board and one waiting as a draft. */}
      {!verified ? (
        <Card className="p-5">
          <h2 className="text-base">{c.verifyPhone.title}</h2>
          <p className="mt-1.5 max-w-[52ch] text-sm text-muted">{c.verifyPhone.body}</p>
          <div className="mt-4">
            <PhoneVerification phone={context.profile?.phone ?? ''} verified={verified} />
          </div>
        </Card>
      ) : null}

      <OrdersWidget orders={orders} side="client" />
      <RatingsWidget pending={pending} />

      <RequestsPanel requests={requests} />

      <Card className="p-5">
        <h2 className="text-base">{c.routes.title}</h2>
        <p className="mt-1.5 max-w-[56ch] text-sm text-muted">{c.routes.body}</p>
        <Link href={ROUTES.routes} className={`${buttonClasses('secondary', 'md')} mt-4`}>
          {c.routes.action}
        </Link>
      </Card>
    </div>
  );
}

/** A forwarder posts on the main board; the panel is the same one. */
async function ForwarderHome({ context }: { context: AccountContext }) {
  const [requests, orders, pending] = await Promise.all([
    loadMyRequests(context),
    FEATURES.transports ? loadMyOrders('active') : Promise.resolve([]),
    FEATURES.ratings ? loadMyRatings('de-dat') : Promise.resolve([]),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <OrdersWidget orders={orders} side="client" />
      <RatingsWidget pending={pending} />
      <RequestsPanel requests={requests} />
    </div>
  );
}

/**
 * The last few requests, or the one thing to do when there are none.
 *
 * Three rather than all of them: this is a dashboard, and the full list is
 * one click away in the menu.
 */
function RequestsPanel({ requests }: { requests: MyRequest[] }) {
  const c = appCopy.individual;

  if (requests.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base">{c.noRequests.title}</h2>
        <p className="mt-1.5 max-w-[56ch] text-sm text-muted">{c.noRequests.body}</p>
        <Link href={ROUTES.newRequest} className={`${buttonClasses('primary', 'md')} mt-4`}>
          {c.noRequests.action}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base">{c.requests.title}</h2>
        <Link
          href={ROUTES.accountRequests}
          className="text-sm text-muted underline-offset-4 hover:underline"
        >
          {c.requests.all}
        </Link>
      </div>

      <ul className="mt-4 flex flex-col">
        {requests.slice(0, 3).map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border py-3 last:border-b-0"
          >
            <span className="min-w-0 text-sm">
              {request.fromCity} → {request.toCity}
              <span className="block text-xs text-muted">
                {formatWindow(request.loadingFrom, request.loadingTo)}
              </span>
            </span>
            <StatusBadge tone={isOnBoard(request.status) ? 'success' : 'neutral'}>
              {requestsCopy.status[request.status as keyof typeof requestsCopy.status]}
            </StatusBadge>
          </li>
        ))}
      </ul>

      <Link href={ROUTES.newRequest} className={`${buttonClasses('primary', 'sm')} mt-5`}>
        {c.noRequests.action}
      </Link>
    </Card>
  );
}

function DriverHome() {
  const c = appCopy.driver;
  return (
    <Card className="p-5">
      <h2 className="text-base">{c.title}</h2>
      <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">{c.body}</p>
    </Card>
  );
}
