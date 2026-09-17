import { expect, test } from '@playwright/test';

/**
 * The departures board, browsed the way a visitor with a car to move
 * browses it: signed out, on a phone, before there is any supply.
 *
 * Everything here runs without Supabase configured, which is how the board
 * behaves on an empty checkout: the page renders, the empty state does its
 * job, and — the part that matters — nothing about a carrier appears.
 */

test.describe('trasee, signed out', () => {
  test('the board opens and says it is a board', async ({ page }) => {
    await page.goto('/trasee');
    await expect(page.locator('h1')).toContainText('Trasee');
    await expect(page.getByRole('navigation', { name: 'Trasee' })).toBeVisible();
  });

  test('the homepage sends you here', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Trasee disponibile' }).first().click();
    await expect(page).toHaveURL(/\/trasee$/);
  });

  test('the three tabs are links that carry the direction in the URL', async ({ page }) => {
    await page.goto('/trasee');
    await page.getByRole('link', { name: 'Pe retur', exact: true }).click();
    await expect(page).toHaveURL(/directie=retur/);

    await page.getByRole('link', { name: 'Pe tur', exact: true }).click();
    await expect(page).toHaveURL(/directie=tur/);
  });

  test('filters land in the URL, so a search can be shared', async ({ page }) => {
    await page.goto('/trasee');
    await page.selectOption('#f-from-country', 'DE');
    await page.selectOption('#f-seats', '2');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/tara-plecare=DE/);
    await expect(page).toHaveURL(/locuri=2/);
  });

  test('a filtered tab keeps the tab when the filters change', async ({ page }) => {
    await page.goto('/trasee?directie=retur');
    await page.selectOption('#f-from-country', 'IT');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/directie=retur/);
    await expect(page).toHaveURL(/tara-plecare=IT/);
  });

  test('the empty state offers both ways forward', async ({ page }) => {
    await page.goto('/trasee?tara-plecare=PL&tara-sosire=SE');
    await expect(page.getByText('Încă nu sunt trasee publicate')).toBeVisible();
    const emptyState = page.getByText('Încă nu sunt trasee publicate').locator('..');
    await expect(emptyState.getByRole('link', { name: 'Publică o cerere' })).toBeVisible();
    // Signed out, the alert says it needs an account rather than pretending.
    await expect(page.getByRole('button', { name: /Intră în cont ca să primești/ })).toBeVisible();
  });

  test('an empty filtered board offers a way back to everything', async ({ page }) => {
    await page.goto('/trasee?tara-plecare=PL&tara-sosire=SE');
    await page.getByRole('link', { name: 'Vezi toate traseele' }).click();
    await expect(page).toHaveURL(/\/trasee$/);
  });

  test('a signed-out visitor is told where the carrier name went', async ({ page }) => {
    await page.goto('/trasee');
    await expect(page.getByText('Firma care transportă apare după autentificare')).toBeVisible();
  });

  test('no company, plate or phone leaks onto the board', async ({ page }) => {
    await page.goto('/trasee');
    const body = (await page.locator('body').innerText()).toLowerCase();
    // The board is built on v_departures_public, which carries none of
    // these columns; this is the belt to that braces.
    expect(body).not.toMatch(/\bs\.?r\.?l\.?\b/);
    expect(body).not.toMatch(/\+4\d{10}/);
    expect(body).not.toMatch(/\b[a-z]{1,2}\s?\d{2,3}\s?[a-z]{3}\b/);
  });

  test('junk in the query does not break the board', async ({ page }) => {
    const response = await page.goto(
      '/trasee?directie=%27%20or%201%3D1&tara-plecare=ROMANIA&locuri=999&de-la=nu-e-o-data',
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('Trasee');
  });

  test('the board works on a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/trasee');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('trasee, the carrier side', () => {
  for (const path of ['/cont/trasee', '/cont/trasee/nou']) {
    test(`${path} is closed to an anonymous visitor`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp('/autentificare\\?next='));
    });
  }
});
