/**
 * „Mai multe filtre": closed by default, everywhere, always.
 *
 * The panel used to open itself whenever a filter inside it was doing
 * something. On /cereri that was every carrier's every visit — the board
 * opens on „Potrivite cu firma mea", that view was counted as an
 * advanced filter, and the badge said „1" with the panel spread open
 * over the page. A search that looks complicated is a search people
 * skip, so the rule is now simple:
 *
 *   - the panel is closed on first paint, whatever the address carries;
 *   - what it is filtering is said outside it, as a count on the button
 *     and as removable chips under the three main fields;
 *   - opening or closing it is remembered for this tab's session and
 *     screen only (sessionStorage), so a person who opened it keeps it
 *     open while they refine — and a fresh visit starts closed again.
 *
 * Pure: no React, no DOM beyond the Storage interface, so the unit tests
 * pin the rule without a browser.
 */

/** One active advanced filter, shown as a chip; its link removes it. */
export interface FilterChip {
  /** Stable, for React keys and tests: the filter's own key. */
  id: string;
  /** What the chip says: „Țara de plecare: Germania". */
  label: string;
  /** The same address without this filter. */
  href: string;
}

/** The first paint, on every screen, whatever the address carries. */
export const ADVANCED_OPEN_ON_LOAD = false;

const STORAGE_PREFIX = 'coridor:mai-multe-filtre:';
const OPEN = 'deschis';

/** One key per screen: /cereri remembering its panel says nothing about /trasee. */
export function advancedStorageKey(screen: string): string {
  return `${STORAGE_PREFIX}${screen}`;
}

/** Whether this screen's panel was left open earlier in this session. */
export function wasLeftOpen(storage: Pick<Storage, 'getItem'> | null, screen: string): boolean {
  if (storage === null) return false;
  try {
    return storage.getItem(advancedStorageKey(screen)) === OPEN;
  } catch {
    return false;
  }
}

/**
 * Remember the person's choice for the rest of the session.
 *
 * Closing removes the entry rather than writing „closed": closed is the
 * default, and an entry that says so is one more thing that could
 * outlive the rule.
 */
export function rememberChoice(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  screen: string,
  open: boolean,
): void {
  if (storage === null) return;
  try {
    if (open) storage.setItem(advancedStorageKey(screen), OPEN);
    else storage.removeItem(advancedStorageKey(screen));
  } catch {
    // Full or blocked storage: the panel still works, it just forgets.
  }
}

/** „2026-09-24" → „24.09.2026"; anything else as written. */
export function chipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

type Params = Record<string, string | string[] | undefined>;

function first(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The address with some keys removed — and the page number, always:
 * page seven of the old results is rarely page seven of the new ones.
 */
export function hrefWithout(
  base: string,
  params: Params,
  remove: readonly string[],
  pageKey = 'pagina',
): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(params)) {
    if (remove.includes(key) || key === pageKey) continue;
    const value = first(params, key);
    if (value !== null) query.set(key, value);
  }
  const text = query.toString();
  return text === '' ? base : `${base}?${text}`;
}

/** One advanced filter on a screen whose filters are plain URL keys. */
export interface ParamChipDef {
  /** The URL key; a chip is drawn when it carries a value. */
  key: string;
  /** „Stare: activ" from the raw value, or null to draw no chip for it. */
  label: (value: string) => string | null;
}

/**
 * Chips for a screen whose advanced filters are plain query keys — the
 * directory and the staff lists. Each removes its own key and keeps the
 * rest; the boards, whose filters are parsed objects, build theirs in
 * `src/lib/filter-chips.ts` from the same model.
 */
export function chipsFromParams(
  base: string,
  params: Params,
  defs: readonly ParamChipDef[],
  pageKey = 'pagina',
): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const def of defs) {
    const value = first(params, def.key);
    if (value === null) continue;
    const label = def.label(value);
    if (label === null) continue;
    chips.push({ id: def.key, label, href: hrefWithout(base, params, [def.key], pageKey) });
  }
  return chips;
}

/**
 * The staff lists' period, „De la" and „Până la", as two chips: each end
 * can be removed on its own, as each is its own field.
 */
export function periodChipDefs(
  fromLabel: string,
  toLabel: string,
  keys: { from: string; to: string } = { from: 'de-la', to: 'pana-la' },
): ParamChipDef[] {
  return [
    { key: keys.from, label: (v) => `${fromLabel}: ${chipDate(v)}` },
    { key: keys.to, label: (v) => `${toLabel}: ${chipDate(v)}` },
  ];
}

/** A checkbox filter (`value="da"`): its chip is its own label. */
export function checkChipDef(key: string, label: string): ParamChipDef {
  return { key, label: (v) => (v === 'da' ? label : null) };
}

/**
 * The validated filters of a staff list as plain params, without the
 * page: what the chips are built from, so a date the page ignored as
 * malformed draws no chip claiming it is applied.
 */
export function paramsFromSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}
