import sharp from 'sharp';

/**
 * Making a third-party photo safe to keep.
 *
 * A photo from a car listing, or from somebody's phone, carries an EXIF
 * block. On a phone photo that block routinely holds the coordinates of
 * wherever the picture was taken, which for a car for sale is usually
 * where somebody lives. Putting that on a public request board is a
 * privacy failure nobody would notice until it mattered.
 *
 * Re-encoding is the strip: sharp writes no metadata unless it is asked
 * to, so there is no separate call to make — and `.withMetadata()` would
 * undo the whole point of this file.
 *
 * `rotate()` with no argument is not cosmetic. It applies the EXIF
 * orientation tag before that tag is dropped, so a photo taken sideways
 * stays the right way up instead of arriving rotated once the tag it
 * depended on is gone.
 */

/** The longest edge we keep. Beyond this is detail nobody looks at. */
export const MAX_EDGE_PX = 1600;

/** A guard against a decompression bomb: a small file, an enormous canvas. */
export const MAX_INPUT_PIXELS = 50_000_000;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export async function normaliseImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
