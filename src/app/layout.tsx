import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ro"
      className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
