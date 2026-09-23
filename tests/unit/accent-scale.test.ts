import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
 * The header is the dark petrol ground at this opacity over whatever
 * scrolls behind it. The number lives in `header-shell.ts` as
 * `bg-dark-from/88`; the full set of dark-surface measurements is in
 * `accent-dark.test.ts`, which checks the component against it.
 */
const HEADER_ALPHA = 0.88;
const HEADER_WORST = over(DARK_FROM, SURFACE, HEADER_ALPHA);
const HEADER_BEST = over(DARK_FROM, DARK_FROM, HEADER_ALPHA);

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

describe('the pale dark step', () => {
  it('reads as body text on the header in the worst case, white behind it', () => {
    expect(contrast(ON_DARK, HEADER_WORST)).toBeGreaterThanOrEqual(BODY);
  });

  it('and in the best case, the dark section behind it', () => {
    expect(contrast(ON_DARK, HEADER_BEST)).toBeGreaterThanOrEqual(BODY);
  });

  it('and now on both ends of the dark gradient too', () => {
    // It used to measure 3.03:1 on the light end, which kept it off the
    // gradient sections. The gradient is deeper now, and it clears body
    // text on both ends, so the soft half of a headline there can carry it.
    expect(contrast(ON_DARK, DARK_TO)).toBeGreaterThanOrEqual(BODY);
    expect(contrast(ON_DARK, DARK_FROM)).toBeGreaterThanOrEqual(BODY);
  });

  it('white on the header clears 7:1 in the worst case', () => {
    expect(contrast(SURFACE, HEADER_WORST)).toBeGreaterThanOrEqual(7);
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

describe('where the new accent classes may not go', () => {
  /**
   * The screens that stay formal. A link in them is ink, not accent: the
   * sentence around it is something to read, not a notification to
   * click away. The directories are checked file by file so a new
   * legal or staff component inherits the rule without anybody
   * remembering to add it.
   */
  const FORMAL_DIRS = ['src/components/legal', 'src/components/admin', 'src/app/admin'];
  const FORMAL_FILES = [
    'src/app/termeni/page.tsx',
    'src/app/confidentialitate/page.tsx',
    'src/app/cookies/page.tsx',
    'src/components/app/status-banner.tsx',
    'src/components/account/status-banner.tsx',
    'src/components/account/deletion-panel.tsx',
    'src/components/app/account-notices.tsx',
    'src/app/not-found.tsx',
    'src/app/error.tsx',
  ];

  function walk(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(path));
      else if (/\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  const files = [...FORMAL_DIRS.flatMap(walk), ...FORMAL_FILES];

  it('actually finds the formal screens it is guarding', () => {
    // A walk that silently returns nothing guards nothing.
    expect(files.filter((f) => f.startsWith('src/components/admin')).length).toBeGreaterThan(10);
  });

  it('no accent link, no accent tab, no dark accent step on a formal screen', () => {
    const offenders = files.filter((file) => {
      let body: string;
      try {
        body = readFileSync(file, 'utf8');
      } catch {
        return false;
      }
      return /\blink-accent\b|\bTabLink\b|accent-on-dark|accent-subtle/.test(body);
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('an error screen and a legal page carry no accent at all', () => {
    // Not a link, not a button, not a number. The way out of an error is
    // an ink button; a legal page is something to read.
    for (const file of [
      'src/app/not-found.tsx',
      'src/app/error.tsx',
      'src/app/termeni/page.tsx',
      'src/app/confidentialitate/page.tsx',
      'src/app/cookies/page.tsx',
      // Suspension, deletion and a resolved dispute, whole files.
      'src/components/app/status-banner.tsx',
      'src/components/account/status-banner.tsx',
      'src/components/account/deletion-panel.tsx',
      'src/app/stergere/anuleaza/page.tsx',
      'src/components/admin/resolve-dispute.tsx',
      'src/components/admin/anonymise-account.tsx',
    ]) {
      const body = readFileSync(file, 'utf8');
      expect(body, file).not.toMatch(/-accent\b|-accent-|'primary'|variant="primary"/);
      // `<Button>` with no variant is a primary one.
      expect(body, file).not.toMatch(/<Button(?![^>]*variant=)/);
    }
  });

  it('a rejection, a dispute, a cancellation or a report is an ink button', () => {
    // These sat in the accent until this pass, because they were written
    // when „primary" still meant ink. The label is how each is found: the
    // button that renders it is the one checked.
    const serious: [string, string][] = [
      ['src/components/admin/review-forms.tsx', 'c.documents.rejectSubmit'],
      ['src/components/admin/review-forms.tsx', 'c.companies.rejectSubmit'],
      ['src/components/orders/order-actions.tsx', 'ordersCopy.dispute.submitting'],
      ['src/components/messages/message-actions.tsx', 'c.reportSubmit'],
      ['src/components/messages/message-actions.tsx', 'c.blockSubmit'],
      ['src/components/admin/deletion-settings-form.tsx', 'c.save'],
    ];
    for (const [file, label] of serious) {
      const body = readFileSync(file, 'utf8');
      const at = body.indexOf(label);
      expect(at, `${label} in ${file}`).toBeGreaterThan(0);
      const button = body.slice(body.lastIndexOf('<button', at), at);
      expect(button, `${label} in ${file}`).toContain("buttonClasses('ink'");
    }
    // Cancelling an order: the submit inside CancelOrder.
    const orders = readFileSync('src/components/orders/order-actions.tsx', 'utf8');
    const cancel = orders.slice(orders.indexOf('export function CancelOrder'), orders.indexOf('export function OpenDispute'));
    expect(cancel).toContain("buttonClasses('ink'");
    expect(cancel).not.toContain("buttonClasses('primary'");
  });

  it('and inside an error the link is ink', () => {
    // The quota message on the offer form and on the saved-search form
    // is an error: `role="alert"`, danger text. Its way out is a link,
    // and the link does not turn the error into an advertisement.
    for (const file of ['src/components/offers/offer-form.tsx', 'src/components/requests/save-search.tsx']) {
      const body = readFileSync(file, 'utf8');
      const alert = body.slice(body.indexOf('role="alert"'), body.indexOf('role="alert"') + 600);
      expect(alert, file).not.toMatch(/link-accent/);
      expect(alert, file).toMatch(/link-ink/);
    }
  });

  it('a dispute keeps the colour of its row', () => {
    const body = readFileSync('src/components/orders/orders-widget.tsx', 'utf8');
    const row = body.slice(body.indexOf('text-danger'), body.indexOf('text-danger') + 400);
    expect(row).not.toMatch(/link-accent/);
  });
});

describe('every badge is readable on its own ground', () => {
  // The five kinds in src/components/ui/badge.tsx, as they are drawn.
  it.each([
    ['„Nou": accent on the accent subtle', ACCENT, SUBTLE],
    ['time: muted on stone', MUTED, token('tint-stone')],
    ['count: white on the accent', ON_ACCENT, ACCENT],
    ['„Expres": ink on sand', INK, token('tint-sand')],
    ['„Pe retur": ink on sky', INK, token('tint-sky')],
  ])('%s clears 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(BODY);
  });
});

describe('status colours are never text', () => {
  /**
   * The warning colour is 3.64:1 on white and the success colour 4.04:1
   * — both under the 4.5 body text needs. They were drawn as text in six
   * places anyway: „Platformă plină", the booking countdown, a return
   * leg's missing vehicle, the composer's offline notice, the help
   * page's „lipsă" and the checklist's „gata". The colour belongs on a
   * dot, a chip's tint or a glyph, which need 3:1; the word is ink.
   */
  function walkAll(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walkAll(path));
      else if (/\.tsx$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it('no class string pairs a status colour with a text size or weight', () => {
    const offenders: string[] = [];
    for (const file of walkAll('src')) {
      const body = readFileSync(file, 'utf8');
      for (const m of body.matchAll(/(['"`])([^'"`]*\btext-(?:warning|success)\b[^'"`]*)\1/g)) {
        const cls = m[2]!;
        if (/\b(?:text-(?:xs|sm|small|label|body|base)|font-(?:medium|mono|semibold))\b/.test(cls)) {
          offenders.push(`${file}: ${cls}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('and the six that were fixed stay fixed', () => {
    for (const file of [
      'src/components/departures/departure-card.tsx',
      'src/components/orders/return-leg.tsx',
      'src/components/messages/composer.tsx',
      'src/app/cont/ajutor/page.tsx',
    ]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\btext-warning\b/);
    }
    expect(readFileSync('src/components/account/checklist.tsx', 'utf8')).not.toMatch(
      /font-mono text-label text-success/,
    );
    expect(readFileSync('src/components/app/dashboard/carrier.tsx', 'utf8')).not.toMatch(
      /hours < 3 \? 'text-warning'/,
    );
  });
});
