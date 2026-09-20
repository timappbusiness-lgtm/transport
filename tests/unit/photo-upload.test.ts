import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_FILE_BYTES,
  MAX_PHOTOS,
  canResizeInBrowser,
  ownedPhotoPaths,
  ownsPhotoPath,
  rejectPhoto,
  remainingPhotoSlots,
  scaleToFit,
} from '@/lib/photo-upload';

const file = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
  type: 'image/jpeg',
  size: 1024,
  name: 'masina.jpg',
  ...over,
});

describe('which files a person may add', () => {
  it('accepts an ordinary phone photo', () => {
    expect(rejectPhoto(file(), 0)).toBeNull();
  });

  it('accepts HEIC, because half this market shoots on an iPhone', () => {
    expect(rejectPhoto(file({ type: 'image/heic', name: 'IMG_0421.HEIC' }), 0)).toBeNull();
  });

  it('refuses a PDF, and says what it does take', () => {
    const rejection = rejectPhoto(file({ type: 'application/pdf', name: 'talon.pdf' }), 0);
    expect(rejection?.reason).toBe('type');
    expect(rejection?.message).toContain('JPG');
    expect(rejection?.message).toContain('talon.pdf');
  });

  it('refuses one over the size ceiling, naming the file', () => {
    const rejection = rejectPhoto(file({ size: MAX_FILE_BYTES + 1 }), 0);
    expect(rejection?.reason).toBe('size');
    expect(rejection?.message).toContain('masina.jpg');
    expect(rejection?.message).toContain('10 MB');
  });

  it('stops at six, whatever the file is', () => {
    expect(rejectPhoto(file(), MAX_PHOTOS)?.reason).toBe('count');
    expect(rejectPhoto(file(), MAX_PHOTOS + 3)?.reason).toBe('count');
  });

  it('checks the count before the type, so the message is the useful one', () => {
    // Somebody with six photos who picks a PDF has two problems; the one
    // that stops them is the count, and that is what they should read.
    expect(rejectPhoto(file({ type: 'application/pdf' }), MAX_PHOTOS)?.reason).toBe('count');
  });

  it('counts the slots left', () => {
    expect(remainingPhotoSlots(0)).toBe(MAX_PHOTOS);
    expect(remainingPhotoSlots(MAX_PHOTOS)).toBe(0);
    expect(remainingPhotoSlots(MAX_PHOTOS + 5)).toBe(0);
  });

  it('offers HEIC in the accept list', () => {
    expect(ACCEPTED_PHOTO_TYPES).toContain('image/heic');
  });
});

describe('what the browser can resize', () => {
  it('handles the three formats a canvas can decode', () => {
    expect(canResizeInBrowser('image/jpeg')).toBe(true);
    expect(canResizeInBrowser('image/png')).toBe(true);
    expect(canResizeInBrowser('image/webp')).toBe(true);
  });

  it('leaves HEIC to the server, because no browser decodes it', () => {
    expect(canResizeInBrowser('image/heic')).toBe(false);
    expect(canResizeInBrowser('image/heif')).toBe(false);
  });
});

describe('scaling to the longest edge', () => {
  it('leaves a small photo alone', () => {
    expect(scaleToFit(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('caps the long edge and keeps the proportions', () => {
    expect(scaleToFit(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(scaleToFit(3000, 4000)).toEqual({ width: 1500, height: 2000 });
  });

  it('never rounds an edge down to nothing', () => {
    const { width, height } = scaleToFit(10000, 3, 2000);
    expect(width).toBe(2000);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('survives a zero, which is what a broken decode gives', () => {
    expect(scaleToFit(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe('whose file a path is', () => {
  const me = '11111111-1111-1111-1111-111111111111';
  const you = '22222222-2222-2222-2222-222222222222';

  it('accepts a path under my own folder', () => {
    expect(ownsPhotoPath(`${me}/foto-1.jpg`, me)).toBe(true);
  });

  it('refuses a path under somebody else\u2019s folder', () => {
    expect(ownsPhotoPath(`${you}/foto-1.jpg`, me)).toBe(false);
  });

  it('refuses a traversal, a bare name and an empty string', () => {
    expect(ownsPhotoPath(`${me}/../${you}/foto.jpg`, me)).toBe(false);
    expect(ownsPhotoPath('foto.jpg', me)).toBe(false);
    expect(ownsPhotoPath('', me)).toBe(false);
  });

  it('filters a submitted list down to mine, capped at six', () => {
    const paths = [
      `${me}/1.jpg`,
      `${you}/2.jpg`,
      `${me}/3.jpg`,
      `${me}/4.jpg`,
      `${me}/5.jpg`,
      `${me}/6.jpg`,
      `${me}/7.jpg`,
      `${me}/8.jpg`,
    ];
    const kept = ownedPhotoPaths(paths, me);
    expect(kept).toHaveLength(MAX_PHOTOS);
    expect(kept.every((p) => p.startsWith(me))).toBe(true);
  });
});
