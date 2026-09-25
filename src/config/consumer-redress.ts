/**
 * Where a consumer can take a complaint about us, outside a court.
 *
 * ANPC Order 449/2022 asked every trader selling to consumers online to
 * show two pictograms on its site: SAL (soluționarea alternativă a
 * litigiilor, the national alternative dispute resolution entities) and
 * SOL (soluționarea online a litigiilor, the European Commission's online
 * dispute resolution platform).
 *
 * Only one of them is shown, on purpose:
 *
 * - **SOL is gone.** Regulation (EU) 2024/3228 repealed the online dispute
 *   resolution platform; it stopped taking complaints on 20 March 2025 and
 *   closed on 20 July 2025, and traders were expected to remove the link by
 *   then. ANPC Order 270/2026 (7 April 2026) removed SOL from Order
 *   449/2022. A link to it today points at a closed service, which is the
 *   one thing a consumer notice must not do. It stays below, retired, so
 *   the reason travels with the code and so a test can prove no page links
 *   to it.
 * - **SAL remains**, and since Order 270/2026 it points at the ANPC
 *   complaints platform, reclamatiisal.anpc.ro.
 *
 * Both facts come from public reporting of the two acts; the sandbox this
 * was written in could not open anpc.ro or legislatie.just.ro. The lawyer
 * confirms them — `docs/09-verificare-juridica.md`, item 13.
 *
 * The official pictogram is 250×50 and ANPC publishes it for traders to
 * download. It is not in the repository: nobody here could download it,
 * and drawing a copy would be imitating an official mark. Until the file
 * is added, the footer shows a plain button with the official wording and
 * the official link — see `docs/configurare-externa.md` for the two steps
 * that swap in the pictogram.
 */

export interface RedressEntry {
  key: 'sal';
  /** The official wording, exactly. */
  label: string;
  /** The short name printed above the wording on the plain button. */
  short: string;
  href: string;
  /**
   * The official ANPC pictogram, once somebody has downloaded it from
   * anpc.ro and saved it under `public/`. `null` draws the plain button.
   */
  badge: { src: string; width: 250; height: 50 } | null;
}

export const CONSUMER_REDRESS: readonly RedressEntry[] = [
  {
    key: 'sal',
    label: 'Soluționarea alternativă a litigiilor',
    short: 'ANPC · SAL',
    href: 'https://reclamatiisal.anpc.ro/',
    badge: null,
  },
];

/** What used to be required and must not come back without the lawyer. */
export const RETIRED_REDRESS = {
  sol: {
    label: 'Soluționarea online a litigiilor',
    href: 'https://ec.europa.eu/consumers/odr',
    closedOn: '2025-07-20',
    reason: 'Regulamentul (UE) 2024/3228 a desființat platforma; Ordinul ANPC 270/2026 a scos-o din Ordinul 449/2022.',
  },
} as const;

/** The heading of the footer row, for screen readers and for the tests. */
export const REDRESS_LABEL = 'Protecția consumatorilor';
