import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { BrandMark } from '@/components/icons';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES, companyRoutes } from '@/config/routes';
import type { Session } from '@/lib/auth';

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const firstCompany = session.memberships[0];

  return (
    <div className="app-surface min-h-dvh">
      <a
        href="#continut"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[6px] focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
      >
        Sari la conținut
      </a>
      <header className="border-b border-border bg-surface">
        <Container className="flex min-h-[56px] flex-wrap items-center gap-x-6 gap-y-2 py-2">
          <Link href={ROUTES.home} className="mr-auto flex items-center gap-2 font-display text-base font-extrabold">
            <BrandMark className="flex-none" />
            {BRAND_NAME}
          </Link>
          <nav aria-label="Cont" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <Link href={ROUTES.account} className="text-muted hover:text-foreground">
              Contul meu
            </Link>
            {firstCompany ? (
              <>
                <Link href={companyRoutes(firstCompany.companyId).documents} className="text-muted hover:text-foreground">
                  Documente
                </Link>
                <Link href={companyRoutes(firstCompany.companyId).fleet} className="text-muted hover:text-foreground">
                  Flotă
                </Link>
              </>
            ) : null}
            {session.isStaff ? (
              <Link href={ROUTES.adminDocuments} className="font-medium text-foreground hover:text-accent">
                Administrare
              </Link>
            ) : null}
          </nav>
          <form action={signOut}>
            <button type="submit" className={buttonClasses('secondary', 'sm')}>
              Ieșire
            </button>
          </form>
        </Container>
      </header>
      <main id="continut">
        <Container className="py-8">{children}</Container>
      </main>
    </div>
  );
}
