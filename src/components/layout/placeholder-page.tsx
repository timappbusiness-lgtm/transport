import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Eyebrow, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { Container } from './container';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * Stand-in for a route in UNBUILT_ROUTES, so no link on the site is a 404.
 * Replace the page file when the real screen is built, and drop the route
 * from UNBUILT_ROUTES.
 */
export function PlaceholderPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>
        <Container className="flex min-h-[60vh] flex-col justify-center py-20">
          <Eyebrow>Pagină în lucru</Eyebrow>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)]">{title}</h1>
          <Lede className="mt-4">{children}</Lede>
          <div className="mt-8">
            <Link href={ROUTES.home} className={buttonClasses('secondary', 'md')}>
              Înapoi la prima pagină
            </Link>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
