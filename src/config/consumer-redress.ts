/**
 * Where a consumer can take a complaint about us, outside a court.
 *
 * ANPC Order 449/2022 asked every trader selling to consumers online to
 * show two pictograms on its site: SAL (soluționarea alternativă a
 * litigiilor, the national alternative dispute resolution entities) and
 * SOL (soluționarea online a litigiilor, the European Commission's online
 * dispute resolution platform). The footer shows ANPC's own artwork from
 * Annex 2 (`src/components/layout/anpc-badges.tsx`), in the annex's order:
 * SAL, then SOL.
 *
 * - **SAL** points at the ANPC complaints platform, reclamatiisal.anpc.ro,
 *   since ANPC Order 270/2026 (7 April 2026).
 * - **SOL is shown on the owner's decision of 25 September 2026, knowing
 *   the platform behind it is closed.** Regulation (EU) 2024/3228 repealed
 *   it; it stopped taking complaints on 20 March 2025 and closed on
 *   20 July 2025, and ANPC Order 270/2026 removed SOL from Order 449/2022.
 *   The address below now redirects to the Commission's notice that the
 *   platform has closed, which lists the dispute resolution bodies
 *   instead. European guidance tells traders to remove the link, because a
 *   link to a closed service can mislead a consumer. The lawyer decides
 *   whether it stays — `docs/09-verificare-juridica.md`, item 13 — and
 *   removing it is deleting the `sol` entry below.
 *
 * The images are cut from the annex as published (`docs/anpc/anexa-2.png`)
 * by `pnpm anpc`, because the separate files on anpc.ro could not be
 * downloaded from where this was written. They are the official artwork,
 * untouched: nothing here draws, recolours or restyles them.
 */

export interface RedressEntry {
  key: 'sal' | 'sol';
  /** The official wording, exactly, as printed on the badge. */
  label: string;
  /** What a screen reader hears for the badge: the image's alt text. */
  name: string;
  href: string;
  /** The file in `public/`, at twice the size it is shown at. */
  image: { src: string; width: number; height: number };
  /** When the service behind the link closed, if it has. */
  closedOn: string | null;
}

export const CONSUMER_REDRESS: readonly RedressEntry[] = [
  {
    key: 'sal',
    label: 'Soluționarea alternativă a litigiilor',
    name: 'Soluționarea alternativă a litigiilor — ANPC',
    href: 'https://reclamatiisal.anpc.ro/',
    image: { src: '/anpc/sal.png', width: 500, height: 126 },
    closedOn: null,
  },
  {
    key: 'sol',
    label: 'Soluționarea online a litigiilor',
    name: 'Soluționarea online a litigiilor',
    href: 'https://ec.europa.eu/consumers/odr',
    image: { src: '/anpc/sol.png', width: 500, height: 126 },
    closedOn: '2025-07-20',
  },
];

/** The width each badge is shown at on a wide screen, in CSS pixels. */
export const BADGE_WIDTH = 250;

/** The widest a badge grows on a phone, where it takes the full width. */
export const BADGE_MAX_WIDTH = 300;

export function redressEntry(key: RedressEntry['key']): RedressEntry {
  const entry = CONSUMER_REDRESS.find((e) => e.key === key);
  if (!entry) throw new Error(`no consumer redress entry ${key}`);
  return entry;
}

/** The heading of the footer row, for screen readers and for the tests. */
export const REDRESS_LABEL = 'Protecția consumatorilor';
