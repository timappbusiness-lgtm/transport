import { expect, test } from '@playwright/test';

/**
 * The activity section with requests in it.
 *
 * Skipped unless E2E_SUPABASE=1, so a run without a database reports
 * honestly instead of going green on a section that rendered its empty
 * state:
 *
 *   supabase start
 *   pnpm seed:requests          # 8 live and 54 delivered demo requests
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * The seed writes enough to clear both default thresholds (50 published, 6
 * live). Every row it writes carries "DEMO" in a column that is not public,
 * which is also what the seed script's guard looks for.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * What each one asserts about the data itself is covered without a browser
 * in `supabase/tests/rls_test.sql` and `tests/unit/request-card.test.tsx`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied and pnpm seed:requests run.');
});

test.describe('the populated feed', () => {
  test('shows six of the newest requests', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 640, 'A phone shows four; that is its own test.');
    await page.goto('/');
    await expect(page.locator('#cereri a[href^="/cereri/"]')).toHaveCount(6);
  });

  test('every card links to its own request', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('#cereri a[href^="/cereri/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      // /cereri/<uuid>, never /cereri on its own.
      expect(href).toMatch(/^\/cereri\/[0-9a-f-]{36}$/);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test('a card carries a route, a distance and a condition', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#cereri a[href^="/cereri/"]').first();
    await expect(card).toContainText('→');
    await expect(card).toContainText(/~[\d.]+ km/);
    await expect(card).toContainText(/Pornește|Nu pornește/);
    await expect(card).toContainText(/acum |chiar acum/);
  });

  test('nothing private reaches the page', async ({ page }) => {
    await page.goto('/');
    const body = await page.locator('body').innerText();
    // The seed writes this into `description`, which is not in the view.
    expect(body).not.toContain('rând demonstrativ');
    expect(body).not.toMatch(/07\d{2}\s?\d{3}\s?\d{3}/);
    // Nor the internal marker the seed puts in the title.
    expect(body).not.toContain('DEMO');
  });

  test('offers the whole board', async ({ page }) => {
    await page.goto('/');
    await page.locator('#cereri').getByRole('link', { name: 'Vezi toate cererile' }).click();
    await expect(page).toHaveURL(/\/cereri$/);
  });

  test('shows four cards on a phone, and no sideways scroll', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) > 640, 'The four-card layout is the phone one.');
    await page.goto('/');
    const visible = await page
      .locator('#cereri a[href^="/cereri/"]')
      .evaluateAll((as) => as.filter((a) => (a as HTMLElement).offsetParent !== null).length);
    expect(visible).toBe(4);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('the statistics', () => {
  test('draws the thirty-day sparkline, with a label', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'Cereri publicate în ultimele 30 de zile' }),
    ).toBeVisible();
  });

  test('says how many kilometres, and where the figure comes from', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    await expect(section.getByText(/[\d.]+ km de transport solicitat/)).toBeVisible();
    await expect(
      section.getByText('Distanțe estimate, însumate din cererile publicate'),
    ).toBeVisible();
  });

  test('counts the last seven days with a Romanian plural', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.locator('#cereri').getByText(/(o cerere|\d+ (de )?cereri) în ultimele 7 zile/),
    ).toBeVisible();
  });
});
