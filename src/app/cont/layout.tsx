import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { MobileNav } from '@/components/app/mobile-nav';
import { Sidebar } from '@/components/app/sidebar';
import { SkipLink } from '@/components/app/top-bar';
import { StatusBanner } from '@/components/app/status-banner';
import { currentPathname, navContextOf } from '@/components/app/nav-context';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { isDriverAllowed } from '@/lib/auth/guards';
import { pickBanner } from '@/lib/banners';
import { EXPIRY_WINDOW_DAYS } from '@/lib/dashboard-source';
import { activeHref, bottomNav, buildNav } from '@/lib/navigation';
import { loadCompanySubscription } from '@/lib/subscription-source';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Contul meu' };

/**
 * The application shell.
 *
 * The middleware already redirects anonymous visitors, but the check runs
 * again here: the middleware is a convenience, the server component is the
 * boundary. Everything below it is chosen from the session — which company
 * is active, which role, and therefore which menu — and every route the
 * menu omits is refused on the server as well.
 */
/**
 * Never prerendered: the account area is the session. Without this, a build with no Supabase
 * configuration would prerender the redirect and ship it as a static file.
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAccountContext(ROUTES.account);
  const pathname = await currentPathname();

  // A driver's application is two pages. Refusing here rather than on each
  // of the dozen pages they must not reach means a page added later is
  // closed to them by default instead of open by oversight.
  if (context.activeRole === 'driver' && !isDriverAllowed(pathname)) notFound();

  const company = context.activeCompany;
  const [subscription, warnings] = await Promise.all([
    loadCompanySubscription(company?.id ?? null),
    loadBannerCounts(company?.id ?? null),
  ]);

  const items = buildNav(navContextOf(context));
  const current = activeHref(items, pathname);
  const { bar, more } = bottomNav(items);

  const banner = pickBanner({
    company,
    expiringDocuments: warnings.expiringDocuments,
    trialDaysLeft: subscription?.isTrial ? subscription.daysLeft : null,
    quotaReached: false,
  });

  return (
    <>
      <SkipLink />
      <Container className="py-6 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          <aside className="hidden lg:block lg:w-60 lg:flex-none">
            <div className="sticky top-24">
              <Sidebar context={context} pathname={pathname} subscription={subscription} />
            </div>
          </aside>

          {/* The bottom bar is fixed, so the content needs room under it. */}
          <div id="continut" className="min-w-0 flex-1 pb-20 lg:pb-0">
            {banner ? (
              <div className="mb-6">
                <StatusBanner
                  state={banner}
                  company={company}
                  expiringDocuments={warnings.expiringDocuments}
                  trialDaysLeft={subscription?.daysLeft ?? null}
                />
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </Container>

      <MobileNav bar={bar} more={more} current={current} />
    </>
  );
}

/**
 * The one count the banner needs, kept out of the dashboard loader so every
 * page in the account can show the warning without loading a dashboard.
 */
async function loadBannerCounts(
  companyId: string | null,
): Promise<{ expiringDocuments: number }> {
  if (!companyId || !isSupabaseConfigured()) return { expiringDocuments: 0 };

  const supabase = await createClient();
  const horizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('v_company_missing_documents')
    .select('state, valid_until')
    .eq('company_id', companyId);

  if (error) {
    console.error('[cont] document warnings failed', {
      code: error.code,
      message: error.message,
    });
    return { expiringDocuments: 0 };
  }

  return {
    expiringDocuments: (data ?? []).filter(
      (row) =>
        row.state === 'expired' ||
        row.state === 'rejected' ||
        (row.state === 'ok' && row.valid_until !== null && row.valid_until <= horizon),
    ).length,
  };
}
