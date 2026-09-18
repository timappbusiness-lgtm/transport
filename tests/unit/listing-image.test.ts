import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_EDGE_PX, normaliseImage } from '@/lib/listing-image';

/**
 * The claim this file exists to hold: a photo that arrives with somebody's
 * location in it does not leave with it. Everything else here is a size
 * bound, which is cost. This one is privacy, and a comment asserting it
 * is not the same as a test.
 */

/** A JPEG that really does carry EXIF, including a GPS position. */
async function photoWithExif(width = 2400, height = 1600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } },
  })
    // GPS tags live in their own IFD, which sharp exposes as IFD3. They
    // are the reason this file exists, so the fixture carries real ones
    // rather than a camera name that would prove much less.
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'TP-1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E', GPSLatitude: '44/1 25/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

describe('normaliseImage', () => {
  it('the EXIF block does not survive, GPS included', async () => {
    const before = await sharp(await photoWithExif()).metadata();
    expect(before.exif, 'the fixture has to carry EXIF or this test proves nothing')
      .toBeDefined();
    expect(before.exif!.toString('latin1')).toContain('TestPhone');

    const after = await sharp(await normaliseImage(await photoWithExif())).metadata();
    expect(after.exif).toBeUndefined();
  });

  it('nor does any other metadata block', async () => {
    const after = await sharp(await normaliseImage(await photoWithExif())).metadata();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.icc).toBeUndefined();
  });

  it('brings the longest edge down to the bound', async () => {
    const after = await sharp(await normaliseImage(await photoWithExif(4000, 3000))).metadata();
    expect(after.width).toBe(MAX_EDGE_PX);
    expect(after.height).toBe(1200);
  });

  it('and leaves a small photo alone rather than blowing it up', async () => {
    const after = await sharp(await normaliseImage(await photoWithExif(640, 480))).metadata();
    expect(after.width).toBe(640);
    expect(after.height).toBe(480);
  });

  it('the result is always a JPEG, whatever arrived', async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();

    const after = await sharp(await normaliseImage(png)).metadata();
    expect(after.format).toBe('jpeg');
  });

  it('a photo taken sideways comes out upright, not rotated', async () => {
    // Orientation 6 means "rotate 90° clockwise to display". The tag is
    // about to be dropped, so the rotation has to be applied to the pixels
    // first or the photo arrives on its side.
    // `withMetadata({orientation})` rather than `withExif`: the latter
    // writes the tag but sharp does not read it back as the orientation,
    // so the fixture would carry nothing and the test would pass on a
    // photo that was never sideways.
    const sideways = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    expect((await sharp(sideways).metadata()).orientation).toBe(6);

    const after = await sharp(await normaliseImage(sideways)).metadata();
    expect(after.width).toBe(800);
    expect(after.height).toBe(1200);
  });

  it('something that is not an image is an error, not a stored file', async () => {
    await expect(normaliseImage(Buffer.from('nu e o poză'))).rejects.toThrow();
  });

  it('the output is smaller than a phone photo, which is the other point', async () => {
    const original = await photoWithExif(4000, 3000);
    const result = await normaliseImage(original);
    expect(result.byteLength).toBeLessThan(original.byteLength);
  });
});
