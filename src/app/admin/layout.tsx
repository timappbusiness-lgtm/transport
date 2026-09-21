import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Administrare' };

const NAV = [
  { href: ROUTES.admin, label: 'Panou' },
  { href: ROUTES.adminPilot, label: 'Pilot' },
  { href: ROUTES.adminDocuments, label: 'Documente de verificat' },
  { href: ROUTES.adminOffers, label: 'Oferte' },
  { href: ROUTES.adminOrders, label: 'Transporturi' },
  { href: ROUTES.adminReports, label: 'Sesizări' },
  { href: ROUTES.adminActivity, label: 'Activitate pe prima pagină' },
  { href: ROUTES.adminPrices, label: 'Prețuri orientative' },
  { href: ROUTES.adminSettings, label: 'Setări pentru lista de firme' },
  { href: ROUTES.adminOptions, label: 'Dotări și servicii' },
  { href: ROUTES.adminPages, label: 'Pagini de destinație' },
  { href: ROUTES.adminImport, label: 'Import din anunț' },
  { href: ROUTES.adminNotifications, label: 'Notificări și joburi' },
  { href: ROUTES.adminDeletions, label: 'Ștergeri de cont' },
  { href: ROUTES.adminCompanies, label: 'Firme în lista publică' },
  { href: ROUTES.adminPlans, label: 'Planuri' },
  { href: ROUTES.adminSubscriptions, label: 'Cereri de abonament' },
  { href: ROUTES.adminTeam, label: 'Echipa platformei' },
  { href: ROUTES.adminAuditLog, label: 'Jurnal de acțiuni' },
] as const;

/**
 * Staff area.
 *
 * Non-staff get a 404, not a 403: a 403 confirms the route exists and that
 * there is something behind it worth finding. The check reads
 * `platform_staff` through RLS, which only returns the caller's own row —
 * the client never gets to say whether it is staff.
 */
/**
 * Never prerendered: staff membership is the session. Without this, a build with no Supabase
 * configuration would prerender the redirect and ship it as a static file.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await getAccountContext();
  if (!context?.isStaff) notFound();

  return (
    <Container className="py-8 sm:py-12">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:flex-none">
          <p className="mb-3 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-muted">
            Administrare
          </p>
          <nav aria-label="Administrare" className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-pill px-3 py-2 text-sm text-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Container>
  );
}
