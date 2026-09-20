import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CategoriesSection } from '@/components/home/categories';
import type { ActivityStats, ActivityThresholds, CategoryCount } from '@/lib/requests';
import type { HomepageActivity } from '@/lib/requests-source';

/**
 * The category counters, rendered without a browser.
 *
 * The block is the most copied thing on the competitor's site and the
 * reason it works there is that the numbers are real. These check the
 * two ways ours could stop being: a number shown when there is nothing
 * behind it, and a link that does not lead where the number says.
 */

const STATS: ActivityStats = {
  publishedTotal: 120,
  publishedLast7d: 9,
  totalKm: 70107,
  activeTotal: 31,
  daily: [],
  dailyFrom: '2026-08-23',
};

const THRESHOLDS: ActivityThresholds = {
  statsMinRequests: 50,
  feedMinRequests: 6,
  verifiedCompaniesMin: 20,
};

const CATEGORIES: CategoryCount[] = [
  { category: 'autoturism', label: 'Autoturism', requests: 84 },
  { category: 'motocicleta', label: 'Motocicletă', requests: 12 },
  { category: 'utilaj_agricol', label: 'Utilaj agricol', requests: 1 },
];

function render(over: Partial<HomepageActivity> = {}): string {
  return renderToStaticMarkup(
    <CategoriesSection
      stats={STATS}
      thresholds={THRESHOLDS}
      requests={[]}
      verifiedCarriers={30}
      categories={CATEGORIES}
      categoryWindowDays={90}
      {...over}
    />,
  );
}

describe('above the threshold', () => {
  const html = render();

  it('prints the real count for each category', () => {
    expect(html).toContain('>84<');
    expect(html).toContain('>12<');
    // Not rounded up to a friendlier number, and no „+".
    expect(html).toContain('>1<');
    expect(html).not.toContain('+');
  });

  it('links each one to the board already filtered by it', () => {
    expect(html).toContain('href="/cereri?categorie=autoturism"');
    expect(html).toContain('href="/cereri?categorie=motocicleta"');
    expect(html).toContain('href="/cereri?categorie=utilaj_agricol"');
  });

  it('says which window the numbers cover, in Romanian', () => {
    expect(html).toContain('Cereri publicate în ultimele 90 de zile.');
  });

  it('follows the window the team set rather than hardcoding ninety', () => {
    expect(render({ categoryWindowDays: 30 })).toContain('ultimele 30 de zile');
    expect(render({ categoryWindowDays: 7 })).toContain('ultimele 7 zile');
  });

  it('gives each link a name that reads as a sentence', () => {
    // „84" and „Autoturism" are two unrelated things to somebody who
    // cannot see that they are stacked.
    expect(html).toContain('aria-label="84 de cereri la categoria Autoturism"');
    expect(html).toContain('aria-label="o cerere la categoria Utilaj agricol"');
  });

  it('uses the Romanian labels, with diacritics', () => {
    expect(html).toContain('Motocicletă');
    // Comma-below, never the Turkish cedilla.
    expect(html).not.toMatch(/[şţŞŢ]/);
  });
});

describe('below it', () => {
  it('renders nothing at all rather than a grid of ones', () => {
    expect(render({ stats: { ...STATS, publishedTotal: 49 } })).toBe('');
  });

  it('renders nothing when no category has anything in it', () => {
    expect(render({ categories: [] })).toBe('');
  });

  it('renders nothing when there is no database to ask', () => {
    expect(render({ stats: null })).toBe('');
  });
});
