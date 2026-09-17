import { describe, expect, it } from 'vitest';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { directoryCopy } from '@/content/directory';
import { STATIC_FAQ, faqCopy } from '@/content/faq';
import { accountCopy } from '@/content/account';

/**
 * These guard the copy rules, not the wording.
 *
 * The reference site we were shown sells itself with "cea mai mare
 * comunitate", a row of decorative stars and "2500+ firme". Every one of
 * those is a claim nobody can check. Wording changes freely here; what must
 * not change is that the page states no figure it cannot produce and makes
 * no promise the platform does not enforce.
 */

/**
 * Every string in a copy tree, with the sentences that frame a figure
 * called so the rules below see the finished sentence rather than skip it.
 * The placeholder carries no digits on purpose: a rule that forbids a
 * literal count must not trip over the sample it was handed.
 */
function strings(value: unknown, out: string[] = [], placeholder = '‹valoare›'): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    out.push(String((value as (...a: unknown[]) => string)(placeholder, placeholder)));
  } else if (Array.isArray(value)) for (const item of value) strings(item, out, placeholder);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out, placeholder);
  }
  return out;
}

const ALL = [
  ...strings(directoryCopy),
  ...strings(faqCopy),
  ...strings(STATIC_FAQ),
  ...strings(adminDirectoryCopy),
  ...strings(accountCopy.publicProfile),
];

describe('directory copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('makes no superlative claim', () => {
    const offenders = ALL.filter((s) =>
      /(cea mai|cel mai|cei mai|cele mai|nr\.?\s*1|numărul unu)/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('guarantees nothing', () => {
    const offenders = ALL.filter((s) =>
      // "Vezi toate firmele" is navigation; "toate firmele sunt verificate"
      // is the claim, and it is the claim that is forbidden.
      /(garant(ăm|ez|ie|at)|100\s*%|complet sigur|în legalitate|toate firmele (sunt|au|și))/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('puts no "+" after a number', () => {
    expect(ALL.filter((s) => /\d[\d.,]*\s*\+/.test(s))).toEqual([]);
  });

  it('writes no count of its own: every figure is passed in', () => {
    // "24 de firme" reaches these strings only as an argument, never as
    // literal text — which is what stops a number surviving a change in
    // the data behind it.
    const literals = strings(directoryCopy).filter(
      (s) => /\b\d[\d.,]*\s*(de\s+)?(firme|transportatori|platforme|vehicule|clienți)\b/i.test(s),
    );
    expect(literals).toEqual([]);
  });

  it('writes Romanian with diacritics rather than their ASCII stand-ins', () => {
    const offenders = ALL.filter((s) =>
      /\b(firma verificate|firme verificate de|romania|expeditii|transportator verificat)\b/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('promises the trial only after verification', () => {
    expect(directoryCopy.signup.trial('30 de zile')).toMatch(/aprobat/i);
  });

  it('says what the directory shows and what it does not', () => {
    expect(directoryCopy.page.note).toMatch(/au ales să apară/i);
    expect(accountCopy.publicProfile.lede).toMatch(/niciodată telefonul/i);
    expect(directoryCopy.profile.shield.lede).toMatch(/niciodată fișierele/i);
  });
});
