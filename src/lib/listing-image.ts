import 'server-only';
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
 * Server-only, and marked as such: sharp is a native module, and a
 * client component that imports anything from here drags it into the
 * browser bundle. `ACCEPTED_IMAGE_TYPES` lives in `listing-import.ts`
 * for exactly that reason — it is a fact about a file input, not about
 * sharp.
 *
 * `rotate()` with no argument is not cosmetic. It applies the EXIF
 * orientation tag before that tag is dropped, so a photo taken sideways
 * stays the right way up instead of arriving rotated once the tag it
 * depended on is gone.
 */

/**
 * The longest edge we keep.
 *
 * Two thousand rather than sixteen hundred since the client can upload
 * their own: a photograph of a scratch on a wing is evidence at delivery,
 * and at 1600px across a whole car the scratch is four pixels. The
 * browser resizes to the same number before uploading, so this is
 * normally a no-op — it is the guarantee for the files it could not
 * resize, which is every HEIC.
 */
export const MAX_EDGE_PX = 2000;

/** A guard against a decompression bomb: a small file, an enormous canvas. */
export const MAX_INPUT_PIXELS = 50_000_000;

export async function normaliseImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
