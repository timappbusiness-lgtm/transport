/**
 * The two ANPC badges, cut out of the official annex.
 *
 *   pnpm anpc
 *
 * ANPC publishes the SAL and SOL pictograms as Annex 2 to its order on
 * informing consumers about dispute resolution, for traders to show on
 * their sites. The separate files on anpc.ro could not be downloaded from
 * where this was written, so the badges are cut from the annex as
 * published — `docs/anpc/anexa-2.png`, the facsimile of Annex 2 — at the
 * best resolution available:
 *
 *   public/anpc/sal.png   Soluționarea alternativă a litigiilor, with the emblem
 *   public/anpc/sol.png   Soluționarea online a litigiilor
 *
 * Nothing is redrawn, recoloured or restyled. Each badge is found by the
 * ink of its border, cut with one pixel of the annex's white around it so
 * the border is never clipped, and scaled down — never up — to 500 pixels
 * wide, twice the 250 it is shown at, keeping its ratio. The one change is
 * outside the badge: the annex's paper beyond the rounded border is made
 * transparent, so the corners do not show as white on a grey footer.
 *
 * When ANPC's own files become available, put them in `public/anpc/`
 * under the same names instead and update the sizes in
 * `src/config/consumer-redress.ts`; `tests/unit/anpc-badges.test.tsx`
 * checks the two agree.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SOURCE = 'docs/anpc/anexa-2.png';
const OUT_DIR = 'public/anpc';
/** Twice the width the footer shows them at. */
export const OUT_WIDTH = 500;
/** Ink: anything darker than the annex's white paper, anti-aliasing included. */
const INK = 250;
/** Badges are tall; the annex's heading and footnote are single text lines. */
const MIN_BADGE_HEIGHT = 100;
/** In the annex's order: SAL first, then SOL. */
const NAMES = ['sal', 'sol'] as const;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function findBadges(): Promise<Box[]> {
  const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const ink = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return (data[i]! + data[i + 1]! + data[i + 2]!) / 3 < INK;
  };
  const rowHasInk = (y: number) => {
    for (let x = 0; x < width; x += 1) if (ink(x, y)) return true;
    return false;
  };

  // Bands of rows with ink in them; the tall ones are the two badges.
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const has = y < height && rowHasInk(y);
    if (has && start < 0) start = y;
    if (!has && start >= 0) {
      if (y - start >= MIN_BADGE_HEIGHT) bands.push([start, y - 1]);
      start = -1;
    }
  }

  return bands.map(([top, bottom]) => {
    let left = width;
    let right = 0;
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (ink(x, y)) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    // One pixel of the annex's own white around the border.
    const l = Math.max(0, left - 1);
    const t = Math.max(0, top - 1);
    return {
      left: l,
      top: t,
      width: Math.min(width - 1, right + 1) - l + 1,
      height: Math.min(height - 1, bottom + 1) - t + 1,
    };
  });
}

/**
 * The badge with the annex's paper around it made transparent.
 *
 * The annex is printed on white, so a straight cut is a white rectangle
 * whose corners show outside the badge's rounded border on any page that
 * is not white. The white that touches the edge of the cut is flooded
 * away, stopping at the border; nothing inside the border — the emblem,
 * the wording, the pill, the badge's own white — is touched. If the fill
 * ever reached the middle of the badge (a gap in the border), the cut is
 * refused rather than shipped with holes.
 */
async function withoutPaper(box: Box) {
  const { data, info } = await sharp(SOURCE)
    .extract(box)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const paper = (p: number) => (data[p * channels]! + data[p * channels + 1]! + data[p * channels + 2]!) / 3 >= INK;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (seen[p] || !paper(p)) continue;
    seen[p] = 1;
    data[p * channels + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < width * (height - 1)) stack.push(p + width);
  }
  const middle = Math.floor(height / 2) * width + Math.floor(width / 2);
  if (seen[middle]) throw new Error('the fill reached the middle of a badge: its border has a gap');
  return { data, info: { width, height, channels: 4 as const } };
}

async function main() {
  const boxes = await findBadges();
  if (boxes.length !== NAMES.length) {
    throw new Error(`expected ${NAMES.length} badges in ${SOURCE}, found ${boxes.length}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [i, name] of NAMES.entries()) {
    const box = boxes[i]!;
    if (box.width < OUT_WIDTH) throw new Error(`${name}: the annex is too small to scale down to ${OUT_WIDTH}px`);
    const out = `${OUT_DIR}/${name}.png`;
    const cut = await withoutPaper(box);
    const written = await sharp(cut.data, { raw: cut.info })
      .resize({ width: OUT_WIDTH, kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`${out}: ${written.width}×${written.height} from ${box.width}×${box.height} at ${box.left},${box.top}`);
  }
}

await main();
