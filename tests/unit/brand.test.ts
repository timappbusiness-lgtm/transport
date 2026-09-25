import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { BRAND_NAME, BRAND_SLUG } from '@/config/brand';
import { MARK } from '@/config/brand-mark';
import {
  EDGE_MIRROR,
  FAVICON_SVG,
  RASTERS,
  RECORD,
  edgeMirror,
  generateBrandAssets,
  record,
} from '../../scripts/brand/generate.ts';

/**
 * The name is not decided, so it may be written in exactly one place.
 *
 * `src/config/brand.ts` holds it; `supabase/functions/_shared/brand.ts` is
 * the copy `pnpm brand` writes for the edge functions, which cannot import
 * from `src/` (and the test below fails if that copy is stale). Every
 * other file that ships, runs or tests the platform reads the constant.
 *
 * What is not scanned, and why:
 * - `docs/` and `prompts/` are the project's history and decisions, not
 *   the product; a report dated September says what the platform was
 *   called in September.
 * - `supabase/migrations/` cannot be edited once merged. What they left in
 *   the live database is checked there instead: section 19 of
 *   `supabase/tests/smoke_test.sql`, fed the name by `scripts/db-test.sh`.
 * - Binary files: the social image draws the name, and `pnpm brand`
 *   redraws it.
 *
 * Every rule is built from `BRAND_NAME`, so after a rename the same test
 * looks for the new name.
 */

const ALLOWED = new Set(['src/config/brand.ts', 'supabase/functions/_shared/brand.ts']);

/**
 * Two lines that must keep the old name, each for a reason that outlives
 * the name. Matched by file and by what else the line says, so anything
 * new in the same file is still caught.
 */
const EXEMPT: { file: string; line: RegExp; why: string }[] = [
  {
    file: 'supabase/tests/supabase_shim.sql',
    line: /allow_missing_cron/,
    why: 'the setting is read under this name by migration 20260918160000, which cannot change',
  },
  {
    file: 'src/content/legal/cookies-1.0.ts',
    line: /_company/,
    why: 'a published version of a legal text is kept as it was published; 1.1 names the cookie as it is now',
  },
];
const SKIPPED_DIRS = ['docs/', 'prompts/', 'supabase/migrations/'];
const BINARY = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|pdf|zip)$/i;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The name as a proper noun, and the name as an identifier or an address.
 *
 * The proper noun is matched case-sensitively and on its own: „coridor" is
 * also a Romanian word, and a sentence about a corridor between two
 * cities is not the brand. The lowercase form is caught only where it is
 * a token — `contact@name.ro`, `x-name-commit`, `name_company`,
 * `name.ciorna`, `NameBot` — which is where a rename would leave it
 * behind.
 */
export function brandPatterns(name: string, slug: string): RegExp[] {
  const n = escape(name);
  const s = escape(slug);
  return [
    new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{Ll}\\p{N}])`, 'u'),
    new RegExp(`(?<![\\p{L}\\p{N}])${s}(?:bot|[._:@/-](?=[\\p{L}\\p{N}]))`, 'iu'),
    new RegExp(`[\\p{L}\\p{N}][._:@/-]${s}(?![\\p{L}\\p{N}])`, 'iu'),
  ];
}

function tracked(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '' && existsSync(file));
}

describe('the brand name lives in one place', () => {
  const patterns = brandPatterns(BRAND_NAME, BRAND_SLUG);

  it('the rules catch what a rename would leave behind, and not the Romanian word', () => {
    const hits = (text: string) => patterns.some((p) => p.test(text));
    for (const bad of [
      BRAND_NAME,
      `pe ${BRAND_NAME}.`,
      `contact@${BRAND_SLUG}.ro`,
      `https://${BRAND_SLUG}.ro`,
      `x-${BRAND_SLUG}-commit`,
      `${BRAND_SLUG}_company`,
      `${BRAND_SLUG}.ciorna.cerere`,
      `${BRAND_NAME}Bot/1.0`,
      `${BRAND_SLUG}bot`,
    ]) {
      expect(hits(bad), bad).toBe(true);
    }
    // The Romanian word, in the sentences the route pages and the copy use.
    for (const fine of ['un coridor nu are o singură distanță', 'Pe coridor, cu ocol acceptat', 'pe coridorul Arad — Nădlac']) {
      expect(hits(fine), fine).toBe(false);
    }
  });

  it('appears in no tracked file but the constant and its generated copy', () => {
    const offenders: string[] = [];
    for (const file of tracked()) {
      if (ALLOWED.has(file) || BINARY.test(file) || SKIPPED_DIRS.some((dir) => file.startsWith(dir))) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!patterns.some((p) => p.test(line))) return;
        if (EXEMPT.some((e) => e.file === file && e.line.test(line))) return;
        offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders, `the name is written out in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the scan reaches the places that matter', () => {
    const files = tracked();
    for (const expected of ['src/app/layout.tsx', 'public/sw.js', 'supabase/functions/outbox-dispatcher/templates.ts', 'README.md']) {
      expect(files, expected).toContain(expected);
    }
  });

  it('the slug is the name in lowercase ASCII', () => {
    expect(BRAND_SLUG).toMatch(/^[a-z0-9]+$/);
    expect(BRAND_NAME.trim()).toBe(BRAND_NAME);
    expect(BRAND_NAME.length).toBeGreaterThan(1);
  });

  it('the installed app is called by it', () => {
    expect(manifest().short_name).toBe(BRAND_NAME);
    expect(manifest().name).toContain(BRAND_NAME);
  });
});

describe('what `pnpm brand` wrote is up to date', () => {
  it('the edge functions read the current name and mark', () => {
    expect(readFileSync(EDGE_MIRROR, 'utf8'), 'run `pnpm brand`').toBe(edgeMirror());
  });

  it('every generated file was drawn from the current inputs', () => {
    expect(readFileSync(RECORD, 'utf8'), 'run `pnpm brand`').toBe(record(process.cwd()));
  });

  it('the favicon is the mark', () => {
    const svg = readFileSync(FAVICON_SVG, 'utf8');
    expect(svg).toContain(`d="${MARK.car}"`);
    expect(svg).toContain(`d="${MARK.deck}"`);
  });
});

describe('the generator draws every size', () => {
  let out: string;

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), 'brand-'));
    await generateBrandAssets(process.cwd(), out);
  }, 30_000);

  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it('the favicon, the app icons, the maskable ones, the e-mail mark and the social image', async () => {
    const paths = RASTERS.map((r) => r.path);
    for (const required of [
      'public/icons/favicon-32.png',
      'public/icons/apple-touch-icon.png',
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-192-maskable.png',
      'public/icons/icon-512-maskable.png',
      'public/brand/mark-email.png',
      'public/brand/og.png',
    ]) {
      expect(paths).toContain(required);
    }
    for (const raster of RASTERS) {
      const meta = await sharp(join(out, raster.path)).metadata();
      expect([meta.format, meta.width, meta.height], raster.path).toEqual(['png', raster.width, raster.height]);
    }
  });

  it('a maskable icon fills its square; the plain one leaves its corners clear', async () => {
    const corner = async (path: string) => {
      const { data } = await sharp(join(out, path)).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      return data[3];
    };
    expect(await corner('public/icons/icon-512-maskable.png')).toBe(255);
    expect(await corner('public/icons/icon-512.png')).toBe(0);
  });

  it('writes the favicon, the edge copy and the record too', () => {
    expect(existsSync(join(out, FAVICON_SVG))).toBe(true);
    expect(readFileSync(join(out, EDGE_MIRROR), 'utf8')).toBe(edgeMirror());
    expect(readFileSync(join(out, RECORD), 'utf8')).toBe(record(process.cwd()));
  });

  it('the files it lists are the files the app points at', () => {
    const icons = manifest().icons ?? [];
    for (const icon of icons) {
      expect(RASTERS.map((r) => `/${r.path.replace(/^public\//, '')}`)).toContain(icon.src);
    }
  });
});
