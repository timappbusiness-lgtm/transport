import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MASK, maskContacts, wouldBeMasked } from '@/lib/contact-mask';

/**
 * The browser's copy of the mask.
 *
 * The rule that matters is the trigger in Postgres, checked by the MSK
 * block of `supabase/tests/rls_test.sql` against these same strings.
 * What is checked here is that the warning shown before sending agrees
 * with what will actually happen — a warning that fires on the wrong
 * things is a warning people learn to ignore.
 */

const CAUGHT = [
  ['a plain mobile', 'sună-mă la 0722123456'],
  ['spaced in threes', '0722 123 456'],
  ['spaced in twos', '07 22 33 44 55'],
  ['with dots', '0722.123.456'],
  ['with dashes', '0722-123-456'],
  ['in brackets', '(0722) 123 456'],
  ['the international form', '+40 722 123 456'],
  ['the 00 prefix', '0040722123456'],
  ['a foreign number', '+49 171 1234567'],
  ['a plain e-mail', 'scrie la ion.popescu@gmail.com'],
  ['an e-mail with a digit in it', 'ion7@example.ro'],
  ['" at " and " dot "', 'ion at gmail dot com'],
  ['[at] and [dot]', 'ion[at]gmail[dot]com'],
  ['(at) and (dot)', 'ion(at)gmail(dot)com'],
  ['the Romanian words', 'ion arond gmail punct com'],
  ['digits spelled out', 'zero șapte doi doi unu doi trei'],
  ['spelled out without diacritics', 'zero sapte doi doi unu doi trei'],
] as const;

describe('what the mask catches', () => {
  for (const [name, text] of CAUGHT) {
    it(name, () => {
      const masked = maskContacts(text);
      expect(masked).toContain(MASK);
      expect(wouldBeMasked(text)).toBe(true);
    });
  }

  it('catches one inside an ordinary sentence', () => {
    const masked = maskContacts('Bună, sunați-mă la 0722123456 ca să vorbim.');
    expect(masked).not.toContain('0722123456');
    expect(masked).toContain('Bună, sunați-mă la');
    expect(masked).toContain('ca să vorbim.');
  });

  it('catches two in one message', () => {
    const masked = maskContacts('0722123456 sau ion@example.ro');
    expect(masked).not.toContain('0722123456');
    expect(masked).not.toContain('ion@example.ro');
  });
});

const LEFT_ALONE = [
  ['a price', 'pot face 2400 lei'],
  ['a date', 'încarc pe 12.03.2027'],
  ['a weight', 'cântărește 1500 kg'],
  ['a year', 'un Golf din 2015'],
  ['a distance', 'sunt 1200 km'],
  ['two numbers in a sentence', '2400 lei, 3 zile'],
  ['a plain answer', 'Da, pot marți dimineață.'],
  ['a plate', 'vehiculul CJ 12 ABC'],
] as const;

describe('what it leaves alone', () => {
  // An interface that eats every number in a sentence about a transport
  // is an interface nobody can use to discuss a transport.
  for (const [name, text] of LEFT_ALONE) {
    it(name, () => {
      expect(maskContacts(text)).toBe(text);
      expect(wouldBeMasked(text)).toBe(false);
    });
  }
});

describe('the two halves agree', () => {
  const migration = readFileSync(
    'supabase/migrations/20260922100000_faza2_oferte.sql',
    'utf8',
  );

  it('uses the same placeholder text', () => {
    // The screen explains the placeholder, so a second wording would
    // leave one of the two explanations wrong.
    expect(migration).toContain(MASK);
  });

  it('counts digits to the same threshold', () => {
    expect(migration).toContain(">= 9");
  });
});
