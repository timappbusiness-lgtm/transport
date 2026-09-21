import { expect, test } from '@playwright/test';

/**
 * The order lifecycle, from a browser with nothing behind it.
 *
 * Everything that needs three accounts and a car on a lorry is in
 * `faza-2-comanda-supabase.spec.ts`, which runs with `E2E_SUPABASE=1`.
 * What is here works against a build with no database, which is what
 * makes it worth running on every commit: the doors are shut, the pages
 * exist, and nothing overflows at 390px.
 */

const MOBILE = { width: 390, height: 844 };
const ORDER = '00000000-0000-0000-0000-000000000001';

test.describe('the order screens are behind a session', () => {
  for (const path of [
    '/cont/transporturi',
    '/cont/transporturi?cutie=finalizate',
    '/cont/transporturi?cutie=anulate',
    `/cont/transporturi/${ORDER}`,
  ]) {
    test(`${path} sends a visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/autentificare/);
    });
  }

  test('and carries the destination back', async ({ page }) => {
    await page.goto('/cont/transporturi');
    await expect(page).toHaveURL(/next=%2Fcont%2Ftransporturi/);
  });
});

test.describe('the staff screens are not there for anybody else', () => {
  // A 404 rather than a 403: a 403 confirms the route exists and that
  // there is something behind it worth finding.
  for (const path of ['/admin/transporturi', `/admin/transporturi/${ORDER}`]) {
    test(`${path} is a 404 for a visitor`, async ({ page, request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      await page.goto(path);
      await expect(page.getByText(/404|nu există|Pagina/i).first()).toBeVisible();
    });
  }
});

test.describe('nothing leaks into the public pages', () => {
  test('the board says nothing about orders', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi comanda' })).toHaveCount(0);
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: MOBILE });

  for (const path of ['/cereri', '/preturi', '/abonamente']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('the sign-in page a driver lands on fits', async ({ page }) => {
    // A driver's whole route into the application: a link in an e-mail,
    // a sign-in, and the order. The first step has to work one-handed.
    await page.goto(`/cont/transporturi/${ORDER}`);
    await expect(page).toHaveURL(/autentificare/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('nothing in the console', () => {
  test('the board loads clean', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/cereri');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
