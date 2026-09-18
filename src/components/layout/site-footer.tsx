import Link from 'next/link';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { SEO_ROOT } from '@/lib/seo-pages';
import { Container } from './container';

const LINKS = [
  // "Trasee și prețuri" was one link because prices lived on the board.
  // They are two pages now, so they are two links.
  { href: ROUTES.routes, label: 'Trasee disponibile' },
  { href: ROUTES.prices, label: 'Prețuri orientative' },
  { href: ROUTES.verification, label: 'Cum verificăm firmele' },
  { href: ROUTES.plans, label: 'Abonamente' },
  { href: ROUTES.carrierSignup, label: 'Pentru transportatori' },
  { href: ROUTES.contact, label: 'Contact' },
  { href: ROUTES.terms, label: 'Termeni' },
  { href: ROUTES.privacy, label: 'Confidențialitate' },
] as const;

/**
 * The landing-page hub is linked only once at least one page is published.
 *
 * Until then the hub says "nothing published yet", and a link in the
 * footer of every page on the site pointing at that is worse than no link.
 * The read is cached, so this costs nothing per render.
 */
export async function SiteFooter() {
  const hasLandingPages = (await loadPublishedPages()).length > 0;

  return (
    <footer className="py-10 text-[0.8125rem] text-muted">
      <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <span>
          {BRAND_NAME} — bursă de transport auto pentru România și Europa.
        </span>
        <nav aria-label="Secundar" className="flex flex-wrap gap-5">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
          {hasLandingPages ? (
            <Link href={SEO_ROOT} className="hover:text-foreground">
              Transport auto pe rute
            </Link>
          ) : null}
        </nav>
      </Container>
    </footer>
  );
}
