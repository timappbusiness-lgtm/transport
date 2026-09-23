import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast } from './contrast.test';

/**
 * The accent scale and the category tints, measured from the stylesheet.
 *
 * These read `globals.css` rather than repeating its hexes, so a value
 * changed there is a value measured here. The older contrast file pins
 * the palette the brief started from; this one pins what was added to
 * make the interface warmer, and every pair is a pair some component
 * actually draws.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match) throw new Error(`--color-${name} is not a six-digit hex in globals.css`);
  return match[1]!;
}

/** `a` at `t` over `b` — what a translucent surface actually paints. */
function over(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)).toString(16).padStart(2, '0'))
    .join('')}`;
}

const BODY = 4.5;
const LARGE = 3;

const INK = token('foreground');
const MUTED = token('muted');
const GROUND = token('background');
const ALT = token('ground-alt');
const SURFACE = token('surface');
const ACCENT = token('accent');
const HOVER = token('accent-hover');
const SUBTLE = token('accent-subtle');
const BORDER = token('accent-border');
const ON_ACCENT = token('on-accent');
const ON_DARK = token('accent-on-dark');
const DARK_FROM = token('dark-from');
const DARK_TO = token('dark-to');
const WARNING = token('warning');

/**
 * The header is ink at this opacity over whatever scrolls behind it. The
 * number lives in the component as `bg-foreground/80`; this and that must
 * agree, and `site-header.tsx` is checked for it below.
 */
const HEADER_ALPHA = 0.8;
const HEADER_WORST = over(INK, SURFACE, HEADER_ALPHA);
const HEADER_BEST = over(INK, DARK_FROM, HEADER_ALPHA);

describe('the accent scale on light surfaces', () => {
  it.each([
    ['accent text on the ground', ACCENT, GROUND],
    ['accent text on a card', ACCENT, SURFACE],
    ['accent text on the alternating band', ACCENT, ALT],
    ['accent text on its own subtle ground', ACCENT, SUBTLE],
    ['ink on the subtle ground', INK, SUBTLE],
    ['white on the filled accent', ON_ACCENT, ACCENT],
    ['white on the hovered accent', ON_ACCENT, HOVER],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(BODY);
  });

  it('hovering can only improve a filled button', () => {
    expect(contrast(ON_ACCENT, HOVER)).toBeGreaterThan(contrast(ON_ACCENT, ACCENT));
  });

  it('the border is visible beside the hairline without pretending to be a control edge', () => {
    // Decorative: the label inside an outlined accent chip carries the
    // meaning. It must read as a different line from `--color-border`.
    expect(contrast(BORDER, SURFACE)).toBeGreaterThan(contrast(token('border'), SURFACE));
  });
});

describe('the one dark step', () => {
  it('reads as body text on the header in the worst case, white behind it', () => {
    expect(contrast(ON_DARK, HEADER_WORST)).toBeGreaterThanOrEqual(BODY);
  });

  it('and in the best case, the dark section behind it', () => {
    expect(contrast(ON_DARK, HEADER_BEST)).toBeGreaterThanOrEqual(BODY);
  });

  it('but NOT on the light end of the dark gradient, which is why it is not used there', () => {
    // 3.03:1 — the large-text floor and no more, and text laid over a
    // gradient crosses both ends of it. If this ever reaches 4.5 the
    // rule in design/README.md can be relaxed; until then the gradient
    // sections keep white.
    expect(contrast(ON_DARK, DARK_TO)).toBeLessThan(BODY);
    expect(contrast(ON_DARK, DARK_TO)).toBeGreaterThanOrEqual(LARGE);
  });

  it('white on the header gains from 80%, it does not lose', () => {
    expect(contrast(SURFACE, HEADER_WORST)).toBeGreaterThanOrEqual(7);
  });

  it('and the header component uses the opacity measured here', () => {
    const header = readFileSync('src/components/layout/site-header.tsx', 'utf8');
    expect(header).toContain(`bg-foreground/${Math.round(HEADER_ALPHA * 100)}`);
  });
});

describe('the accent is not the warning colour', () => {
  it('sits far enough from it in hue that a count never reads as an alarm', () => {
    // The amber candidate was rejected on exactly this: „Are nevoie de
    // troliu" and an expiring document are drawn in the warning colour,
    // and a brand accent of the same family would make every figure on
    // a card look like one of them.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return 0;
      const h =
        max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const distance = Math.abs(hue(ACCENT) - hue(WARNING));
    expect(Math.min(distance, 360 - distance)).toBeGreaterThan(90);
  });
});

describe('the category tints', () => {
  const TINTS = ['petrol', 'sand', 'sage', 'sky', 'clay', 'stone'] as const;

  it.each(TINTS)('%s carries ink, muted text and the accent', (name) => {
    const tint = token(`tint-${name}`);
    expect(contrast(INK, tint), `ink on ${name}`).toBeGreaterThanOrEqual(BODY);
    expect(contrast(MUTED, tint), `muted on ${name}`).toBeGreaterThanOrEqual(BODY);
    expect(contrast(ACCENT, tint), `accent on ${name}`).toBeGreaterThanOrEqual(BODY);
  });

  it.each(TINTS)('%s is soft: a ground, not a colour block', (name) => {
    // Under 1.25:1 against white — about what the card hairline is. A
    // tint any stronger than that starts to compete with the route.
    expect(contrast(token(`tint-${name}`), SURFACE)).toBeLessThan(1.25);
  });
});
