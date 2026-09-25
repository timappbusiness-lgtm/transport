import { expect, test, type Page } from '@playwright/test';
import { settled } from './settled';

/**
 * The visual contract, checked on every screen that renders without a
 * database.
 *
 * Not pixel comparison — a screenshot baseline for a site still being
 * built fails on every legitimate change and teaches people to accept
 * the diff without looking. These are the properties that must hold
 * whatever the content is, and each one of them has been broken at least
 * once: a page that scrolls sideways on a phone, a second `<h1>`, a
 * focus ring that changed colour when a palette moved, a demonstration
 * card that lost the badge saying it is a demonstration.
 */

/**
 * Public screens only. `/cont/*` and `/admin/*` need a session, and
 * `/preturi`, `/firme` and `/transport-auto` render their empty state
 * without Supabase — their headings and chrome are still checked, which
 * is what this file is about.
 */
const SCREENS = [
  '/',
  '/cereri',
  '/trasee',
  '/preturi',
  '/firme',
  '/cerere/noua',
  '/abonamente',
  '/intrebari-frecvente',
] as const;

/** The token, as the stylesheet defines it. */
const ACCENT = 'rgb(21, 97, 109)';
const INK = 'rgb(28, 38, 43)';

async function pageSurface(page: Page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    h1: document.querySelectorAll('h1').length,
  }));
}

for (const [width, height, label] of [
  [1440, 900, '1440'],
  [390, 844, '390'],
] as const) {
  test.describe(`at ${label}px`, () => {
    test.use({ viewport: { width, height } });

    for (const path of SCREENS) {
      test(`${path} sits inside its viewport and has one h1`, async ({ page }) => {
        await page.goto(path);
        await settled(page);
        const { overflow, h1 } = await pageSurface(page);
        expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
        expect(h1, `${path} has ${h1} <h1> elements`).toBe(1);
      });
    }
  });
}

test.describe('the type scale reaches the page', () => {
  test('the hero headline is display size, not body size', async ({ page }) => {
    // It rendered at 15px once, because `cn` merged `text-display` away
    // against `text-white`. The unit test covers the merge; this covers
    // the thing the merge exists to produce.
    await page.goto('/');
    const h1 = page.locator('h1').first();
    const size = await h1.evaluate((n) => Number.parseFloat(getComputedStyle(n).fontSize));
    const weight = await h1.evaluate((n) => getComputedStyle(n).fontWeight);
    const body = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).fontSize),
    );
    // A ratio rather than a pixel count, because the display step is a
    // clamp: 64px at 1440 and 36px at 390 are both correct, and a fixed
    // floor would only be testing the viewport.
    expect(size / body, `hero h1 is ${size}px against ${body}px body`).toBeGreaterThanOrEqual(2.2);
    expect(weight).toBe('600');
  });

  test('and every heading on the homepage is heavier than body text', async ({ page }) => {
    await page.goto('/');
    const weights = await page
      .locator('h1, h2')
      .evaluateAll((ns) => ns.map((n) => Number(getComputedStyle(n).fontWeight)));
    expect(weights.length).toBeGreaterThan(3);
    for (const w of weights) expect(w).toBeGreaterThanOrEqual(500);
  });
});

test.describe('the accent is spent where it should be', () => {
  test('on the primary button', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    // The board's one decision: on an empty board, publishing a request.
    const primary = page.locator('main').getByRole('link', { name: 'Publică o cerere' }).last();
    await expect(primary).toBeVisible();
    expect(await primary.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe(ACCENT);

    // The filter's button is a tool, not the decision: filled in ink. Both
    // in the accent, 260px apart, read as two things to choose between.
    const search = page.getByRole('button', { name: /caută/i }).first();
    await expect(search).toBeVisible();
    expect(await search.evaluate((n) => getComputedStyle(n).backgroundColor)).not.toBe(ACCENT);
  });

  test('and on the section eyebrows', async ({ page }) => {
    await page.goto('/');
    const colours = await page
      .locator('main span.rounded-pill')
      .evaluateAll((ns) => ns.map((n) => getComputedStyle(n).color));
    expect(colours.length, 'no eyebrow pills found at all').toBeGreaterThan(0);
    expect(colours.some((c) => c === ACCENT), 'no eyebrow carries the accent').toBe(true);
  });

  test('but never on a legal page', async ({ page }) => {
    for (const path of ['/termeni', '/confidentialitate', '/cookies']) {
      await page.goto(path);
      await settled(page);
      const used = await page
        .locator('main *')
        .evaluateAll((ns, accent) => ns.some((n) => {
          const cs = getComputedStyle(n);
          return cs.color === accent || cs.backgroundColor === accent;
        }), ACCENT);
      expect(used, `${path} uses the accent`).toBe(false);
    }
  });
});

test.describe('the focus ring is unchanged', () => {
  test('ink on a light ground', async ({ page }) => {
    // The palette moved; this did not. A focus indicator that changes
    // with a repaint is one somebody has to re-learn.
    await page.goto('/cereri');
    await settled(page);
    const link = page.locator('main a').first();
    await link.focus();
    const ring = await link.evaluate((n) => {
      const cs = getComputedStyle(n);
      return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle };
    });
    expect(ring.color).toBe(INK);
    expect(ring.width).toBe('2px');
    expect(ring.style).toBe('solid');
  });

  test('and the bright accent on the dark sections', async ({ page }) => {
    // White on the dark ground was 11:1 but also the colour of every
    // label there; the bright step is 6.1:1 on the bar and 8.8:1 on the
    // darkest ground, and reads as the focus rather than as text.
    await page.goto('/');
    const link = page.locator('[data-surface="dark"] a:visible').first();
    // The header's session half streams in behind a signed-out fallback
    // and React swaps one for the other a moment after `load`, identical
    // or not — so a focus given before the swap lands on a node that is
    // then removed, and its computed style reads empty. Focus and read
    // again until the header is the final one, as a person tabbing in
    // would. (The swap itself is reported in PR #67; it predates it.)
    await expect(async () => {
      await link.focus();
      expect(await link.evaluate((n) => getComputedStyle(n).outlineColor)).toBe('rgb(79, 209, 216)');
    }).toPass();
  });
});

test.describe('demonstration content stays labelled', () => {
  test('every sample card on the homepage still says Exemplu', async ({ page }) => {
    // A legal requirement, not decoration. The illustrations around
    // these badges were redrawn; the badges were not touched, and this
    // is what says so.
    await page.goto('/');
    const badges = page.getByText('Exemplu', { exact: true });
    const count = await badges.count();
    expect(count, 'no Exemplu badge on the homepage').toBeGreaterThanOrEqual(4);
  });

  test('and no sample figure is presented as a real number', async ({ page }) => {
    await page.goto('/');
    // Each demonstration card carries its badge inside the same card as
    // the figures it shows.
    const cards = page.locator('section#cum-functioneaza [class*="rounded-card"]');
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < Math.min(n, 3); i += 1) {
      await expect(cards.nth(i).getByText('Exemplu', { exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('the illustrations carry a name', () => {
  test('the hero scene and the corridor are labelled', async ({ page }) => {
    await page.goto('/');
    // Both are `role="img"` with a label, so a screen reader is told
    // what the drawing shows rather than skipping it.
    const labelled = await page.locator('[role="img"][aria-label]').count();
    expect(labelled, 'no labelled illustration on the homepage').toBeGreaterThanOrEqual(2);
  });

  test('and the seat deck says how many seats are free', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[aria-label*="locuri libere"]').first()).toBeAttached();
  });
});
