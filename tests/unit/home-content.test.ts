import { describe, expect, it } from 'vitest';
import { homeCopy } from '@/content/home';

/**
 * These guard the copy rules, not the wording. Wording changes freely; the
 * rules are what keep the page honest and what a reviewer cannot check by
 * eye once the file is a few hundred lines long.
 */

/** Every string in the copy tree, flattened. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) strings(item, out);
  }
  return out;
}

const ALL = strings(homeCopy);

describe('homepage copy rules', () => {
  it('uses no exclamation marks', () => {
    expect(ALL.filter((s) => s.includes('!'))).toEqual([]);
  });

  it('claims no social proof counts', () => {
    // "Join 50,000+ people" is the reference site's move, not ours: the
    // boards hold no real data yet, so any such figure would be invented.
    const offenders = ALL.filter((s) =>
      /\b\d[\d.,]*\+?\s*(de\s+)?(utilizatori|clienți|firme|membri|transportatori|persoane)\b/i.test(
        s,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('never presents a count of live listings as fact', () => {
    const offenders = ALL.filter((s) =>
      /\b\d+\s*(cereri|anunțuri|curse)\s*(active|noi|publicate)/i.test(s),
    );
    expect(offenders).toEqual([]);
  });

  it('labels every price as orientativ', () => {
    expect(homeCopy.prices.columns.price).toMatch(/orientativ/i);
    expect(homeCopy.prices.lede).toMatch(/orientativ/i);
    expect(homeCopy.prices.note).toMatch(/orientativ/i);
  });

  it('says the real intervals are not there yet', () => {
    expect(homeCopy.prices.note).toMatch(/pe măsură ce se încheie transporturi/i);
  });

  it('keeps the seat deck internally consistent', () => {
    const { taken, total, caption } = homeCopy.panel.seats;
    expect(taken).toBeGreaterThan(0);
    expect(taken).toBeLessThan(total);
    expect(caption).toContain(String(total - taken));
    expect(caption).toContain(String(total));
  });

  it('gives the comparison five steps on each side', () => {
    expect(homeCopy.comparison.old).toHaveLength(5);
    expect(homeCopy.comparison.fresh).toHaveLength(5);
  });

  it('lists each corridor once and never Romania as an origin', () => {
    const codes = homeCopy.prices.rows.map((row) => row.cc);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain('RO');
  });

  it('matches the carrier plan in docs/05-pricing.md', () => {
    expect(homeCopy.carriers.plan.price).toBe('149 lei');
  });

  it('promises the trial only after verification', () => {
    expect(homeCopy.carriers.plan.note).toMatch(/după validarea firmei/i);
  });

  it('offers e-mail alerts, not WhatsApp, at this stage', () => {
    const features = homeCopy.carriers.plan.features.join(' ');
    expect(features).toMatch(/e-mail/i);
    expect(features).not.toMatch(/whatsapp/i);
  });

  it('writes Romanian with diacritics rather than their ASCII stand-ins', () => {
    // A page that says "firma" where it means "firmă" reads as machine
    // output. Spot-check the words most often stripped.
    const offenders = ALL.filter((s) => /\b(cerere gratuit|firma verificate|romania)\b/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('keeps every headline short enough to hold two lines on desktop', () => {
    const headlines = [
      `${homeCopy.hero.strong} ${homeCopy.hero.soft}`,
      `${homeCopy.panel.strong} ${homeCopy.panel.soft}`,
      `${homeCopy.comparison.strong} ${homeCopy.comparison.soft}`,
      `${homeCopy.carriers.strong} ${homeCopy.carriers.soft}`,
      `${homeCopy.forwarders.strong} ${homeCopy.forwarders.soft}`,
      `${homeCopy.verification.strong} ${homeCopy.verification.soft}`,
      `${homeCopy.prices.strong} ${homeCopy.prices.soft}`,
      `${homeCopy.finalCta.strong} ${homeCopy.finalCta.soft}`,
    ];
    for (const headline of headlines) {
      expect(headline.length).toBeLessThanOrEqual(76);
    }
  });
});
