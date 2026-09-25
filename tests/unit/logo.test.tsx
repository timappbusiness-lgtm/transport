import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logo, type LogoLayout } from '@/components/brand/logo';
import { LogoMark, type MarkTone } from '@/components/brand/logo-mark';
import { BRAND_NAME } from '@/config/brand';
import { MARK, MARK_SIZES, markStroke } from '@/config/brand-mark';

const TONES: MarkTone[] = ['color', 'mono'];
const LAYOUTS: LogoLayout[] = ['horizontal', 'stacked', 'mark'];

describe('the mark', () => {
  it.each(MARK_SIZES.flatMap((size) => TONES.map((tone) => [size, tone] as const)))(
    'draws at %ipx in %s',
    (size, tone) => {
      const html = renderToStaticMarkup(<LogoMark size={size} tone={tone} />);
      expect(html).toContain(`width="${size}"`);
      expect(html).toContain(`height="${size}"`);
      expect(html).toContain(`viewBox="0 0 ${MARK.grid} ${MARK.grid}"`);
      expect(html).toContain(`stroke-width="${markStroke(size)}"`);
      expect(html).toContain(`d="${MARK.ramp}"`);
      expect(html).toContain(`d="${MARK.deck}"`);
      // Decorative: the name is always beside it or in an sr-only span.
      expect(html).toContain('aria-hidden="true"');
    },
  );

  it('is heavier when small, so two strokes survive 16px', () => {
    const widths = MARK_SIZES.map((size) => markStroke(size) * (size / MARK.grid));
    // On screen, a 16px mark's stroke is at least 2px.
    expect(widths[0]).toBeGreaterThanOrEqual(2);
    for (const size of MARK_SIZES) expect(markStroke(size)).toBeGreaterThan(2);
  });

  it('in colour follows the surface; monochrome follows the text', () => {
    const colour = renderToStaticMarkup(<LogoMark tone="color" />);
    expect(colour).toContain('stroke-accent');
    expect(colour).toContain('in-data-[surface=dark]:stroke-accent-bright');
    expect(colour).toContain('in-data-[surface=dark]:stroke-accent-on-dark');
    const mono = renderToStaticMarkup(<LogoMark tone="mono" />);
    expect(mono.match(/stroke-current/g)).toHaveLength(2);
    expect(mono).not.toContain('accent');
  });

  it('holds no colour value, only tokens', () => {
    for (const tone of TONES) {
      expect(renderToStaticMarkup(<LogoMark tone={tone} />)).not.toMatch(/#[0-9a-f]{3,6}\b|rgb/i);
    }
  });
});

describe('the lockup', () => {
  it.each(LAYOUTS)('%s carries the name from the constant', (layout) => {
    const html = renderToStaticMarkup(<Logo layout={layout} />);
    expect(html).toContain(`data-logo="${layout}"`);
    expect(html).toContain(`>${BRAND_NAME}</span>`);
    expect(html).toContain(`d="${MARK.ramp}"`);
  });

  it('draws the word in the display face beside or under the mark', () => {
    const horizontal = renderToStaticMarkup(<Logo layout="horizontal" />);
    expect(horizontal).toContain('font-display');
    expect(horizontal).not.toContain('flex-col');
    const stacked = renderToStaticMarkup(<Logo layout="stacked" />);
    expect(stacked).toContain('flex-col');
    expect(stacked).toContain('font-display');
  });

  it('mark-only keeps the name for a screen reader, and draws only the mark', () => {
    const html = renderToStaticMarkup(<Logo layout="mark" />);
    expect(html).toContain(`<span data-logo-word="" class="sr-only">${BRAND_NAME}</span>`);
    expect(html).not.toContain('font-display');
  });

  it('takes every mark size', () => {
    for (const size of MARK_SIZES) {
      expect(renderToStaticMarkup(<Logo size={size} />)).toContain(`width="${size}"`);
    }
  });

  it('lets a narrow place hide the word without losing it', () => {
    const html = renderToStaticMarkup(<Logo wordClassName="sr-only sm:not-sr-only" />);
    expect(html).toContain('sr-only sm:not-sr-only');
    expect(html).toContain(BRAND_NAME);
  });
});
