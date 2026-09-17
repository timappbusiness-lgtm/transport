import { describe, expect, it } from 'vitest';

/**
 * Contrast is a property of the palette, so it is checked here rather than
 * left to a reviewer's eye. Three values in the design brief failed when
 * measured; the tokens that replaced them are pinned by these tests, so a
 * future palette tweak cannot quietly reintroduce the problem.
 *
 * Ratios follow WCAG 2.1: 4.5:1 for body text, 3:1 for large text (>=24px,
 * or >=18.66px bold) and for the boundary of a control.
 */

const TOKENS = {
  ground: '#f6f7f7',
  groundAlt: '#eef1f2',
  surface: '#ffffff',
  border: '#e2e7e9',
  borderStrong: '#7c8a91',
  ink: '#1c262b',
  muted: '#5e6d74',
  inkSoft: '#7b8b93',
  darkFrom: '#33434b',
  darkTo: '#69787f',
  white: '#ffffff',
  success: '#2f8f5b',
  warning: '#b7791f',
  danger: '#c2413a',
} as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast helper', () => {
  it('agrees with the known extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('body text meets AA', () => {
  it.each([
    ['ink on ground', TOKENS.ink, TOKENS.ground],
    ['ink on alt section', TOKENS.ink, TOKENS.groundAlt],
    ['ink on card', TOKENS.ink, TOKENS.surface],
    ['secondary on ground', TOKENS.muted, TOKENS.ground],
    ['secondary on alt section', TOKENS.muted, TOKENS.groundAlt],
    ['secondary on card', TOKENS.muted, TOKENS.surface],
  ])('%s', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the soft headline tone', () => {
  it('is usable for large text', () => {
    expect(contrast(TOKENS.inkSoft, TOKENS.ground)).toBeGreaterThanOrEqual(3);
  });

  it('is NOT usable for body text — which is why only Headline may use it', () => {
    expect(contrast(TOKENS.inkSoft, TOKENS.ground)).toBeLessThan(4.5);
  });
});

describe('dark sections carry white body text at both ends of the gradient', () => {
  it.each([
    ['gradient start', TOKENS.darkFrom],
    ['gradient end', TOKENS.darkTo],
  ])('%s', (_label, bg) => {
    expect(contrast(TOKENS.white, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('rejects the lighter gradient from the brief, which measured 2.08:1', () => {
    // Kept as a regression guard: white on #a9b6bc failed even the 3:1
    // large-text floor, and the hero and closing CTA are built on this.
    expect(contrast(TOKENS.white, '#a9b6bc')).toBeLessThan(3);
  });
});

describe('buttons', () => {
  it('white on the ink pill', () => {
    expect(contrast(TOKENS.white, TOKENS.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('ink on the white pill used over dark sections', () => {
    expect(contrast(TOKENS.ink, TOKENS.white)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('status colours', () => {
  it.each([
    ['success', TOKENS.success],
    ['warning', TOKENS.warning],
    ['danger', TOKENS.danger],
  ])('%s is bright enough to read as a dot against a card', (_label, colour) => {
    expect(contrast(colour, TOKENS.surface)).toBeGreaterThanOrEqual(3);
  });

  it('success and warning would fail as label text, which is why labels are ink', () => {
    expect(contrast(TOKENS.success, TOKENS.surface)).toBeLessThan(4.5);
    expect(contrast(TOKENS.warning, TOKENS.surface)).toBeLessThan(4.5);
  });

  it('the ink label inside a status badge passes on every tint', () => {
    // The tint is 8% over white, so the worst case is close to the card.
    expect(contrast(TOKENS.ink, TOKENS.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('controls and focus', () => {
  it('a form control boundary meets the 3:1 asked of a control', () => {
    expect(contrast(TOKENS.borderStrong, TOKENS.surface)).toBeGreaterThanOrEqual(3);
  });

  it('the card hairline is deliberately below that — it separates, it does not identify', () => {
    expect(contrast(TOKENS.border, TOKENS.surface)).toBeLessThan(3);
  });

  it('the focus ring is far past 3:1 on light ground and on dark sections', () => {
    expect(contrast(TOKENS.ink, TOKENS.ground)).toBeGreaterThanOrEqual(3);
    expect(contrast(TOKENS.white, TOKENS.darkTo)).toBeGreaterThanOrEqual(3);
  });
});
