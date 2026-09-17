import Link from 'next/link';
import { CarrierHome } from '@/components/app/dashboard/carrier';
import { PhoneVerification } from '@/components/account/phone-verification';
import { TopBar } from '@/components/app/top-bar';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { appCopy } from '@/content/app';
import { requireAccountContext, type AccountContext } from '@/lib/auth/account';
import { loadCarrierDashboard, NO_CARRIER_DASHBOARD } from '@/lib/dashboard-source';
import { publishActions } from '@/lib/navigation';
import { navContextOf } from '@/components/app/nav-context';
import { loadPricing } from '@/lib/plans-source';
import { loadCompanySubscription } from '@/lib/subscription-source';

const h = appCopy.home;

/**
 * Home, which is a different page for each kind of account.
 *
 * A carrier gets the dashboard with data behind it. An individual gets the
 * one honest thing they can do today, because publishing a request is not
 * built yet. A driver gets the page explaining where their assignments will
 * appear, which is the whole of their application for now.
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

  const isCarrier = company.company_type === 'transport' || company.company_type === 'both';
  if (!isCarrier) return <ForwarderHome />;

  // Three reads in parallel: the dashboard itself, the plan the limits come
  // from, and the subscription that says which plan is in force.
  const [data, pricing, subscription] = await Promise.all([
    loadCarrierDashboard(company),
    loadPricing(),
    loadCompanySubscription(company.id),
  ]);

  const plan = pricing.plans.find((candidate) => candidate.code === subscription?.planCode);

  return (
    <CarrierHome
      company={company}
      data={data ?? NO_CARRIER_DASHBOARD}
      contactsLimit={plan?.limits.contactsPerMonth ?? null}
    />
  );
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
        <h2 className="text-[1.125rem]">{c.title}</h2>
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

function IndividualHome({ context }: { context: AccountContext }) {
  const c = appCopy.individual;
  const verified = context.profile?.phone_verified === true;

  return (
    <div className="flex flex-col gap-6">
      {!verified ? (
        <Card className="p-5">
          <h2 className="text-[1rem]">{c.verifyPhone.title}</h2>
          <p className="mt-1.5 max-w-[52ch] text-sm text-muted">{c.verifyPhone.body}</p>
          <div className="mt-4">
            <PhoneVerification phone={context.profile?.phone ?? ''} verified={verified} />
          </div>
        </Card>
      ) : null}

      {/* Until /cerere/noua exists there is one true thing to say here, and
          a fake "cererile mele" list would be the alternative. */}
      <Card className="p-5">
        <h2 className="text-[1rem]">{c.noRequests.title}</h2>
        <p className="mt-1.5 max-w-[56ch] text-sm text-muted">{c.noRequests.body}</p>
        <Link href={ROUTES.routes} className={`${buttonClasses('primary', 'md')} mt-4`}>
          {c.noRequests.action}
        </Link>
      </Card>
    </div>
  );
}

/**
 * A forwarder's dashboard needs requests, and requests are not built. What
 * it can honestly offer is the board of routes.
 */
function ForwarderHome() {
  const c = appCopy.individual;
  return (
    <Card className="p-5">
      <h2 className="text-[1rem]">{c.noRequests.title}</h2>
      <p className="mt-1.5 max-w-[56ch] text-sm text-muted">{c.noRequests.body}</p>
      <Link href={ROUTES.routes} className={`${buttonClasses('primary', 'md')} mt-4`}>
        {c.noRequests.action}
      </Link>
    </Card>
  );
}

function DriverHome() {
  const c = appCopy.driver;
  return (
    <Card className="p-5">
      <h2 className="text-[1rem]">{c.title}</h2>
      <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-muted">{c.body}</p>
    </Card>
  );
}
