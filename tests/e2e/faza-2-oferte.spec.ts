import { expect, test } from '@playwright/test';

/**
 * The offer flow, from a browser with nothing behind it.
 *
 * Everything that needs two accounts and a request — sending, asking a
 * question that gets masked, comparing, accepting, the contacts that
 * open afterwards — is in `faza-2-oferte-supabase.spec.ts`, which runs
 * with `E2E_SUPABASE=1`. What is here works against a build with no
 * database, which is what makes it worth running on every commit: the
 * doors are shut, the pages exist, and nothing overflows at 390px.
 */

const MOBILE = { width: 390, height: 844 };

test.describe('the offer screens are behind a session', () => {
  for (const path of [
    '/cont/oferte',
    '/cont/oferte?cutie=primite',
    '/cont/cereri/00000000-0000-0000-0000-000000000001',
    '/cont/transporturi/00000000-0000-0000-0000-000000000001',
  ]) {
    test(`${path} sends a visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/autentificare/);
    });
  }

  test('and brings them back to where they were going', async ({ page }) => {
    await page.goto('/cont/oferte');
    // The sign-in page carries the destination, so nobody lands on the
    // dashboard and has to find their way back.
    await expect(page).toHaveURL(/next=%2Fcont%2Foferte/);
  });
});

test.describe('the staff screens are not there for anybody else', () => {
  // A 404 rather than a 403: a 403 confirms the route exists and that
  // there is something behind it worth finding.
  for (const path of ['/admin/oferte', '/admin/oferte/00000000-0000-0000-0000-000000000001']) {
    test(`${path} is a 404 for a visitor`, async ({ page, request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      await page.goto(path);
      await expect(page.getByText(/404|nu există|Pagina/i).first()).toBeVisible();
    });
  }
});

test.describe('the board still reads without a session', () => {
  test('a visitor is invited to sign in rather than shown a form they cannot send', async ({
    page,
  }) => {
    await page.goto('/cereri');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // With no database there are no rows to open, so the check is that
    // the board itself is intact and offers nothing that would 404.
    await expect(page.getByRole('link', { name: 'Trimite ofertă' })).toHaveCount(0);
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: MOBILE });

  for (const path of ['/cereri', '/abonamente']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
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
