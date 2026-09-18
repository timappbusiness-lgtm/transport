import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The copy is Romanian, and stays Romanian.
 *
 * Two ways that slips, both of which look fine to whoever wrote them and
 * wrong to every Romanian who reads them:
 *
 *   - **Diacritics dropped.** "Fara" and "si" are how a keyboard in a
 *     hurry writes "fără" and "și". One of them in a heading is the whole
 *     page looking machine-translated.
 *   - **English left in.** A "Submit" or a "Loading..." that survived a
 *     component copied from somewhere else.
 *
 * Only display copy is scanned. Slugs and paths are deliberately written
 * without diacritics — `/intrebari-frecvente` is the correct URL and
 * `întrebări` in it would be a bug — so anything that looks like one is
 * skipped rather than corrected.
 */

const CONTENT_DIR = join(process.cwd(), 'src', 'content');

/** Words whose diacritic-free spelling is never right in Romanian copy. */
const MISSING_DIACRITICS: [RegExp, string][] = [
  [/\bsi\b/, 'și'],
  [/\bfara\b/, 'fără'],
  [/\bRomania\b/, 'România'],
  [/\btara\b/, 'țara'],
  [/\btari\b/, 'țări'],
  [/\bmasin/, 'mașin'],
  [/\bsofer/, 'șofer'],
  [/\bincarc/, 'încărc'],
  [/\badauga\b/, 'adaugă'],
  [/\bsterge\b/, 'șterge'],
  [/\bintrebar/, 'întrebăr'],
  [/\bOptional\b/, 'Opțional'],
  [/\bacum\s+cate\b/, 'câte'],
  [/\bpret\b/i, 'preț'],
  [/\bplata\s+lunara\b/, 'lunară'],
];

/** English that has no business in a Romanian interface. */
const ENGLISH_LEFTOVERS = [
  /\bSubmit\b/,
  /\bCancel\b/,
  /\bDelete\b/,
  /\bLoading\b/,
  /\bPlease\b/,
  /\bSettings\b/,
  /\bPassword\b/,
  /\bSign (in|up)\b/,
  /\bTry again\b/,
  /\bSomething went wrong\b/,
  /\bNot found\b/,
];

interface Literal {
  file: string;
  line: number;
  text: string;
}

/** Every string literal in the content files that a person could read. */
function displayLiterals(): Literal[] {
  const out: Literal[] = [];

  for (const name of readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.ts'))) {
    const lines = readFileSync(join(CONTENT_DIR, name), 'utf8').split('\n');

    lines.forEach((line, index) => {
      // Comments explain the copy; they are not the copy.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;

      for (const match of line.matchAll(/'([^'\\\n]{3,})'|"([^"\\\n]{3,})"/g)) {
        const text = match[1] ?? match[2] ?? '';
        // A path, a slug, a CSS class list or a key — none of them copy.
        if (text.startsWith('/') || text.startsWith('#')) continue;
        if (/^[a-z0-9-]+$/.test(text)) continue;
        if (/^[a-z-]+(\s+[a-z0-9:/[\]().-]+)+$/.test(text) && !/[ăâîșț]/i.test(text)) continue;
        out.push({ file: name, line: index + 1, text });
      }
    });
  }

  return out;
}

describe('the Romanian copy', () => {
  const literals = displayLiterals();

  it('there is copy to check at all', () => {
    // A scan that finds nothing to scan passes silently and proves nothing.
    expect(literals.length).toBeGreaterThan(200);
  });

  it('never drops a diacritic where one is required', () => {
    const found = literals.flatMap(({ file, line, text }) =>
      MISSING_DIACRITICS.filter(([pattern]) => pattern.test(text)).map(
        ([, correct]) => `${file}:${line} "${text.slice(0, 60)}" — should be "${correct}"`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('carries no English left over from somewhere else', () => {
    const found = literals.flatMap(({ file, line, text }) =>
      ENGLISH_LEFTOVERS.filter((pattern) => pattern.test(text)).map(
        () => `${file}:${line} "${text.slice(0, 60)}"`,
      ),
    );
    expect(found).toEqual([]);
  });

  it('uses the Romanian comma-below letters, not the Turkish cedillas', () => {
    // ş (U+015F) and ţ (U+0163) are Turkish. They render close enough that
    // nobody notices, and they break search, sorting and screen readers.
    const found = literals
      .filter(({ text }) => /[şţŞŢ]/.test(text))
      .map(({ file, line, text }) => `${file}:${line} "${text.slice(0, 60)}"`);
    expect(found).toEqual([]);
  });
});
