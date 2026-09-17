import { expect, test } from '@playwright/test';

/**
 * The prices page as it behaves on a checkout with no database: nothing is
 * published, so nothing is shown.
 *
 * That is not a degraded case to work around — it is the state the page
 * ships in, and the one that matters most. An unpublished table must not
 * leak a figure, and the visitor must still be given something to do.
 *
 * The published table, the calculator and the staff screen need a real
 * Supabase; they live in `preturi-supabase.spec.ts`.
 */

test.describe('prices, unpublished', () => {
  test('opens with one heading and says the prices are coming', async ({ page }) => {
    await page.goto('/preturi');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByText('Prețurile orientative vor fi publicate în curând.')).toBeVisible();
  });

  test('shows no figure at all', async ({ page }) => {
    await page.goto('/preturi');
    const body = await page.locator('main, body').first().innerText();
    // No rate, no minimum, no currency: the table is not published.
    expect(body).not.toMatch(/\d[\d.,]*\s*(lei|€)/i);
  });

  test('hides the calculator rather than running it on unapproved rates', async ({ page }) => {
    await page.goto('/preturi');
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(page.getByLabel('De unde')).toHaveCount(0);
  });

  test('still offers a way to get a price', async ({ page }) => {
    await page.goto('/preturi');
    await page.getByRole('link', { name: 'Publică o cerere' }).first().click();
    await expect(page).toHaveURL(/\/cerere\/noua/);
  });

  test('answers the three price questions whether or not the table is up', async ({ page }) => {
    await page.goto('/preturi');
    await expect(page.getByRole('heading', { name: 'Întrebări despre preț' })).toBeVisible();
    await expect(page.locator('dt')).toHaveCount(3);
  });

  test('is reachable from the footer on every screen', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Prețuri orientative' }).click();
    await expect(page).toHaveURL(/\/preturi$/);
  });

  test('is in the header nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header a[href="/preturi"]')).toHaveCount(1);
  });

  test('the homepage band points here instead of printing a rate', async ({ page }) => {
    await page.goto('/');
    const band = page.locator('#tarife');
    await expect(band).toBeVisible();
    await expect(band.getByRole('link')).toHaveAttribute('href', '/preturi');
    expect(await band.innerText()).not.toMatch(/\d[\d.,]*\s*(lei|€)/i);
  });

  test('does not scroll sideways', async ({ page }) => {
    await page.goto('/preturi');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('is kept out of search results while the figures are provisional', async ({ page }) => {
    await page.goto('/preturi');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});

/**
 * The handoff to the request form, which works without a database because
 * everything it carries is in the URL.
 */
test.describe('arriving at the request form from the calculator', () => {
  const LINK =
    '/cerere/noua?plecare=M%C3%BCnchen%7CDE&sosire=Cluj-Napoca%7CRO&categorie=suv&porneste=nu&serviciu=expres';

  test('keeps every choice', async ({ page }) => {
    await page.goto(LINK);
    const card = page.getByText('Datele din calculator').locator('..');
    await expect(card).toContainText('München');
    await expect(card).toContainText('Cluj-Napoca');
    await expect(card).toContainText('SUV');
    await expect(card).toContainText('nu pornește');
    await expect(card).toContainText('Expres');
  });

  test('drops a city it does not know rather than echoing it back', async ({ page }) => {
    await page.goto('/cerere/noua?plecare=Atlantida%7CXX&categorie=suv');
    await expect(page.getByText('Datele din calculator')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Atlantida');
  });

  test('says nothing when nobody came from the calculator', async ({ page }) => {
    await page.goto('/cerere/noua');
    await expect(page.getByText('Datele din calculator')).toHaveCount(0);
  });
});
