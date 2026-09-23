import { describe, expect, it } from 'vitest';
import { pricesCopy } from '@/content/preturi';

/**
 * The same kind of guard as the homepage copy test: not the wording, which
 * changes freely, but the rules that keep the page honest once it is long
 * enough that nobody reads it end to end.
 *
 * The rule that matters most here: no figure is written into the copy. Every
 * rate, minimum and percentage comes from the database, so a price on this
 * page is always one the team set and audited — never one a developer typed.
 */

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') out.push((value as (n: number) => string)(1));
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = strings(pricesCopy);

describe('prices copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('writes no price, rate or minimum into the copy', () => {
    // A figure here would be one nobody approved and nobody can change
    // without a deploy. Every real number arrives from `price_rates`.
    const offenders = ALL.filter((s) => /\d[\d.,]*\s*(lei\b|€|eur\b)/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('says the price is orientativ and that the carrier decides it', () => {
    const all = ALL.join(' ');
    expect(all).toMatch(/orientativ/i);
    expect(all).toMatch(/prețul final îl stabilește transportatorul/i);
  });

  it('never calls the estimate an offer', () => {
    expect(pricesCopy.calculator.lede).toMatch(/nu o ofertă/i);
  });

  it('answers three questions, each with a body', () => {
    expect(pricesCopy.faq.items).toHaveLength(3);
    for (const item of pricesCopy.faq.items) {
      expect(item.q.endsWith('?')).toBe(true);
      expect(item.a.length).toBeGreaterThan(80);
    }
  });

  it('writes Romanian with diacritics rather than their ASCII stand-ins', () => {
    const offenders = ALL.filter((s) => /\b(pret|preturi|masina|romania|transportator i)\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('keeps the two-tone headline short enough to hold two lines', () => {
    // One left: the homepage section, where a reader is being introduced
    // to something. The page's own heading is literal now — „Prețuri
    // orientative", what it is, in two words — so there is no two-tone
    // pair on it to measure.
    const headline = `${pricesCopy.home.strong} ${pricesCopy.home.soft}`;
    expect(headline.length).toBeLessThanOrEqual(76);
  });

  it('and the page says what it is, in four words or fewer', () => {
    expect(pricesCopy.hero.heading.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it('offers a way forward while the table is unpublished', () => {
    expect(pricesCopy.unpublished.title).toMatch(/în curând/i);
    expect(pricesCopy.unpublished.cta).toMatch(/cerere/i);
  });
});
