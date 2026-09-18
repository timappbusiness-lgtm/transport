/**
 * „N transportatori verificați circulă pe această rută."
 *
 * The period came out of the sentence, and out of the count with it. The
 * date-aware version was honest and nearly always zero, because a
 * verified carrier who has not posted a route has not said when it
 * travels — and a number that is almost always zero teaches a client that
 * the answer is „nobody". What is counted now is coverage, category and
 * equipment: where a firm works, not what is in its diary.
 *
 * Two things are still done to the sentence and both are grammar rather
 * than product:
 *
 *   * One carrier is „un transportator verificat circulă", not
 *     „1 transportatori verificați circulă". Shipping the plural form with
 *     a 1 in front of it is the kind of detail a Romanian reader reads as
 *     „nobody here checks anything".
 *   * From twenty upwards Romanian puts „de" between the number and the
 *     noun: „20 de transportatori". Without it the sentence is wrong in
 *     exactly the way a machine translation is wrong.
 *
 * The count itself comes from the database and is never adjusted here. A
 * number that is smaller than we would like is a number, and the zero
 * case has its own sentence rather than a rounded-up one.
 */

export const CARRIER_COUNT_COPY = {
  zero:
    'Încă nu avem transportatori verificați pe această rută. Cererea rămâne publicată și te anunțăm când apare unul.',
  zeroLinkLabel: 'Trasee disponibile',
  /** What the number actually counts, said in one line under it. */
  how:
    'Numărăm firmele verificate care acoperă traseul, transportă acest tip de vehicul și au dotările necesare.',
  previewLabel: 'Vezi câți transportatori circulă pe traseu',
  previewPending: 'Se numără…',
} as const;

export function carrierCountSentence(count: number): string {
  if (count <= 0) return CARRIER_COUNT_COPY.zero;
  if (count === 1) {
    return 'Un transportator verificat circulă pe această rută.';
  }
  const noun = count >= 20 ? 'de transportatori' : 'transportatori';
  return `${count} ${noun} verificați circulă pe această rută.`;
}

/**
 * A short server-side memo for the preview in step 4.
 *
 * Somebody stepping back and forth between step 3 and step 4 asks the
 * same question three times in a minute, and each answer costs a scan of
 * every verified carrier. Thirty seconds is long enough to cover that and
 * short enough that a firm which widens its coverage is counted almost at
 * once.
 *
 * Keyed by caller as well as by route: the count excludes the asker's own
 * firm, so two people asking the same question can have two right
 * answers.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { value: number; until: number }>();

export function cacheKey(userId: string, parts: readonly (string | number | boolean | null)[]): string {
  return [userId, ...parts.map((part) => (part === null ? '' : String(part)))].join('|');
}

export function readCache(key: string, now = Date.now()): number | null {
  const hit = cache.get(key);
  if (hit === undefined) return null;
  if (hit.until <= now) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function writeCache(key: string, value: number, now = Date.now()): void {
  // A bounded map, oldest first: this lives for the lifetime of a server
  // instance, and a cache that only grows is a memory leak with a nice name.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, until: now + TTL_MS });
}

/** Test seam: nothing in the application clears it. */
export function clearCarrierCountCache(): void {
  cache.clear();
}
