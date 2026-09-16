import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BRAND_NAME, BRAND_TAGLINE_RO, SITE_URL } from '@/config/brand';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
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
 * Every page carries the header, which reads the session, so no route can be
 * prerendered. Declared here rather than left to inference: without it a
 * build with no Supabase configuration silently prerenders `/cont` as a
 * redirect and ships it as a static file.
 *
 * Worth revisiting with partial prerendering once the marketing pages carry
 * real traffic.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ro"
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
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
