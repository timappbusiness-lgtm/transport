import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast.test';
import { deltaE2000, over } from './perceptual';

/**
 * The accent on dark surfaces, measured rather than judged.
 *
 * The petrol accent is dark: on the blue-grey sections it replaced it
 * measured 1.45:1 and ΔE00 14 — a button in it was grey on grey. The
 * sections are a deep petrol ink now and everything interactive or key on
 * them takes a bright step of the same family. Two measures, because they
 * answer two questions:
 *
 *   - WCAG contrast, for „can this be read" — 4.5:1 for text, 3:1 for the
 *     edge of a control;
 *   - CIEDE2000, for „can this be seen at a glance" — 40 is the bar here.
 *     Contrast is blind to hue; ΔE00 is how far apart two colours look.
 *
 * The values come out of globals.css, so a changed token is a re-measured
 * token.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match) throw new Error(`--color-${name} is not a hex token in globals.css`);
  return match[1]!.toLowerCase();
}

const BODY = 4.5;
const UI = 3;
const GLANCE = 40;

const WHITE = token('surface');
const INK = token('foreground');
const ACCENT = token('accent');
const BRIGHT = token('accent-bright');
const BRIGHT_HOVER = token('accent-bright-hover');
const ON_BRIGHT = token('on-accent-bright');
const PALE = token('accent-on-dark');
const DARK_FROM = token('dark-from');
const DARK_TO = token('dark-to');

/** The header, read from the component: `bg-dark-from/NN`. */
const SHELL = readFileSync('src/components/layout/header-shell.ts', 'utf8');
const HEADER_ALPHA = Number(/bg-dark-from\/(\d+)/.exec(SHELL)?.[1] ?? 'NaN') / 100;
const HEADER_WORST = over(DARK_FROM, WHITE, HEADER_ALPHA);

/** Every dark ground the bright step can stand on. */
const DARK_GROUNDS = [
  ['the dark gradient, dark end', DARK_FROM],
  ['the dark gradient, light end', DARK_TO],
  ['the header over a white page', HEADER_WORST],
] as const;

describe('before: the petrol accent on the old dark sections', () => {
  // Pinned so the report's before figures are the measured ones.
  it('was grey on grey', () => {
    expect(contrast(ACCENT, '#33434b')).toBeLessThan(1.6);
    expect(deltaE2000(ACCENT, '#33434b')).toBeLessThan(16);
    expect(deltaE2000(ACCENT, '#69787f')).toBeLessThan(17);
  });
});

describe('the bright step on every dark ground', () => {
  it.each(DARK_GROUNDS)('reads as body text on %s', (_label, ground) => {
    expect(contrast(BRIGHT, ground)).toBeGreaterThanOrEqual(BODY);
  });

  it.each(DARK_GROUNDS)('and is distinguishable at a glance from %s', (_label, ground) => {
    expect(deltaE2000(BRIGHT, ground)).toBeGreaterThanOrEqual(GLANCE);
  });

  it.each(DARK_GROUNDS)('its hover state holds up on %s too', (_label, ground) => {
    expect(contrast(BRIGHT_HOVER, ground)).toBeGreaterThanOrEqual(BODY);
  });

  it('the dark ink on a filled bright button is body text, and hover only improves it', () => {
    expect(contrast(ON_BRIGHT, BRIGHT)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(ON_BRIGHT, BRIGHT_HOVER)).toBeGreaterThan(contrast(ON_BRIGHT, BRIGHT));
  });

  it('is not white: a bright button beside a white one is a different thing', () => {
    expect(deltaE2000(BRIGHT, WHITE)).toBeGreaterThanOrEqual(20);
  });

  it('as a focus ring it clears 3:1 on every dark ground', () => {
    for (const [, ground] of DARK_GROUNDS) {
      expect(contrast(BRIGHT, ground)).toBeGreaterThanOrEqual(UI);
    }
  });
});

describe('the pale step and white on the new dark grounds', () => {
  it.each(DARK_GROUNDS)('the pale step reads as body text on %s', (_label, ground) => {
    expect(contrast(PALE, ground)).toBeGreaterThanOrEqual(BODY);
    expect(deltaE2000(PALE, ground)).toBeGreaterThanOrEqual(GLANCE);
  });

  it.each(DARK_GROUNDS)('white clears 7:1 on %s', (_label, ground) => {
    expect(contrast(WHITE, ground)).toBeGreaterThanOrEqual(7);
  });

  it('the soft half of a dark headline — white at 70% — still clears body text on the light end', () => {
    expect(contrast(over(WHITE, DARK_TO, 0.7), DARK_TO)).toBeGreaterThanOrEqual(BODY);
  });
});

describe('the bright step never on a light surface', () => {
  it('measures under 2:1 on white, which is why', () => {
    expect(contrast(BRIGHT, WHITE)).toBeLessThan(2);
  });

  it('the petrol base stays the light-surface accent', () => {
    expect(contrast(ACCENT, WHITE)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(INK, WHITE)).toBeGreaterThanOrEqual(BODY);
  });

  /**
   * The files that are dark from edge to edge. Anywhere else the bright
   * step must be scoped to a dark surface with the `in-data-[surface=dark]:`
   * variant, so the same component on a light card keeps the petrol base.
   */
  const DARK_FILES = new Set([
    'src/components/layout/header-menu.tsx',
    'src/components/layout/header-brand.tsx',
    'src/components/layout/header-shell.ts',
    'src/components/home/hero.tsx',
    'src/components/home/final-cta.tsx',
    'src/components/home/photo-slot.tsx',
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.tsx?$/.test(name)) out.push(path);
    }
    return out;
  }

  it('every use outside a dark file is scoped to a dark surface', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (DARK_FILES.has(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/([\w:[\]=-]*?)(?:bg|text|border|decoration|ring|outline|fill|stroke)-accent-bright\b/g)) {
        if (!match[1]!.includes('in-data-[surface=dark]:')) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the dark files do exist, so the list guards something', () => {
    for (const file of DARK_FILES) expect(() => readFileSync(file)).not.toThrow();
  });
});

describe('the header is a dark surface and says so', () => {
  it('its opacity is the one measured here', () => {
    expect(HEADER_ALPHA).toBeGreaterThan(0.8);
    expect(HEADER_ALPHA).toBeLessThanOrEqual(1);
  });

  it('carries data-surface="dark", so its focus ring is the bright step', () => {
    const header = readFileSync('src/components/layout/site-header.tsx', 'utf8');
    expect(header).toContain('data-surface="dark"');
    expect(CSS).toMatch(/\[data-surface='dark'\] :focus-visible \{\s*outline-color: var\(--color-accent-bright\);/);
  });
});
