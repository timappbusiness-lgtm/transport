/**
 * The contact mask, as the browser sees it.
 *
 * The rule lives in Postgres — `mask_contacts()`, applied by a BEFORE
 * INSERT trigger, so the unmasked text is never written. This file is
 * the warning that comes first: somebody typing a telephone number into
 * a clarification thread should be told before they press send, rather
 * than watching their message come back with a hole in it.
 *
 * It is deliberately NOT the boundary. If these two ever disagree, the
 * database wins and the person sees a masked message — which is the
 * safe direction to fail in. `tests/unit/contact-mask.test.ts` checks
 * the same strings both halves are checked against.
 */

export const MASK = '[contact ascuns până la confirmarea comenzii]';

/**
 * Every pattern, in the order people try them.
 *
 * Order matters: the e-mail rules run first, because an address need
 * not contain digits and running the digit rules first would leave
 * `ion7@x.ro` half-masked.
 */
const PATTERNS: readonly RegExp[] = [
  // A plain address.
  /[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi,
  // Written around the @: "ion at gmail dot com", "ion[at]gmail[dot]com".
  /[\w.%+-]+\s*(?:\[|\()?\s*(?:at|arond)\s*(?:\]|\))?\s*[\w.-]+\s*(?:\[|\()?\s*(?:dot|punct)\s*(?:\]|\))?\s*[a-z]{2,}/gi,
  // An international prefix, before the generic runs, so +40 722 123 456
  // is masked as one thing rather than in pieces.
  /(?:\+|00)\s*\d[\d ().-]{7,}\d/g,
  // A Romanian number in any spacing: a leading zero and eight more digits.
  /\b0[\d ().-]{7,}\d/g,
  // Digits dictated in words. Four in a row is somebody reading a number
  // out, not a sentence about numbers.
  /(?:\b(?:zero|unu|una|doi|două|doua|trei|patru|cinci|șase|sase|șapte|sapte|opt|nouă|noua)\b[\s,.-]*){4,}/gi,
];

/** Any run of digits and separators holding nine or more digits. */
const DIGIT_RUN = /\d[\d ().-]{6,}\d/g;
const MIN_DIGITS = 9;

/**
 * The same replacement the trigger makes.
 *
 * Eager on purpose. A masked word costs the sender one retype; a number
 * that gets through costs the platform the transaction it exists to
 * intermediate.
 */
export function maskContacts(body: string): string {
  let out = body;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, MASK);
  }
  out = out.replace(DIGIT_RUN, (match) =>
    match.replace(/\D/g, '').length >= MIN_DIGITS ? MASK : match,
  );
  return out;
}

/** Whether sending this would change it — which is what the warning says. */
export function wouldBeMasked(body: string): boolean {
  return maskContacts(body) !== body;
}
