import { expect, test } from '@playwright/test';

/**
 * „N transportatori verificați circulă pe această rută".
 *
 * Without a database there are no carriers to count, so what is checked
 * here is the one thing a count must never do: appear when nobody asked,
 * or appear to somebody who is not entitled to it. The arithmetic is in
 * `tests/unit/carrier-count.test.ts` and the access rule is in the MAT
 * block of `supabase/tests/rls_test.sql`.
 */

const FUTURE = '2030-06-01';

/** Fills step 1 and walks to the last step of the form. */
async function toLastStep(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/cerere/noua');
  await page.getByLabel('Oraș de plecare').fill('München');
  await page.getByLabel('Țara de plecare').selectOption('DE');
  await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
  await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
  await page.getByRole('button', { name: 'Continuă' }).click();

  await page.getByLabel('Marca').fill('Volkswagen');
  await page.getByLabel('Modelul').fill('Golf');
  await page.getByLabel('Anul fabricației').fill('2018');
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByRole('button', { name: 'Continuă' }).click();
}

test.describe('the preview in the last step', () => {
  test('is not offered to somebody with no session', async ({ page }) => {
    // There is nothing for the database to count the call against, and a
    // button that always fails is worse than no button.
    await toLastStep(page);
    await expect(page.getByRole('heading', { name: 'Unde te găsim?' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Vezi câți transportatori/ }),
    ).toHaveCount(0);
  });

  test('and neither is the number itself', async ({ page }) => {
    await toLastStep(page);
    await expect(page.getByText(/circulă pe această rută/)).toHaveCount(0);
  });
});

test.describe('the public board never counts for a stranger', () => {
  test('the sentence is nowhere on the board', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByText(/circulă pe această rută/)).toHaveCount(0);
  });

  test('nor on the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/circulă pe această rută/)).toHaveCount(0);
  });
});
