import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cn, TEXT_SCALE } from '@/lib/utils';
import { contrast } from './contrast.test';

/**
 * The design system, checked where it can be checked without a browser.
 *
 * Three things live here. That components reach for tokens rather than
 * writing values; that every text-on-surface pair the system actually
 * uses clears its contrast floor; and that `cn` keeps a font size and a
 * colour apart, which it did not, silently, for the length of an
 * afternoon.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = sources('src');

describe('components use tokens, not values', () => {
  it('no arbitrary font size anywhere', () => {
    // `text-[0.8125rem]` and friends. There were 676 of these across 195
    // files, in seventeen steps, several a sixteenth of a rem apart.
    const offenders = FILES.filter((f) => /text-\[[\d.]+rem\]|text-\[clamp\(/.test(readFileSync(f, 'utf8')));
    expect(offenders, `arbitrary text size in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no arbitrary radius or shadow anywhere', () => {
    const offenders = FILES.filter((f) =>
      /rounded-\[|shadow-\[/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders, `arbitrary radius or shadow in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no size, radius or shadow from outside the scale either', () => {
    // Tailwind's own steps are values too. `text-sm` (14px) and `text-xs`
    // (12px) sat between the scale's body (15) and small (13) on 1134
    // sites in 201 files; `shadow-sm` was a fourth shadow nobody chose.
    // A size is a step of the scale, a radius is card, input or pill, a
    // shadow is card, raised or float — or `none` to take one away.
    const outside =
      /(?<![\w-])(?:[a-z0-9-]+:)*(?:text-(?:xs|sm|base|lg|[2-9]?xl)|rounded(?:-[trblse]{1,2})?-(?:xs|sm|md|lg|[2-9]?xl)|shadow-(?:xs|sm|md|lg|[2-9]?xl|inner))(?![\w-])/;
    // `shadow` and `rounded` on their own are steps too, but also English
    // words, so those two are looked for inside quoted class strings only.
    // A class string is lower-case words, colons, dashes, slashes and
    // brackets and nothing else — never an interpolation or a sentence.
    const bare =
      /['"`][a-z0-9:\-/.[\]() ]*(?<![\w-])(?:[a-z0-9-]+:)*(?:shadow|rounded)(?![\w-])[a-z0-9:\-/.[\]() ]*['"`]/;
    const offenders = FILES.flatMap((f) => {
      const hits = readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(?:\/\/|\*|\/\*|\{\/\*)/.test(line))
        .filter((line) => outside.test(line) || bare.test(line));
      return hits.map((line) => `${f}: ${line.trim()}`);
    });
    expect(offenders, `outside the scale:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no raw hex colour in a component', () => {
    // No exceptions. The hover shades that used to be written as hexes
    // are `--color-accent-hover` and `--color-ink-hover`; the third was
    // `#eef1f2`, which had been `--color-ground-alt` all along and was
    // found by this check rather than by anybody reading the file.
    const offenders = FILES.filter((f) =>
      /(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders, `raw hex in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('and every step of the scale exists in globals.css', () => {
    for (const step of TEXT_SCALE) {
      expect(CSS, `--text-${step} is missing`).toContain(`--text-${step}:`);
    }
  });

  it('and tailwind-merge knows about every one of them', () => {
    // The two lists that must agree. A step defined in CSS but absent
    // from TEXT_SCALE is the bug this file exists for: `cn` would treat
    // it as a colour and drop whichever of the two came first.
    const declared = [...CSS.matchAll(/^\s*--text-([a-z0-9-]+):/gm)]
      .map((m) => m[1]!)
      .filter((name) => !name.includes('--'));
    for (const step of declared) {
      expect(TEXT_SCALE as readonly string[], `--text-${step} is not in TEXT_SCALE`).toContain(step);
    }
  });
});

describe('text somebody typed', () => {
  it('may always break, so a long link cannot push a phone screen sideways', () => {
    // `whitespace-pre-line` keeps the writer's line breaks — and keeps a
    // pasted URL on one line. Thirty places showed messages, notes,
    // conditions and dispute reasons that way with nothing to let them
    // break, each one a sideways scroll at 390px waiting for its link.
    const offenders = FILES.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => /whitespace-pre-(?:line|wrap)/.test(line) && !/break-(?:words|all)/.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('cn keeps a size and a colour apart', () => {
  /**
   * The regression. `twMerge` groups utilities by name, and it had never
   * heard of `text-h1`, so it filed it with `text-white` and kept only
   * the last one written. Two things shipped from that in one afternoon:
   * the hero `<h1>` rendered at 15px, and the primary button on the dark
   * sections drew white text on a white pill.
   */
  it('a scale step survives a colour written after it', () => {
    const out = cn('text-h1', 'mt-6 text-white');
    expect(out).toContain('text-h1');
    expect(out).toContain('text-white');
  });

  it('a colour survives a scale step written after it', () => {
    const out = cn('bg-white text-foreground', 'px-6 py-3 text-body');
    expect(out).toContain('text-foreground');
    expect(out).toContain('text-body');
  });

  it('but a later size still replaces an earlier one', () => {
    // The whole point of twMerge: two sizes are a conflict, and the
    // caller's wins. This is what lets the hero ask for `text-display`
    // over `Headline`'s own `text-h1`.
    expect(cn('text-h1', 'text-display')).toBe('text-display');
  });

  it('for every step in the scale, in both orders', () => {
    for (const step of TEXT_SCALE) {
      expect(cn(`text-${step}`, 'text-accent'), step).toContain(`text-${step}`);
      expect(cn('text-accent', `text-${step}`), step).toContain('text-accent');
    }
  });
});

describe('every text-on-surface pair the system uses', () => {
  const INK = '#1c262b';
  const MUTED = '#5e6d74';
  const INK_SOFT = '#7b8b93';
  const ACCENT = '#15616d';
  const WHITE = '#ffffff';

  const GROUND = '#f6f7f7';
  const ALT = '#eef1f2';
  const SURFACE = '#ffffff';
  /** The eyebrow pill: the accent at 6% over each ground. */
  const TINT_ON_GROUND = '#f3f5f5';
  const TINT_ON_ALT = '#ebeff0';

  const BODY = 4.5;
  const LARGE = 3;

  it('body text clears 4.5:1 on all three grounds', () => {
    for (const [name, bg] of Object.entries({ GROUND, ALT, SURFACE })) {
      expect(contrast(INK, bg), `ink on ${name}`).toBeGreaterThanOrEqual(BODY);
      expect(contrast(MUTED, bg), `muted on ${name}`).toBeGreaterThanOrEqual(BODY);
    }
  });

  it('the accent clears 4.5:1 everywhere it carries text', () => {
    for (const [name, bg] of Object.entries({
      GROUND,
      ALT,
      SURFACE,
      TINT_ON_GROUND,
      TINT_ON_ALT,
    })) {
      expect(contrast(ACCENT, bg), `accent on ${name}`).toBeGreaterThanOrEqual(BODY);
    }
  });

  it('and white on the accent clears it too, so the filled button is safe', () => {
    expect(contrast(WHITE, ACCENT)).toBeGreaterThanOrEqual(BODY);
    // The hover shade is darker, so it can only improve.
    expect(contrast(WHITE, '#114f59')).toBeGreaterThanOrEqual(BODY);
  });

  it('the soft half of a headline clears the large-text floor and no more', () => {
    // 3.28:1 on the ground and 3.10:1 on the alternating band. Allowed at
    // headline sizes and nowhere else, which is why `Headline` is the
    // only component that may reach for it.
    for (const [name, bg] of Object.entries({ GROUND, ALT, SURFACE })) {
      expect(contrast(INK_SOFT, bg), `ink-soft on ${name}`).toBeGreaterThanOrEqual(LARGE);
    }
    expect(contrast(INK_SOFT, GROUND)).toBeLessThan(BODY);
  });

  it('so every heading that may carry it starts at the large-text threshold', () => {
    // The trap, found by axe and not by eye: „large text" begins at 24px,
    // and an h2 whose minimum is 23.2px is ordinary text as far as WCAG
    // is concerned — which turns the soft half of every two-tone headline
    // on it into a 3.1-against-4.5 failure. The minimum of every step
    // that may hold `text-ink-soft` is therefore >= 1.5rem.
    for (const step of ['h1', 'h2', 'display']) {
      const decl = new RegExp(`--text-${step}: clamp\\(([\\d.]+)rem`);
      const min = Number(decl.exec(CSS)?.[1]);
      expect(min, `--text-${step} has no clamp minimum`).toBeGreaterThan(0);
      expect(min, `--text-${step} starts at ${min}rem, under the 1.5rem large-text floor`)
        .toBeGreaterThanOrEqual(1.5);
    }
  });

  it('the accent is distinguishable from ink, or it is not an accent', () => {
    // The point of the token. Two colours a person cannot tell apart are
    // one colour and a maintenance cost.
    expect(contrast(ACCENT, INK)).toBeGreaterThan(1.5);
  });
});

describe('where the accent may not go', () => {
  const FORBIDDEN = [
    'src/app/termeni/page.tsx',
    'src/app/confidentialitate/page.tsx',
    'src/app/cookies/page.tsx',
    'src/content/legal.ts',
  ];

  it('not on a legal page', () => {
    for (const file of FORBIDDEN) {
      let body: string;
      try {
        body = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      expect(body, `${file} uses the accent`).not.toMatch(/\b(?:text|bg|border|ring)-accent\b/);
    }
  });

  it('nor on a staff decision', () => {
    // Approve, hide, restore, resolve, grant access, activate: every
    // button in src/components/admin is a decision somebody on staff takes
    // about somebody else, and the accent would make it read as the happy
    // path. Ten of them were filled accent until this pass.
    const dir = 'src/components/admin';
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /buttonClasses\('primary'|\b(?:bg|border)-accent\b/.test(readFileSync(`${dir}/${f}`, 'utf8')));
    expect(offenders, `the accent on a staff decision in: ${offenders.join(', ')}`).toEqual([]);
    const reports = readFileSync('src/app/admin/sesizari/page.tsx', 'utf8');
    expect(reports).not.toMatch(/\b(?:bg|border)-accent\b/);
  });

  it('nor on a suspension, a rejection or a deletion', () => {
    // Same rule as the icons: these are sentences somebody has to read,
    // and colour makes them look like something that can be dismissed.
    for (const file of [
      'src/components/app/status-banner.tsx',
      'src/components/account/status-banner.tsx',
    ]) {
      const body = readFileSync(file, 'utf8');
      for (const word of ['suspended', 'rejected']) {
        const nearby = new RegExp(`${word}[\\s\\S]{0,400}?(?:text|bg|border)-accent`);
        expect(body, `the accent appears near "${word}" in ${file}`).not.toMatch(nearby);
      }
    }
  });
});
