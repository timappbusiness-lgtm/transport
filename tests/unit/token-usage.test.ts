import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '@/config/theme';

/**
 * No colour in a component that is not a token.
 *
 * `design-tokens.test.ts` already refused `bg-[#…]` and its siblings. It
 * let through everything else: `accent-[#1C262B]` on fourteen checkboxes,
 * `bg-[rgba(28,38,43,.72)]` on the header, six `rgba()` stops inside an
 * SVG, a hex in a gradient. None of them was wrong on the day it was
 * written; each was a second copy of a token that nobody would update
 * when the token moved. So this looks for the value itself, in any form,
 * anywhere in `src/` that is TypeScript.
 *
 * Two places are allowed to hold a hex, and both are checked against the
 * stylesheet instead: `src/config/theme.ts`, because a `<meta
 * name="theme-color">` is read before CSS, and the web manifest, which is
 * JSON.
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

const ALLOWED = new Set(['src/config/theme.ts']);
const FILES = sources('src').filter((f) => !ALLOWED.has(f));

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match) throw new Error(`--color-${name} missing`);
  return match[1]!.toLowerCase();
}

describe('components name tokens, never values', () => {
  it('no hex colour anywhere in src/, comments included', () => {
    // Comments too: a comment that says „#7b8b93" is the next place
    // somebody copies from.
    const offenders = FILES.flatMap((file) => {
      const body = readFileSync(file, 'utf8');
      const hits = [...body.matchAll(/(?<![&\w])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map(
        (m) => m[0],
      );
      return hits.length > 0 ? [`${file}: ${hits.join(', ')}`] : [];
    });
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no rgb() or rgba() either', () => {
    const offenders = FILES.filter((file) => /\brgba?\(/.test(readFileSync(file, 'utf8')));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no arbitrary colour class of any kind', () => {
    // `accent-[#…]`, `from-[…]`, `decoration-[…]`, `outline-[…]` —
    // the families the older check did not list.
    const pattern =
      /\b(?:bg|text|border|ring|fill|stroke|accent|from|via|to|decoration|outline|shadow|caret|divide|placeholder)-\[(?:#|rgb|hsl|oklch|color-mix)/;
    const offenders = FILES.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('the two copies that have to be hexes agree with the stylesheet', () => {
  it('the theme colour is the ink token', () => {
    expect(THEME_COLOR.toLowerCase()).toBe(token('foreground'));
  });

  it('and so is the web manifest', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      theme_color: string;
      background_color: string;
    };
    expect(manifest.theme_color.toLowerCase()).toBe(token('foreground'));
    expect(manifest.background_color.toLowerCase()).toBe(token('background'));
  });
});
