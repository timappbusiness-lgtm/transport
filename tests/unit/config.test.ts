import { describe, expect, it } from 'vitest';
import { BRAND_NAME, BRAND_SLUG, SITE_URL } from '@/config/brand';
import { ROUTES, UNBUILT_ROUTES } from '@/config/routes';

describe('brand', () => {
  it('exposes the brand name from a single constant', () => {
    // Not pinned to a value: the name is being decided, and a test that
    // spells it out is one more file to change. `brand.test.ts` checks
    // that nothing else spells it out either.
    expect(BRAND_NAME.trim()).toBe(BRAND_NAME);
    expect(BRAND_NAME.length).toBeGreaterThan(1);
    expect(BRAND_SLUG).toMatch(/^[a-z0-9]+$/);
  });

  it('resolves a usable site URL', () => {
    expect(() => new URL(SITE_URL)).not.toThrow();
  });
});

describe('routes', () => {
  it('every route is absolute', () => {
    for (const route of Object.values(ROUTES)) {
      expect(route.startsWith('/')).toBe(true);
    }
  });

  it('has no duplicate paths', () => {
    const values = Object.values(ROUTES);
    expect(new Set(values).size).toBe(values.length);
  });

  it('every unbuilt route is a declared route', () => {
    const declared = new Set<string>(Object.values(ROUTES));
    for (const route of UNBUILT_ROUTES) {
      expect(declared.has(route)).toBe(true);
    }
  });

  it('home is not listed as unbuilt', () => {
    expect(UNBUILT_ROUTES).not.toContain(ROUTES.home);
  });
});
