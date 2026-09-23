import { expect, test } from '@playwright/test';

/**
 * The last code-only Faza 1 items, from a browser with nothing behind it.
 *
 * The half that needs rows — a saved search that finds something, a
 * report that is closed and notified, a staff member granted and
 * revoked, the category counters above their threshold — is in
 * `faza-1-final-supabase.spec.ts`, which runs with `E2E_SUPABASE=1`.
 * Everything here works against a build with no database, which is what
 * makes it worth running on every commit.
 */

const MOBILE = { width: 390, height: 844 };

test.describe('saving a search is offered where somebody would want one', () => {
  test('on the board, beside the filters that would be saved', async ({ page }) => {
    await page.goto('/cereri');
    const aside = page.locator('aside');
    await expect(aside.getByRole('link', { name: 'Salvează căutarea' })).toBeVisible();
  });

  test('signed out it leads to sign-in, not to a form that cannot save', async ({ page }) => {
    await page.goto('/cereri');
    await page.locator('aside').getByRole('link', { name: 'Salvează căutarea' }).click();
    await expect(page).toHaveURL(/autentificare/);
  });

  test('in the empty state of the requests board', async ({ page }) => {
    // One level down now: an empty board is one sentence and one button,
    // and „anunță-mă" is under „Altceva de făcut de aici" rather than
    // beside it. Still there, still one click.
    await page.goto('/cereri');
    const main = page.locator('main');
    await main.getByText('Altceva de făcut de aici').click();
    await expect(main.getByRole('link', { name: 'Anunță-mă când apare ceva' })).toBeVisible();
  });

  test('in the empty state of the departures board, aimed at carriers', async ({ page }) => {
    await page.goto('/trasee');
    const main = page.locator('main');
    await main.getByText('Altceva de făcut de aici').click();
    await expect(main.getByRole('link', { name: 'Salvează căutarea de cereri' })).toBeVisible();
    // The alert a client wants is still there beside it, in its
    // signed-out wording.
    await expect(
      main.getByRole('button', { name: 'Intră în cont ca să primești anunțul' }),
    ).toBeVisible();
  });

  test('the account page redirects a visitor to sign in', async ({ page }) => {
    await page.goto('/cont/alerte');
    await expect(page).toHaveURL(/autentificare/);
  });
});

test.describe('the firm filter on the board', () => {
  test('is not offered to somebody with no firm', async ({ page }) => {
    await page.goto('/cereri');
    await expect(
      page.getByRole('checkbox', { name: /potrivite cu firma mea/ }),
    ).toHaveCount(0);
  });

  test('asking for it in the URL explains itself rather than filtering nothing', async ({
    page,
  }) => {
    await page.goto('/cereri?doar=firma');
    await expect(page.getByText(/are nevoie de un cont de firmă/)).toBeVisible();
  });
});

test.describe('the staff screens are not a 403', () => {
  // A 403 confirms the route exists and that there is something behind it
  // worth finding. Every one of these is a 404 for everybody else.
  for (const path of ['/admin/sesizari', '/admin/jurnal', '/admin/echipa']) {
    test(`${path} is a 404 for a visitor`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test('the CSV export is a 404 too, not a download', async ({ request }) => {
    // The route handler sits outside the admin layout, so it does not
    // inherit its guard — it checks staff itself. Asked through the API
    // rather than navigated to: a 404 from a route handler has no page
    // for the browser to load.
    const response = await request.get('/admin/jurnal/export');
    expect(response.status()).toBe(404);
  });
});

test.describe('the category counters', () => {
  test('are absent entirely below the threshold', async ({ page }) => {
    // Not zeroes, not sample cards: a grid of ones under a confident
    // heading reads as a site nobody uses.
    await page.goto('/');
    await expect(page.locator('#categorii')).toHaveCount(0);
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: MOBILE });

  for (const path of ['/cereri', '/trasee', '/']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('the save-search control is reachable on the requests board', async ({ page }) => {
    await page.goto('/cereri');
    const main = page.locator('main');
    await main.getByText('Altceva de făcut de aici').click();
    await expect(main.getByRole('link', { name: 'Anunță-mă când apare ceva' })).toBeVisible();
  });
});

test.describe('the Romanian is Romanian', () => {
  for (const path of ['/cereri', '/trasee']) {
    test(`${path} uses comma-below, never the Turkish cedilla`, async ({ page }) => {
      await page.goto(path);
      const text = (await page.locator('body').innerText()) ?? '';
      expect(text).not.toMatch(/[şţŞŢ]/);
    });
  }
});

test.describe('nothing shouts in the console', () => {
  for (const path of ['/', '/cereri', '/trasee']) {
    test(`${path} renders without an error or a hydration warning`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(message.text());
      });
      page.on('pageerror', (error) => problems.push(error.message));

      await page.goto(path);
      await page.waitForLoadState('networkidle');

      // A failed fetch to a Supabase that is not configured is not a bug
      // in this page; anything else is.
      const real = problems.filter(
        (text) => !/supabase|Failed to load resource|net::ERR/i.test(text),
      );
      expect(real).toEqual([]);
    });
  }
});
