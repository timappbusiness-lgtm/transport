import { expect, test } from '@playwright/test';

/**
 * The activity section on a platform with nothing on it yet.
 *
 * That is not an edge case to work around — it is the state the section
 * ships in, and the one where it would be easiest to lie. What these check
 * is that it does not: no counter, no sparkline, no sample cards, and a
 * sentence that says the first requests will appear here.
 *
 * The populated grid needs a database with seeded requests; those tests are
 * in `cereri-acasa-supabase.spec.ts`.
 */

test.describe('the activity section, with nothing published', () => {
  test('introduces itself', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    await expect(section).toBeVisible();
    await expect(section).toContainText('Activitate pe platformă');
    await expect(section.getByRole('heading', { name: /Cereri noi/ })).toBeVisible();
  });

  test('says the first requests will appear here', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    await expect(
      section.getByText('Primele cereri apar aici imediat ce sunt publicate.'),
    ).toBeVisible();
  });

  test('offers both ways forward', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    // Exact: the card below also has a "Publică o cerere gratuit".
    await expect(
      section.getByRole('link', { name: 'Publică o cerere', exact: true }),
    ).toBeVisible();
    await expect(section.getByRole('link', { name: 'Trasee disponibile' })).toBeVisible();
  });

  test('shows no statistics and no sparkline', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    await expect(
      section.getByRole('img', { name: 'Cereri publicate în ultimele 30 de zile' }),
    ).toHaveCount(0);
    await expect(section.getByText(/km de transport solicitat/)).toHaveCount(0);
    await expect(section.getByText(/în ultimele 7 zile/)).toHaveCount(0);
  });

  test('shows no sample cards', async ({ page }) => {
    await page.goto('/');
    // A demonstration grid on the homepage of an exchange is indistinguishable
    // from a claim that the exchange is busy.
    await expect(page.locator('#cereri a[href^="/cereri/"]')).toHaveCount(0);
  });

  test('does not link to the board it is not showing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#cereri').getByRole('link', { name: 'Vezi toate cererile' })).toHaveCount(0);
  });
});

test.describe('the free posting card', () => {
  test('explains the three steps, in order', async ({ page }) => {
    await page.goto('/');
    const steps = page.locator('#cereri ol li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('Completezi traseul');
    await expect(steps.nth(1)).toContainText('Transportatorii verificați');
    await expect(steps.nth(2)).toContainText('Datele tale de contact rămân ascunse');
  });

  test('promises no e-mail alert, because nothing sends one yet', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#cereri')).not.toContainText(/alert[ăa] pe e-mail/i);
  });

  test('leads to the form, and says what it costs', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#cereri');
    await expect(section).toContainText('Fără abonament pentru clienți');
    await section.getByRole('link', { name: 'Publică o cerere gratuit' }).click();
    await expect(page).toHaveURL(/\/cerere\/noua/);
  });
});

test.describe('the section on a phone', () => {
  test('does not push the page sideways', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the heading is a section heading, not a second h1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('#cereri h2')).toHaveCount(1);
  });
});
