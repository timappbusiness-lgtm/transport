import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { CONSUMER_REDRESS, REDRESS_LABEL, type RedressEntry } from '@/config/consumer-redress';
import { FOOTER_NAV } from '@/lib/navigation';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { SEO_ROOT } from '@/lib/seo-pages';
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
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Logo size={24} className="text-body text-foreground" />
            <span>— bursă de transport auto pentru România și Europa.</span>
          </p>
          <nav aria-label="Secundar" className="flex flex-wrap gap-5">
            {FOOTER_NAV.map((l) => (
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
        </div>

        {/* Their own row, under a hairline, never among the links above:
            this is where a consumer looks for somebody who is not us. On
            every page — the root layout draws the footer under the account
            and the staff area too — because the obligation is about the
            site, not about the pages we think a consumer reads. No icon:
            nothing here may look like a seal it is not. */}
        <section
          aria-label={REDRESS_LABEL}
          data-consumer-redress=""
          className="flex flex-wrap items-center gap-3 border-t border-border pt-6"
        >
          {CONSUMER_REDRESS.map((entry) => (
            <RedressLink key={entry.key} entry={entry} />
          ))}
        </section>
      </Container>
    </footer>
  );
}

/**
 * One ANPC entry: the official pictogram once it has been downloaded,
 * until then a plain button with the official wording.
 *
 * The plain button is deliberately not the pictogram's shape or size —
 * a 250×50 box with a logo-like mark would be imitating an official sign.
 */
function RedressLink({ entry }: { entry: RedressEntry }) {
  const external = { href: entry.href, target: '_blank', rel: 'noopener' } as const;
  const newTab = <span className="sr-only"> (se deschide într-o filă nouă)</span>;

  if (entry.badge) {
    return (
      <a {...external} data-redress={entry.key} className="inline-flex">
        <Image
          src={entry.badge.src}
          width={entry.badge.width}
          height={entry.badge.height}
          alt={entry.label}
          unoptimized
        />
        {newTab}
      </a>
    );
  }

  return (
    <a
      {...external}
      data-redress={entry.key}
      className="inline-flex min-h-11 flex-col justify-center rounded-input border border-border-strong bg-surface px-4 py-1.5 text-foreground hover:bg-ground-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">{entry.short}</span>
      <span className="font-medium">{entry.label}</span>
      {newTab}
    </a>
  );
}
