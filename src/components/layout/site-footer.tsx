import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { operatorShortLine } from '@/config/company';
import { FOOTER_NAV_LEGAL, FOOTER_NAV_PLATFORM } from '@/lib/navigation';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { SEO_ROOT } from '@/lib/seo-pages';
import { AnpcBadges } from './anpc-badges';
import { Container } from './container';


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
    <footer data-site-footer="" className="py-10 text-small text-muted">
      <Container className="flex flex-col gap-6">
        {/* The dash joins the tagline to the name when both fit on one
            line; on a phone the tagline goes under the name, and a line
            that starts with a dash reads as a mistake. */}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Logo size={24} className="text-body text-foreground" />
          <span className="basis-full sm:basis-auto">
            <span className="max-sm:hidden">— </span>transport auto pentru România și Europa, cu firme
            verificate.
          </span>
        </p>

        <nav aria-label="Secundar" className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-5 gap-y-3">
            {FOOTER_NAV_PLATFORM.map((l) => (
              <FooterLink key={l.href} href={l.href} label={l.label} />
            ))}
            {hasLandingPages ? <FooterLink href={SEO_ROOT} label="Transport auto pe rute" /> : null}
          </ul>
          <ul className="flex flex-wrap gap-x-5 gap-y-3">
            {FOOTER_NAV_LEGAL.map((l) => (
              <FooterLink key={l.href} href={l.href} label={l.label} />
            ))}
          </ul>
        </nav>

        {/* Who operates the site, on every page: the identification a
            visitor is owed (Legea 365/2002, art. 5) without having to find
            the contact page first. The full details are on /contact. */}
        <p data-operator="" className="max-w-[72ch] [overflow-wrap:anywhere]">
          Operat de {operatorShortLine()}.
        </p>

        {/* Their own row, under a hairline, never among the links above:
            this is where a consumer looks for somebody who is not us. On
            every page — the root layout draws the footer under the account
            and the staff area too — because the obligation is about the
            site, not about the pages we think a consumer reads. */}
        <div className="border-t border-border pt-6">
          <AnpcBadges />
        </div>
      </Container>
    </footer>
  );
}

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="hover:text-foreground">
        {label}
      </Link>
    </li>
  );
}
