/**
 * Photographs of a vehicle, from the person who owns it.
 *
 * Two things happen to a file before it becomes a photo on a request,
 * and they happen in two different places on purpose:
 *
 *  1. **In the browser**, it is drawn onto a canvas at most
 *     `MAX_EDGE_PX` across and re-encoded. That is a courtesy to the
 *     person: a modern phone photo is 4–8 MB, and four of them on a
 *     Romanian mobile connection is a minute of waiting before anything
 *     appears to happen.
 *  2. **On the server**, it goes through `normaliseImage`, which re-
 *     encodes it again with sharp. That is the guarantee: a canvas
 *     re-encode drops EXIF in every browser anyone uses, but "every
 *     browser anyone uses" is not a security property, and the EXIF
 *     block on a phone photo routinely holds the coordinates of the
 *     place the picture was taken — which, for a car being sold, is
 *     usually where somebody lives.
 *
 * HEIC is the exception to step 1: no browser can decode it into a
 * canvas, so the original is uploaded and the server converts it. That is
 * why the size ceiling is generous.
 */

/** How many photographs one request may carry. */
export const MAX_PHOTOS = 6;

/** The longest edge the browser resizes to before uploading. */
export const MAX_EDGE_PX = 2000;

/** Per file, before the browser touches it. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * What the file input accepts.
 *
 * HEIC is here because half the photographs taken in this market are
 * taken on an iPhone, and a file input that silently refuses them reads
 * as "your phone is wrong".
 */
export const ACCEPTED_PHOTO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type PhotoRejection =
  | { reason: 'type'; message: string }
  | { reason: 'size'; message: string }
  | { reason: 'count'; message: string };

const TYPES = new Set<string>(ACCEPTED_PHOTO_TYPES);

/**
 * Whether a browser can draw this into a canvas.
 *
 * HEIC cannot be, anywhere, so it skips the client-side resize and is
 * sent as it is. Checking the type rather than trying and catching keeps
 * the failure out of the console, where it looks like a bug.
 */
export function canResizeInBrowser(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

/** Why this file cannot be added, in the words the person sees. */
export function rejectPhoto(
  file: { type: string; size: number; name: string },
  alreadyChosen: number,
): PhotoRejection | null {
  if (alreadyChosen >= MAX_PHOTOS) {
    return {
      reason: 'count',
      message: `Poți adăuga cel mult ${MAX_PHOTOS} poze la o cerere.`,
    };
  }
  if (!TYPES.has(file.type)) {
    return {
      reason: 'type',
      message: `„${file.name}” nu e o poză pe care o putem folosi. Acceptăm JPG, PNG, WEBP și HEIC.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      reason: 'size',
      message: `„${file.name}” are peste ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB. Fă o poză mai mică sau alege alta.`,
    };
  }
  return null;
}

/** How many more may be added. Never negative, whatever the caller passes. */
export function remainingPhotoSlots(chosen: number): number {
  return Math.max(0, MAX_PHOTOS - chosen);
}

/**
 * The dimensions to draw at, keeping the aspect ratio.
 *
 * Pure so it can be tested without a canvas: the browser half of this
 * file is three lines around it, and the arithmetic is the part that
 * gets a rounding wrong.
 */
export function scaleToFit(
  width: number,
  height: number,
  max: number = MAX_EDGE_PX,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/**
 * A photo path is one of ours, under this person's own folder.
 *
 * The storage policy says the same thing and is the rule; this is what
 * stops a path from a form being sent to the database at all, and what
 * keeps `photo_paths` from ever holding somebody else's file.
 */
export function ownsPhotoPath(path: string, userId: string): boolean {
  if (path === '' || path.includes('..')) return false;
  return path.startsWith(`${userId}/`);
}

/** The paths a form submitted, filtered to the ones this person may use. */
export function ownedPhotoPaths(paths: readonly string[], userId: string): string[] {
  return paths.filter((path) => ownsPhotoPath(path, userId)).slice(0, MAX_PHOTOS);
}
