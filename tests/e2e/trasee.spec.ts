import { expect, test } from '@playwright/test';
import { moreFilters, openMoreFilters as openFilters, settled } from './settled';

/**
 * Everything except „de unde", „unde" and „tip vehicul" lives one click
 * down now, under „Mai multe filtre". The keys did not change, so the
 * URL assertions below are the ones they always were.
 */

/**
 * The departures board, browsed the way a visitor with a car to move
 * browses it: signed out, on a phone, before there is any supply.
 *
 * Everything here runs without Supabase configured, which is how the board
 * behaves on an empty checkout: the page renders, the empty state does its
 * job, and — the part that matters — nothing about a carrier appears.
 */

test.describe('trasee, signed out', () => {
  test('the board opens and asks three questions', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await expect(page.locator('h1')).toContainText('Trasee');
    // The strip of direction tabs above the board became a filter among
    // the filters. What is on screen is the three a dispatcher answers
    // without thinking.
    for (const label of ['De unde', 'Unde', 'Tip vehicul']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
  });

  test('the homepage sends you here', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Trasee disponibile' }).first().click();
    await expect(page).toHaveURL(/\/trasee$/);
  });

  test('the direction is a filter, and still carries in the URL', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await openFilters(page);
    await page.selectOption('#f-tab', 'retur');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page).toHaveURL(/directie=retur/);

    await openFilters(page);
    await page.selectOption('#f-tab', 'tur');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page).toHaveURL(/directie=tur/);
  });

  test('filters land in the URL, so a search can be shared', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await openFilters(page);
    await page.selectOption('#f-from-country', 'DE');
    await page.selectOption('#f-seats', '2');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/tara-plecare=DE/);
    await expect(page).toHaveURL(/locuri=2/);
  });

  test('a filtered direction survives the next search', async ({ page }) => {
    // The link carries something from inside the panel, and the panel
    // stays shut — its chip says so. A search from the three main fields
    // keeps it anyway: the closed panel hides its fields, it does not
    // drop them from the form.
    await page.goto('/trasee?directie=retur');
    await settled(page);
    await expect(moreFilters(page).panel).toBeHidden();
    await expect(page.locator('[data-chip="tab"]')).toBeVisible();
    await page.getByLabel('Tip vehicul', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/vehicul=/);
    await expect(page).toHaveURL(/directie=retur/);

    await openFilters(page);
    await page.selectOption('#f-from-country', 'IT');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page).toHaveURL(/directie=retur/);
    await expect(page).toHaveURL(/tara-plecare=IT/);
  });

  test('the empty state says what will be here and offers one thing', async ({ page }) => {
    await page.goto('/trasee?tara-plecare=PL&tara-sosire=SE');
    await settled(page);
    await expect(page.getByText('Niciun traseu pentru această căutare')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi toate traseele' })).toBeVisible();

    // The two alerts are still there, one click down rather than beside
    // the button. Signed out, the alert says it needs an account rather
    // than pretending.
    await page.getByText('Altceva de făcut de aici').click();
    await expect(page.getByRole('button', { name: /Intră în cont ca să primești/ })).toBeVisible();
  });

  test('an empty filtered board offers a way back to everything', async ({ page }) => {
    await page.goto('/trasee?tara-plecare=PL&tara-sosire=SE');
    await settled(page);
    await page.getByRole('link', { name: 'Vezi toate traseele' }).click();
    await expect(page).toHaveURL(/\/trasee$/);
  });

  test('a signed-out visitor is told where the carrier name went', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await expect(page.getByText('Firma care transportă apare după autentificare')).toBeVisible();
  });

  test('no company, plate or phone leaks onto the board', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    // The board, not the page: since 25 September the footer names the
    // company that operates the site („Operat de … SRL", Legea 365/2002),
    // which is the site identifying itself, not a carrier leaking.
    const body = (await page.locator('main').innerText()).toLowerCase();
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
    await settled(page);
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
      await settled(page);
      await expect(page).toHaveURL(new RegExp('/autentificare\\?next='));
    });
  }
});
