import { expect, test } from '@playwright/test';
import { openMoreFilters as openFilters, settled } from './settled';

/**
 * Radius and weight, on both boards, without a database.
 *
 * What is checked here is the part that works with nothing behind it:
 * the controls exist, submitting them puts the criteria in the URL, a
 * shared link puts them back on the form, and clearing takes all of
 * them away. Whether the rows returned are actually inside the circle
 * is a database question, and `supabase/tests/rls_test.sql` answers it
 * — from both sides, including a listing whose town has no coordinates.
 *
 * All of these live under „Mai multe filtre" now. A radius is what
 * somebody reaches for deliberately, and three questions on screen was
 * the whole point of that change; what must not change is that they
 * still work and still write the same keys.
 */

const MOBILE = { width: 390, height: 844 };

test.describe('the request board', () => {
  test('offers a locality, a radius and a maximum weight', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await openFilters(page);
    await expect(page.getByLabel('Lângă localitatea')).toBeVisible();
    await expect(page.getByLabel('Pe o rază de')).toBeVisible();
    await expect(page.getByLabel('Greutate maximă (kg)')).toBeVisible();
  });

  test('says what the radius is measured between', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await openFilters(page);
    await expect(page.getByText(/Distanța în linie dreaptă între localități/)).toBeVisible();
  });

  test('says that requests with no weight stay in the list', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await openFilters(page);
    await expect(page.getByText(/Cererile fără greutate trecută rămân în listă/)).toBeVisible();
  });

  test('puts both criteria in the URL, so the search can be shared', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await openFilters(page);
    await page.getByLabel('Lângă localitatea').selectOption('Cluj-Napoca|RO');
    await page.getByLabel('Pe o rază de').selectOption('100');
    await page.getByLabel('Greutate maximă (kg)').fill('2400');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/langa=Cluj-Napoca%7CRO/);
    await expect(page).toHaveURL(/raza=100/);
    await expect(page).toHaveURL(/greutate=2400/);
  });

  test('a shared link comes back with the form already filled in', async ({ page }) => {
    await page.goto('/cereri?langa=Cluj-Napoca%7CRO&raza=200&greutate=1800');
    await settled(page);
    await expect(page.getByLabel('Lângă localitatea')).toHaveValue('Cluj-Napoca|RO');
    await expect(page.getByLabel('Pe o rază de')).toHaveValue('200');
    await expect(page.getByLabel('Greutate maximă (kg)')).toHaveValue('1800');
  });

  test('„șterge filtrele" takes the radius and the weight with it', async ({ page }) => {
    await page.goto('/cereri?langa=Cluj-Napoca%7CRO&raza=200&greutate=1800');
    await settled(page);
    await page.getByRole('link', { name: 'Șterge filtrele' }).click();
    await expect(page).not.toHaveURL(/langa=/);
    await expect(page).not.toHaveURL(/raza=/);
    await expect(page).not.toHaveURL(/greutate=/);
  });

  // A radius with nothing to measure from cannot be applied, so it is
  // dropped rather than carried around doing nothing.
  test('a radius with no locality does not survive the round trip', async ({ page }) => {
    await page.goto('/cereri?raza=100');
    await settled(page);
    await expect(page.getByLabel('Lângă localitatea')).toHaveValue('');
  });
});

test.describe('the departures board', () => {
  test('offers a locality, a radius and a minimum free capacity', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await openFilters(page);
    await expect(page.getByLabel('Pleacă de lângă')).toBeVisible();
    await expect(page.getByLabel('Pe o rază de')).toBeVisible();
    await expect(page.getByLabel('Capacitate liberă, minimum (kg)')).toBeVisible();
  });

  test('puts all three in the URL', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await openFilters(page);
    await page.getByLabel('Pleacă de lângă').selectOption('Timișoara|RO');
    await page.getByLabel('Pe o rază de').selectOption('25');
    await page.getByLabel('Capacitate liberă, minimum (kg)').fill('3500');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/langa=Timi/);
    await expect(page).toHaveURL(/raza=25/);
    await expect(page).toHaveURL(/capacitate=3500/);
  });

  test('a shared link comes back with the form already filled in', async ({ page }) => {
    await page.goto('/trasee?langa=Timi%C8%99oara%7CRO&raza=100&capacitate=7000');
    await settled(page);
    await expect(page.getByLabel('Pleacă de lângă')).toHaveValue('Timișoara|RO');
    await expect(page.getByLabel('Pe o rază de')).toHaveValue('100');
    await expect(page.getByLabel('Capacitate liberă, minimum (kg)')).toHaveValue('7000');
  });

  /**
   * „Șterge filtrele" used to list the fields it knew by hand, and had
   * already forgotten `scope`. It builds from the empty filters now, so
   * this checks the one it forgot as well as the three new ones.
   */
  test('„șterge filtrele" takes every filter, including the one it used to forget', async ({
    page,
  }) => {
    await page.goto(
      '/trasee?langa=Timi%C8%99oara%7CRO&raza=100&capacitate=7000&acoperire=intern&locuri=2',
    );
    await page.getByRole('link', { name: 'Șterge filtrele' }).click();
    for (const key of ['langa', 'raza', 'capacitate', 'acoperire', 'locuri']) {
      await expect(page).not.toHaveURL(new RegExp(`${key}=`));
    }
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: MOBILE });

  for (const path of ['/cereri', '/trasee']) {
    test(`${path} fits 390px with no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`${path} keeps the radius reachable on a phone`, async ({ page }) => {
      // One tap, and it is on screen — which is the deal: hidden, not
      // removed, and hidden behind something a thumb can hit.
      await page.goto(path);
      await settled(page);
      await expect(page.getByLabel('Pe o rază de')).toBeHidden();
      await openFilters(page);
      await expect(page.getByLabel('Pe o rază de')).toBeVisible();
    });
  }
});
