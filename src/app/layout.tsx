import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter, Inter_Tight } from 'next/font/google';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BRAND_NAME, BRAND_TAGLINE_RO, SITE_URL } from '@/config/brand';
import './globals.css';

/*
 * Exactly the weights the system uses, and no others: 300 for display,
 * 400 for body, 500 for emphasis and controls.
 *
 * Google serves the variable file for the two sans families whether or not
 * discrete weights are named, so naming them costs nothing there. It does
 * drop the IBM Plex Mono 500 face, which was fetched on every visit and
 * never rendered: mono is eyebrow labels and tabular data, always at 400.
 */
const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-inter',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400'],
  variable: '--font-plex-mono',
  display: 'swap',
});

// latin-ext is required: without it ă, â, î, ș and ț fall back to a second
// face mid-word.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} — ${BRAND_TAGLINE_RO}`,
    template: `%s — ${BRAND_NAME}`,
  },
  description:
    'Bursă de transport auto pentru România și Europa. Cereri de transport și transportatori cu documente verificate.',
  // The homepage sets its own title, description and Open Graph values from
  // the copy in the homepage brief. These are the app-wide defaults.
  robots: { index: false, follow: false }, // TODO: flip to index on launch
};

/**
 * Every page carries the header, and the header reads the session, so no
 * route can be prerendered.
 *
 * This is declared rather than inferred on purpose. Without it the build
 * output depends on whether an .env file happened to exist: with Supabase
 * configured the homepage comes out dynamic, without it static — and the
 * static one would then call cookies() at request time in production. A
 * build that differs by environment is worse than a slower one.
 *
 * Suspending the session-dependent half of the header (see site-header.tsx)
 * is the shape this needs to become partially prerenderable. Turning that
 * on means enabling PPR, which is a decision for the team, not a build flag
 * to slip into a design pull request.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ro"
      className={`${interTight.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body>
        <a
          href="#continut"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          Sari la conținut
        </a>
        <SiteHeader />
        <main id="continut">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
