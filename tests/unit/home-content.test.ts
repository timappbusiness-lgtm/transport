import { describe, expect, it } from 'vitest';
import {
  CARRIER_PLAN,
  CORRIDOR_PRICES,
  formatNumber,
  HERO_FACTS,
  PLATFORM,
  SAMPLE_REQUESTS,
} from '@/content/home';

describe('homepage content', () => {
  it('formats numbers the Romanian way', () => {
    expect(formatNumber(1640)).toBe('1.640');
    expect(formatNumber(400000)).toBe('400.000');
  });

  it('keeps the platform deck consistent', () => {
    expect(PLATFORM.taken).toBeGreaterThan(0);
    expect(PLATFORM.taken).toBeLessThan(PLATFORM.slots);
  });

  it('gives every sample request a distinct key and a positive distance', () => {
    const keys = SAMPLE_REQUESTS.map((r) => `${r.from.city}-${r.to.city}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of SAMPLE_REQUESTS) expect(r.km).toBeGreaterThan(0);
  });

  it('lists each corridor once', () => {
    const codes = CORRIDOR_PRICES.map((p) => p.cc);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain('RO');
  });

  it('states no live counters in the hero', () => {
    // The boards hold no real data yet; a hero figure must be a rule or a
    // price, never an invented count of listings or carriers.
    for (const f of HERO_FACTS) expect(f.label).not.toMatch(/active|adăugate|pe drum/);
  });

  it('matches the carrier plan in docs/05-pricing.md', () => {
    expect(CARRIER_PLAN.priceRon).toBe(149);
    expect(CARRIER_PLAN.trialDays).toBe(30);
  });
});
