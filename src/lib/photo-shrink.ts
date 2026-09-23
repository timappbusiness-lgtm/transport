import { canResizeInBrowser, scaleToFit } from './photo-upload';

/**
 * Drawing a photo down to size before it is uploaded.
 *
 * On a phone this is the difference between an upload that finishes and
 * one somebody abandons: a modern camera writes 4–8 MB and four of those
 * over a mobile connection is a minute of nothing happening.
 *
 * HEIC cannot be drawn into a canvas anywhere, so it goes up as it is and
 * the server converts it. Every failure here falls back to the original
 * file rather than refusing: a resize is an optimisation, and an
 * optimisation that can block an upload is a bug.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (!canResizeInBrowser(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height);
    if (width === bitmap.width && height === bitmap.height) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (blob === null) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
