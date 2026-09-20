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

  test('is out of the header nav while the table is unpublished', async ({ page }) => {
    // Decided 20 September 2026: a menu item that leads to „nothing to
    // see yet" teaches people not to trust the menu. It goes back the
    // moment the team publishes the table — see docs/configurare-externa.md
    // §7, and the comment on PAGES in header-menu.tsx.
    await page.goto('/');
    await expect(page.locator('header a[href="/preturi"]')).toHaveCount(0);
  });

  test('but is still reachable by link', async ({ page }) => {
    await page.goto('/preturi');
    await expect(page).toHaveURL(/\/preturi$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
 * everything it carries is in the URL. The form used to be a placeholder
 * echoing the choices back in a card; now it is the form, so the check is
 * that each choice lands in the field it belongs to.
 */
test.describe('arriving at the request form from the calculator', () => {
  const LINK =
    '/cerere/noua?plecare=M%C3%BCnchen%7CDE&sosire=Cluj-Napoca%7CRO&categorie=suv&porneste=nu&serviciu=expres';

  test('keeps every choice', async ({ page }) => {
    await page.goto(LINK);

    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('München');
    await expect(page.getByLabel('Țara de plecare')).toHaveValue('DE');
    await expect(page.getByLabel('Oraș de destinație')).toHaveValue('Cluj-Napoca');
    await expect(page.getByLabel('Țara de destinație')).toHaveValue('RO');

    // The calculator does not ask for dates, so the route step needs one
    // before it will let go.
    await page.getByLabel('Poate fi încărcat de la').fill('2030-06-01');
    await page.getByRole('button', { name: 'Continuă' }).click();

    // SUV is a pricing class; the board files it under autoturism.
    await expect(page.getByLabel('Categoria')).toHaveValue('autoturism');
    await page.getByLabel('Marca').fill('Volkswagen');
    await page.getByLabel('Modelul').fill('Touareg');
    await page.getByLabel('Anul fabricației').fill('2018');
    await page.getByRole('button', { name: 'Continuă' }).click();

    // "Nu pornește" in the calculator has to mean the same three things
    // here, or the carrier is told the opposite of what was priced.
    await expect(page.getByLabel('Pornește și se deplasează')).not.toBeChecked();
    await expect(page.getByLabel('Roțile se învârt')).not.toBeChecked();
    await expect(page.getByLabel('Direcția funcționează')).not.toBeChecked();
    await expect(page.getByText('Transportatorul vine pregătit cu troliu.')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Expres' })).toBeChecked();
  });

  test('drops a city it does not know rather than echoing it back', async ({ page }) => {
    await page.goto('/cerere/noua?plecare=Atlantida%7CXX&categorie=suv');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('Atlantida');
  });

  test('starts empty when nobody came from the calculator', async ({ page }) => {
    await page.goto('/cerere/noua');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('');
    await expect(page.getByLabel('Oraș de destinație')).toHaveValue('');
  });
});
