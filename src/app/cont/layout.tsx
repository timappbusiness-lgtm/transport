import type { Metadata } from 'next';
import { Container } from '@/components/layout/container';
import { AccountNav, CompanySummary, CompanySwitcher } from '@/components/account/shell';
import { CompanyStatusBanner } from '@/components/account/status-banner';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Contul meu' };

/**
 * The account shell.
 *
 * The middleware already redirects anonymous visitors, but the check runs
 * again here: the middleware is a convenience, the server component is the
 * boundary.
 */
/**
 * Never prerendered: the account area is the session. Without this, a build with no Supabase
 * configuration would prerender the redirect and ship it as a static file.
 */
export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAccountContext(ROUTES.account);

  return (
    <Container className="py-8 sm:py-12">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="flex flex-col gap-5 lg:w-56 lg:flex-none">
          <CompanySummary context={context} />
          <CompanySwitcher context={context} />
          <AccountNav context={context} current={ROUTES.account} />
        </aside>
        <div className="min-w-0 flex-1">
          {context.activeCompany ? (
            <div className="mb-6">
              <CompanyStatusBanner company={context.activeCompany} />
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </Container>
  );
}
