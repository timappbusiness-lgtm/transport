import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AnpcBadges } from '@/components/layout/anpc-badges';
import { BADGE_WIDTH, CONSUMER_REDRESS, redressEntry } from '@/config/consumer-redress';

/**
 * The ANPC badges in the footer are ANPC's own artwork from Annex 2, cut by
 * `pnpm anpc` from `docs/anpc/anexa-2.png`. What is checked here: the files
 * are there, at twice the size they are shown at, and the config says the
 * same sizes; the order is the annex's; each badge is one link, named by
 * its image, to the official page.
 */

/** Width and height from a PNG's header, without decoding it. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('ascii'), `${path} is a PNG`).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('the official files', () => {
  it('are kept with the annex they were cut from', () => {
    expect(existsSync('docs/anpc/anexa-2.png')).toBe(true);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.anpc).toBe('node scripts/anpc/crop.ts');
  });

  it.each(CONSUMER_REDRESS.map((e) => [e.key, e] as const))(
    '%s is a PNG at twice the width it is shown at, and the config knows its size',
    (_key, entry) => {
      const file = `public${entry.image.src}`;
      expect(existsSync(file), file).toBe(true);
      const size = pngSize(file);
      expect(size).toEqual({ width: entry.image.width, height: entry.image.height });
      expect(size.width).toBe(BADGE_WIDTH * 2);
    },
  );

  it.each(CONSUMER_REDRESS.map((e) => [e.key, e] as const))(
    '%s keeps every pixel of the badge; only the paper outside its rounded corners is clear',
    async (_key, entry) => {
      const { data, info } = await sharp(`public${entry.image.src}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
      // The corner is outside the rounded border: clear, so no white shows
      // on the grey footer.
      expect(alpha(0, 0)).toBe(0);
      expect(alpha(info.width - 1, info.height - 1)).toBe(0);
      // The middle and the length of the sides are the badge: opaque.
      expect(alpha(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBe(255);
      expect(alpha(Math.floor(info.width / 2), 4)).toBe(255);
      // And the clear part is the corners and a hairline, nothing more.
      let clear = 0;
      for (let i = 3; i < data.length; i += info.channels) if (data[i] === 0) clear += 1;
      expect(clear / (info.width * info.height)).toBeLessThan(0.03);
    },
  );

  it('are the same height, so the two sit level side by side', () => {
    const [sal, sol] = CONSUMER_REDRESS.map((e) => e.image.height);
    expect(sal).toBe(sol);
  });
});

describe('the badges', () => {
  const html = renderToStaticMarkup(<AnpcBadges />);

  it('are in the annex order: SAL with the emblem, then SOL', () => {
    expect(CONSUMER_REDRESS.map((e) => e.key)).toEqual(['sal', 'sol']);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html.indexOf('data-redress="sal"')).toBeLessThan(html.indexOf('data-redress="sol"'));
  });

  it.each(CONSUMER_REDRESS.map((e) => [e.key, e] as const))(
    '%s is one link to the official page, in a new tab, named by its image',
    (_key, entry) => {
      const link = new RegExp(`<a [^>]*data-redress="${entry.key}"[^>]*>(.*?)</a>`).exec(html);
      expect(link).not.toBeNull();
      const [open, inner] = [link![0].slice(0, link![0].indexOf('>') + 1), link![1]!];
      expect(open).toContain(`href="${entry.href}"`);
      expect(open).toContain('target="_blank"');
      expect(open).toContain('rel="noopener noreferrer"');
      expect(open).toContain('aria-describedby="anpc-badge-new-tab"');
      expect(open).toContain('focus-visible:outline-2');
      // The image is the whole content, and its alt text is the name.
      expect(inner).toMatch(new RegExp(`^<img [^>]*alt="${entry.name}"[^>]*/?>$`));
      expect(inner).toContain(`src="${entry.image.src}"`);
      expect(inner).toContain(`width="${BADGE_WIDTH}"`);
      // Sized, never stretched: the height follows the file.
      expect(inner).toContain('h-auto');
    },
  );

  it('say they open a new tab without changing their names', () => {
    expect(html).toMatch(/<span id="anpc-badge-new-tab" hidden="">Se deschide într-o filă nouă\.<\/span>/);
    expect(redressEntry('sal').name).toBe('Soluționarea alternativă a litigiilor — ANPC');
    expect(redressEntry('sol').name).toBe('Soluționarea online a litigiilor');
  });

  it('draw nothing of their own: no CSS badge, no colour of ours on them', () => {
    const source = readFileSync('src/components/layout/anpc-badges.tsx', 'utf8');
    expect(source).not.toMatch(/\b(?:bg|text|border|fill|stroke)-(?:accent|anpc)/);
    expect(html).not.toContain('Detalii');
    expect(html).not.toMatch(/<svg/);
  });
});

describe('the two addresses', () => {
  it('SAL is the ANPC complaints platform since Order 270/2026', () => {
    expect(redressEntry('sal').href).toBe('https://reclamatiisal.anpc.ro/');
    expect(redressEntry('sal').closedOn).toBeNull();
  });

  it('SOL is the old Commission address, and the entry says the platform closed', () => {
    // Shown on the owner's decision; the date travels with it so nobody
    // mistakes it for a live service. docs/09-verificare-juridica.md, item 13.
    expect(redressEntry('sol').href).toBe('https://ec.europa.eu/consumers/odr');
    expect(redressEntry('sol').closedOn).toBe('2025-07-20');
  });
});
