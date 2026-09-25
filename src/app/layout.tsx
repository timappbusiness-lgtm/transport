import type { Metadata, Viewport } from 'next';
import { THEME_COLOR } from '@/config/theme';
import { IBM_Plex_Mono, Inter, Inter_Tight } from 'next/font/google';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ToastProvider } from '@/components/ui/toast';
import { BRAND_NAME, BRAND_TAGLINE_RO, SITE_URL } from '@/config/brand';
import { OG_IMAGE } from '@/config/brand-assets';
import { indexingMetadata } from '@/lib/seo-indexing';
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
/*
 * 600 is the headline weight. It is the one face added to this list since
 * the system was built, and it is here because 300 at 4rem read as
 * unfinished rather than as elegant — see the note on `h1,h2,h3` in
 * globals.css. 300 stays: it is the soft half of a two-tone headline.
 *
 * Display only. The body keeps 400 and 500, which is all „bold where it
 * carries meaning" needs, so this costs one file on one family rather
 * than a heavier weight everywhere.
 */
const interTight = Inter_Tight({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600'],
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
  description: `${BRAND_NAME}: bursa de transport auto pentru România și Europa. Cereri de transport și transportatori cu documente verificate.`,
  // The homepage sets its own title, description and Open Graph values from
  // the copy in the homepage brief. These are the app-wide defaults.
  // One flag, read in one place — `NEXT_PUBLIC_SEO_INDEXABLE=1` on the
  // production environment turns indexing on for the whole site, and
  // `robots.txt` reads the same flag so the two can never disagree. A page
  // may still say `noindex` for its own reasons; the flag only ever grants
  // permission, never takes it from a page that refused.
  ...indexingMetadata(true),
  // The manifest comes from `src/app/manifest.ts`, which Next links by
  // itself. The picture every shared link carries is drawn by `pnpm brand`.
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: BRAND_NAME,
    images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: 'default',
  },
  // All three drawn from the mark by `pnpm brand`: the SVG for browsers
  // that take one, a 32px PNG for those that do not, and the full-bleed
  // 180px tile iOS rounds by itself.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

/**
 * The colour the browser paints around the app once it is installed.
 *
 * Taken from the same tokens the page uses, so a standalone window does
 * not get a chrome bar in a colour that appears nowhere else on screen.
 */
export const viewport: Viewport = {
  themeColor: THEME_COLOR,
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
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-2 focus:text-body"
        >
          Sari la conținut
        </a>
        {/* Around everything, so any form on any page can say „salvat"
            where the person is looking rather than at the top of a form
            they have scrolled past. */}
        <ToastProvider>
          <SiteHeader />
          <main id="continut">{children}</main>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
