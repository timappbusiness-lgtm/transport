import Link from 'next/link';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { Container } from './container';

const LINKS = [
  { href: ROUTES.routes, label: 'Trasee și prețuri' },
  { href: ROUTES.carrierSignup, label: 'Pentru transportatori' },
  { href: ROUTES.contact, label: 'Contact' },
  { href: ROUTES.terms, label: 'Termeni' },
  { href: ROUTES.privacy, label: 'Confidențialitate' },
] as const;

export function SiteFooter() {
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
        </nav>
      </Container>
    </footer>
  );
}
