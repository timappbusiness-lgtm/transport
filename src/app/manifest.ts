import type { MetadataRoute } from 'next';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { BACKGROUND_COLOR, THEME_COLOR } from '@/config/theme';

/**
 * The web manifest, served at `/manifest.webmanifest`.
 *
 * Built from `BRAND_NAME` rather than written as a JSON file in `public/`,
 * so the name an installed app shows under its icon changes with the
 * constant and needs nothing regenerated. The icons it lists are the ones
 * `pnpm brand` draws from the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: `${BRAND_NAME}: bursa de transport auto pentru România și Europa. Cereri, trasee și transportatori cu documente verificate.`,
    lang: 'ro',
    dir: 'ltr',
    start_url: ROUTES.account,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Publică o cerere', url: ROUTES.newRequest },
      { name: 'Cereri de transport', short_name: 'Cereri', url: ROUTES.requests },
      { name: 'Trasee disponibile', short_name: 'Trasee', url: ROUTES.routes },
    ],
  };
}
