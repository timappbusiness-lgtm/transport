/**
 * Where a consumer can take a complaint about us, outside a court.
 *
 * ANPC Order 449/2022 asked every trader selling to consumers online to
 * show two pictograms on its site: SAL (soluționarea alternativă a
 * litigiilor, the national alternative dispute resolution entities) and
 * SOL (soluționarea online a litigiilor, the European Commission's online
 * dispute resolution platform). The footer draws both, in the look of the
 * official badges (`src/components/layout/anpc-badges.tsx`).
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
 * Both facts come from public reporting of the two acts and of the
 * Commission's notice; the sandbox this was written in could not open
 * anpc.ro, legislatie.just.ro or ec.europa.eu.
 *
 * The official pictograms are 250×50 and ANPC publishes them for traders
 * to download and host. They are not in the repository: nobody here could
 * download them. Until they are, the badges are our own markup in the
 * official layout and the official blue, with the word „ANPC" where the
 * SAL pictogram carries the authority's coat of arms — drawing a copy of
 * the arms would be imitating an official mark. `docs/configurare-externa.md`
 * §12 has the two steps that swap in the official files.
 */

export interface RedressEntry {
  key: 'sol' | 'sal';
  /** The official wording, exactly; the badge prints it in capitals. */
  label: string;
  href: string;
  /** SAL carries the authority beside its wording, SOL does not. */
  withAuthority: boolean;
  /**
   * The official ANPC pictogram, once somebody has downloaded it from
   * anpc.ro and saved it under `public/`. `null` draws our own badge.
   */
  badge: { src: string; width: 250; height: 50 } | null;
  /** When the service behind the link closed, if it has. */
  closedOn: string | null;
}

export const CONSUMER_REDRESS: readonly RedressEntry[] = [
  {
    key: 'sol',
    label: 'Soluționarea online a litigiilor',
    href: 'https://ec.europa.eu/consumers/odr',
    withAuthority: false,
    badge: null,
    closedOn: '2025-07-20',
  },
  {
    key: 'sal',
    label: 'Soluționarea alternativă a litigiilor',
    href: 'https://reclamatiisal.anpc.ro/',
    withAuthority: true,
    badge: null,
    closedOn: null,
  },
];

export function redressEntry(key: RedressEntry['key']): RedressEntry {
  const entry = CONSUMER_REDRESS.find((e) => e.key === key);
  if (!entry) throw new Error(`no consumer redress entry ${key}`);
  return entry;
}

/** What a screen reader hears for one badge: the wording, then who. */
export function redressName(entry: RedressEntry): string {
  return `${entry.label} — ANPC`;
}

/** The heading of the footer row, for screen readers and for the tests. */
export const REDRESS_LABEL = 'Protecția consumatorilor';
