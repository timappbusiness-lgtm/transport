/**
 * Every file derived from the name and the mark, regenerated in one go.
 *
 *   pnpm brand
 *
 * Run it after changing `BRAND_NAME` or `BRAND_TAGLINE_RO` in
 * `src/config/brand.ts`, the mark in `src/config/brand-mark.ts`, or a
 * colour token in `src/app/globals.css`, and commit what it writes:
 *
 *   src/app/icon.svg                      the favicon, vector
 *   public/icons/favicon-32.png           the favicon for browsers without SVG
 *   public/icons/apple-touch-icon.png     180, full-bleed (iOS rounds it)
 *   public/icons/icon-{192,512}.png       app icons, rounded tile
 *   public/icons/icon-{192,512}-maskable.png   inside the maskable safe zone
 *   public/brand/mark-email.png           the mark for the e-mail header
 *   public/brand/og.png                   the social image, 1200×630, with the name
 *   supabase/functions/_shared/brand.ts   the name and the mark for the edge functions
 *   public/brand/brand.json               a fingerprint of what they were made from
 *
 * The name in the social image is drawn as outlines from the committed
 * Inter Tight SemiBold (`scripts/brand/fonts`), not left to whatever fonts
 * the machine has, so every machine draws the same picture. Colours are
 * read from the tokens in `globals.css`; nothing here holds a hex.
 *
 * `tests/unit/brand.test.ts` runs this into a temporary directory, checks
 * every size, and fails when a committed file is older than its inputs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openSync, type Font } from 'fontkit';
import sharp from 'sharp';
import { BRAND_NAME, BRAND_SLUG, BRAND_TAGLINE_RO } from '../../src/config/brand.ts';
import { MARK, TILE, markStroke } from '../../src/config/brand-mark.ts';

export const FONT_PATH = 'scripts/brand/fonts/InterTight-SemiBold.ttf';

/** Every PNG the command writes, with its size. */
export const RASTERS = [
  { path: 'public/icons/favicon-32.png', width: 32, height: 32 },
  { path: 'public/icons/apple-touch-icon.png', width: 180, height: 180 },
  { path: 'public/icons/icon-192.png', width: 192, height: 192 },
  { path: 'public/icons/icon-512.png', width: 512, height: 512 },
  { path: 'public/icons/icon-192-maskable.png', width: 192, height: 192 },
  { path: 'public/icons/icon-512-maskable.png', width: 512, height: 512 },
  { path: 'public/brand/mark-email.png', width: 96, height: 96 },
  { path: 'public/brand/og.png', width: 1200, height: 630 },
] as const;

export const FAVICON_SVG = 'src/app/icon.svg';
export const EDGE_MIRROR = 'supabase/functions/_shared/brand.ts';
export const RECORD = 'public/brand/brand.json';

type Tokens = Record<'foreground' | 'accent' | 'accent-bright' | 'accent-on-dark' | 'dark-from' | 'dark-to' | 'surface', string>;

/** The colour tokens the drawings use, read from the stylesheet. */
export function readTokens(root: string): Tokens {
  const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8');
  const names = ['foreground', 'accent', 'accent-bright', 'accent-on-dark', 'dark-from', 'dark-to', 'surface'] as const;
  const out = {} as Tokens;
  for (const name of names) {
    const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!match) throw new Error(`--color-${name} is missing from globals.css`);
    out[name] = match[1]!.toLowerCase();
  }
  return out;
}

/** The two strokes, on the 24-unit grid. */
function glyph(ramp: string, deck: string, stroke: number): string {
  return (
    `<g fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${MARK.deck}" stroke="${deck}"/><path d="${MARK.ramp}" stroke="${ramp}"/></g>`
  );
}

/** The glyph scaled into the middle of the grid. */
function centred(scale: number, inner: string): string {
  const offset = (MARK.grid * (1 - scale)) / 2;
  return `<g transform="translate(${round(offset)} ${round(offset)}) scale(${scale})">${inner}</g>`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * The mark on a dark tile: the favicon and the app icons.
 *
 * `rounded` leaves the corners transparent, for places that show the
 * icon as it is; a full-bleed tile is for places that crop it themselves.
 */
function tile(t: Tokens, px: number, scale: number, rounded: boolean): string {
  const g = MARK.grid;
  const ground = `<rect width="${g}" height="${g}"${rounded ? ` rx="${TILE.radius}"` : ''} fill="${t['dark-from']}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${g} ${g}">` +
    ground +
    centred(scale, glyph(t['accent-bright'], t['accent-on-dark'], markStroke(px * scale))) +
    `</svg>`
  );
}

/** The mark alone on a transparent ground, in the light-surface colours. */
function bare(t: Tokens, px: number): string {
  const g = MARK.grid;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${g} ${g}">` +
    glyph(t.accent, t.foreground, markStroke(px)) +
    `</svg>`
  );
}

/** A line of text as outlines, with the lockup's tracking (-0.02em). */
function outlines(font: Font, text: string, size: number): { paths: string; width: number } {
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  const tracking = -0.02 * size;
  let x = 0;
  const paths: string[] = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i]!;
    const d = g.path.toSVG();
    if (d) {
      const gx = round(x + pos.xOffset * scale);
      const gy = round(-pos.yOffset * scale);
      paths.push(`<path transform="translate(${gx} ${gy}) scale(${round(scale)} ${round(-scale)})" d="${d}"/>`);
    }
    x += pos.xAdvance * scale + (i < run.glyphs.length - 1 ? tracking : 0);
  });
  return { paths: paths.join(''), width: x };
}

/**
 * The social image: the lockup on the dark gradient, the tagline under it.
 *
 * The name is fitted, not assumed: a longer name gets a smaller size
 * rather than running off the edge, so a rename cannot produce a clipped
 * card.
 */
function socialImage(t: Tokens, font: Font): string {
  const W = 1200;
  const H = 630;
  const margin = 96;
  const markPx = 152;
  const gap = 40;
  const room = W - 2 * margin - markPx - gap;

  let nameSize = 132;
  let name = outlines(font, BRAND_NAME, nameSize);
  if (name.width > room) {
    nameSize = Math.floor((nameSize * room) / name.width);
    name = outlines(font, BRAND_NAME, nameSize);
  }
  let tagSize = 44;
  let tag = outlines(font, BRAND_TAGLINE_RO, tagSize);
  if (tag.width > W - 2 * margin) {
    tagSize = Math.floor((tagSize * (W - 2 * margin)) / tag.width);
    tag = outlines(font, BRAND_TAGLINE_RO, tagSize);
  }

  const cap = (font.capHeight / font.unitsPerEm) * nameSize;
  const lockupTop = 206;
  const markY = lockupTop + (Math.max(cap, markPx) - markPx) / 2;
  const baseline = lockupTop + (Math.max(cap, markPx) + cap) / 2;
  const tagBaseline = lockupTop + Math.max(cap, markPx) + 96;
  const s = markPx / MARK.grid;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${t['dark-from']}"/><stop offset="1" stop-color="${t['dark-to']}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<g transform="translate(${margin} ${round(markY)}) scale(${round(s)})">` +
    glyph(t['accent-bright'], t['accent-on-dark'], markStroke(markPx)) +
    `</g>` +
    `<g fill="${t.surface}" transform="translate(${margin + markPx + gap} ${round(baseline)})">${name.paths}</g>` +
    `<g fill="${t['accent-on-dark']}" transform="translate(${margin} ${round(tagBaseline)})">${tag.paths}</g>` +
    `</svg>`
  );
}

/** The copy the edge functions import. Plain text, so a test can compare it. */
export function edgeMirror(): string {
  return `// Generated by \`pnpm brand\` from src/config/brand.ts and src/config/brand-mark.ts.
// Do not edit: change those files and run the command again.
//
// The edge functions are bundled from supabase/functions alone and cannot
// import from src/, so the name and the mark reach them through this copy.
// tests/unit/brand.test.ts fails when it falls behind.

export const BRAND_NAME = ${JSON.stringify(BRAND_NAME)};

/** Lowercase ASCII letters and digits: a file name, a crawler's name. */
export const BRAND_SLUG = ${JSON.stringify(BRAND_SLUG)};

export const MARK = {
  grid: ${MARK.grid},
  ramp: ${JSON.stringify(MARK.ramp)},
  deck: ${JSON.stringify(MARK.deck)},
} as const;
`;
}

/**
 * A fingerprint of every input, for the staleness test.
 *
 * A hash rather than the inputs themselves, so the name is not written
 * into one more file: the test recomputes it and fails with „run pnpm
 * brand" when the name, the tagline, the mark, a token, the font or this
 * script changed and the files did not.
 */
export function record(root: string): string {
  const inputs = createHash('sha256')
    .update(JSON.stringify({ name: BRAND_NAME, tagline: BRAND_TAGLINE_RO, mark: MARK, tokens: readTokens(root) }))
    .update(readFileSync(join(root, FONT_PATH)))
    .update(readFileSync(join(root, 'scripts/brand/generate.ts')))
    .digest('hex');
  return (
    JSON.stringify(
      {
        generatedBy: 'pnpm brand',
        inputs,
        files: [FAVICON_SVG, ...RASTERS.map((r) => r.path), EDGE_MIRROR],
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * Writes every file under `out` (the repository itself, or a temporary
 * directory in the test), reading the inputs from `root`.
 */
export async function generateBrandAssets(root: string, out: string = root): Promise<string[]> {
  const t = readTokens(root);
  const font = openSync(join(root, FONT_PATH));

  const svgs: Record<(typeof RASTERS)[number]['path'], string> = {
    'public/icons/favicon-32.png': tile(t, 32, TILE.scale.favicon, true),
    'public/icons/apple-touch-icon.png': tile(t, 180, TILE.scale.apple, false),
    'public/icons/icon-192.png': tile(t, 192, TILE.scale.icon, true),
    'public/icons/icon-512.png': tile(t, 512, TILE.scale.icon, true),
    'public/icons/icon-192-maskable.png': tile(t, 192, TILE.scale.maskable, false),
    'public/icons/icon-512-maskable.png': tile(t, 512, TILE.scale.maskable, false),
    'public/brand/mark-email.png': bare(t, 96),
    'public/brand/og.png': socialImage(t, font),
  };

  const written: string[] = [];
  const write = (path: string, body: string | Buffer) => {
    const target = join(out, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    written.push(path);
  };

  write(FAVICON_SVG, tile(t, 32, TILE.scale.favicon, true) + '\n');
  for (const raster of RASTERS) {
    const png = await sharp(Buffer.from(svgs[raster.path]), { density: 72 })
      .resize(raster.width, raster.height)
      .png({ compressionLevel: 9 })
      .toBuffer();
    write(raster.path, png);
  }
  write(EDGE_MIRROR, edgeMirror());
  write(RECORD, record(root));
  return written;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const files = await generateBrandAssets(root);
  console.log(`${BRAND_NAME}: ${files.length} files written`);
  for (const file of files) console.log(`  ${file}`);
}
