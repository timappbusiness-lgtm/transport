import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CategoryArt, CategoryTile } from '@/components/ui/category-art';
import {
  CATEGORY_ART,
  CATEGORY_LISTS,
  CATEGORY_TINT,
  TINT_CLASS,
  artFor,
  tintFor,
} from '@/lib/category-art';
import { CARGO_CATEGORIES } from '@/lib/departures';

/**
 * Ten drawings for ten categories, and the map between them complete in
 * both directions.
 *
 * One way round: every category the platform offers has a drawing and a
 * tint, so no card ever renders an empty tile. The other way round:
 * every drawing belongs to a category the platform offers, so nobody
 * draws a lorry for a niche the platform has left and leaves it lying
 * in the component where the next person finds it and uses it.
 */

const CSS = readFileSync('src/app/globals.css', 'utf8');

describe('the map, both ways', () => {
  it('every offered category has a drawing', () => {
    expect([...CATEGORY_ART].sort()).toEqual([...CATEGORY_LISTS.offered].sort());
  });

  it('and every drawing is an offered category — none for a retired one', () => {
    for (const art of CATEGORY_ART) {
      expect(CATEGORY_LISTS.offered, art).toContain(art);
      expect(CATEGORY_LISTS.retired, art).not.toContain(art);
    }
  });

  it('every drawing has a tint, and every tint is a token', () => {
    for (const art of CATEGORY_ART) {
      const family = CATEGORY_TINT[art];
      expect(family, art).toBeDefined();
      expect(CSS, `--color-tint-${family} missing`).toContain(`--color-tint-${family}:`);
      expect(TINT_CLASS[family]).toBe(`bg-tint-${family}`);
    }
  });

  it('a retired category still renders, as „altceva" — never as itself', () => {
    // A listing published as `camion` is real and stays readable; it is
    // not advertised with a drawing of a lorry.
    for (const retired of CATEGORY_LISTS.retired) {
      expect(artFor(retired), retired).toBe('altele');
      expect(tintFor(retired), retired).toBe(TINT_CLASS[CATEGORY_TINT.altele]);
    }
  });

  it('and every value the enum can hold resolves to something', () => {
    for (const category of CARGO_CATEGORIES) {
      expect(CATEGORY_ART as readonly string[], category).toContain(artFor(category));
    }
  });
});

describe('the drawings', () => {
  it.each(CATEGORY_ART)('%s draws, on currentColor, with two stroke weights', (category) => {
    const html = renderToStaticMarkup(<CategoryArt category={category} />);
    expect(html).toContain(`data-category-art="${category}"`);
    // The family: heavy structure, light trim.
    expect(html, `${category}: no heavy stroke`).toContain('stroke-width="2.2"');
    expect(html, `${category}: no light stroke`).toContain('stroke-width="1.2"');
    // And one detail in the accent, which switches to its pale step on a
    // dark section.
    expect(html, `${category}: no accent detail`).toMatch(/(?:stroke|fill)-accent in-data-\[surface=dark\]:(?:stroke|fill)-accent-on-dark/);
  });

  it.each(CATEGORY_ART)('%s carries no hex and no fixed colour', (category) => {
    const html = renderToStaticMarkup(<CategoryArt category={category} />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toMatch(/(?:fill|stroke)="(?!none|currentColor)[^"]+"/);
  });

  it('is silent beside a label, and named when it stands alone', () => {
    expect(renderToStaticMarkup(<CategoryArt category="rulota" />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<CategoryArt category="rulota" label="Rulotă" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Rulotă"');
  });

  it('a tile puts the drawing on its category ground', () => {
    const html = renderToStaticMarkup(<CategoryTile category="istoric" size="card" />);
    expect(html).toContain('bg-tint-sand');
    expect(html).toContain('data-category-art="istoric"');
  });
});
