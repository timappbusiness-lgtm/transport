import { expect, test, type Page } from '@playwright/test';
import { settled } from './settled';

/**
 * That the icons are on the served page.
 *
 * The previous check for this was in `categorii-localitati.spec.ts` and
 * read, in full:
 *
 *   const unlabelled = await page.locator('main svg:not([aria-hidden])').count();
 *   const named = await page.locator('main svg[aria-label]').count();
 *   expect(unlabelled).toBe(named);
 *
 * On a board with no icons at all that is `0 === 0`, and it passed every
 * time while `/cereri` served its whole filter panel with not one glyph
 * in it. A check that cannot fail is worse than no check, because it
 * occupies the place where the real one would go.
 *
 * So these count upwards, per screen, against a number written down. The
 * numbers are floors and deliberately low — the point is „this screen
 * lost its icons", not „somebody added a third one".
 */

/** `main` only: the header and footer are chrome and have their own check. */
const IN_MAIN = 'main svg.lucide';

async function iconsIn(page: Page, selector = IN_MAIN): Promise<number> {
  await settled(page);
  return page.locator(selector).count();
}

test.describe('every screen that should have icons has them', () => {
  /**
   * Screens reachable without a database, with the least each must draw.
   *
   * The account and admin areas need a session and are covered by
   * `tests/unit/navigation.test.ts`, which walks every item the builders
   * can produce and fails on one without an icon — a stronger check than
   * a browser could make, and one that does not need a login.
   */
  const SCREENS: [path: string, least: number, what: string][] = [
    ['/', 8, 'the section eyebrows'],
    ['/cereri', 2, 'the filter heading and the search button'],
    ['/trasee', 1, 'the search button'],
    ['/abonamente', 3, 'the accordion'],
    ['/intrebari-frecvente', 6, 'the accordion chevrons'],
    ['/cerere/noua', 2, 'the two locality fields'],
    ['/inregistrare', 2, 'the two kinds of account'],
  ];

  /*
   * `/preturi`, `/firme` and `/transport-auto` are not in that list, and
   * the reason matters: every icon on them belongs to a row that comes
   * out of the database — a price class, a company, a landing page. CI
   * runs this suite with no Supabase, so those three render their empty
   * state, and a floor above zero would fail for a reason that has
   * nothing to do with icons.
   *
   * They are not unchecked. `VEHICLE_CLASS_ICONS` is walked by
   * `tests/unit/icons.test.ts` through `ICON_MAPS`, and the components
   * that draw those rows go through `Icon` like everything else — which
   * `tests/unit/icon-coverage.test.tsx` enforces on the import.
   */

  for (const [path, least, what] of SCREENS) {
    test(`${path} draws at least ${least} (${what})`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      const found = await iconsIn(page);
      expect(found, `${path} drew ${found} icons in <main>, expected ${least}+`).toBeGreaterThanOrEqual(
        least,
      );
    });
  }
});

test.describe('and they are large enough to see', () => {
  test('nothing is drawn below the smallest size in the scale', async ({ page }) => {
    await page.goto('/');
    // Drawn ones only: the „Meniu" icon is in the document at every
    // width and on screen only below lg.
    const widths = await page.locator('svg.lucide').evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().width)).filter((w) => w > 0),
    );
    expect(widths.length, 'no lucide icon on the homepage at all').toBeGreaterThan(0);
    for (const width of widths) {
      // `ICON_SIZES.sm` is 15. Anything under it is something drawing a
      // glyph outside the system.
      expect(width, `an icon ${width}px wide`).toBeGreaterThanOrEqual(15);
    }
  });

  test('and every one of them keeps the single stroke width', async ({ page }) => {
    await page.goto('/');
    const strokes = await page.locator('svg.lucide').evaluateAll((nodes) =>
      [...new Set(nodes.map((n) => n.getAttribute('stroke-width')))],
    );
    expect(strokes, 'more than one stroke width on the page').toEqual(['2']);
  });
});

test.describe('the filter panel and the board card', () => {
  test('the filters carry an icon on the heading and the button', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    // Named rather than counted: these two are the „filter" case the
    // brief asked to be guarded, and a count would not say which went.
    await expect(page.locator('aside svg.lucide').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /caută|filtrează|aplică/i }).locator('svg.lucide').first(),
    ).toBeVisible();
  });
});

test.describe('where an icon must never appear', () => {
  test('the legal pages have none at all', async ({ page }) => {
    for (const path of ['/termeni', '/confidentialitate', '/cookies']) {
      await page.goto(path);
      await settled(page);
      expect(await page.locator('main svg').count(), path).toBe(0);
    }
  });

  test('and no emoji anywhere on a board', async ({ page }) => {
    for (const path of ['/cereri', '/trasee', '/']) {
      await page.goto(path);
      await settled(page);
      const text = (await page.locator('main').innerText()) ?? '';
      expect(text, path).not.toMatch(
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u,
      );
    }
  });

  test('and every icon is either hidden or named', async ({ page }) => {
    // The rule the old check meant to make: an icon is decoration beside
    // a visible label, or it carries the meaning and has an accessible
    // name. Never a third thing. Unlike the old one this can fail —
    // there are icons on the page now for it to fail on.
    await page.goto('/cereri');
    await settled(page);
    const total = await page.locator('main svg.lucide').count();
    expect(total, 'no icons to check').toBeGreaterThan(0);
    const accounted = await page
      .locator('main svg.lucide[aria-hidden="true"], main svg.lucide[aria-label]')
      .count();
    expect(accounted, 'an icon that is neither hidden nor named').toBe(total);
  });
});
