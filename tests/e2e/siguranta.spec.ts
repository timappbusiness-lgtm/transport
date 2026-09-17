import { expect, test } from '@playwright/test';

/**
 * The safety claims, checked as claims.
 *
 * Most of this suite is negative: the words we do not use, the number we do
 * not state when we cannot back it, the colour that never carries meaning
 * on its own. Those are the ways this part of a marketplace goes wrong, and
 * none of them shows up in a screenshot.
 *
 * Runs without a database. With one, /verificare also renders the document
 * table and the homepage states a count — see `siguranta-supabase.spec.ts`.
 */

const FORBIDDEN = [
  /\bgarant(ăm|ez|ie|ii|at|ată)\b/i,
  /100\s*%/,
  /complet sigur/i,
  /în legalitate/i,
  /\btoate firmele\b/i,
];

test.describe('the band that asks for the request', () => {
  test('asks, and offers the two ways on', async ({ page }) => {
    await page.goto('/');
    const band = page.getByRole('heading', { name: /Cauți transportator/ }).locator('..').locator('..');
    await expect(band.getByRole('link', { name: 'Publică o cerere' })).toBeVisible();
    await expect(band.getByRole('link', { name: 'Cum verificăm firmele' })).toBeVisible();
  });

  test('states no number of companies when it cannot count them', async ({ page }) => {
    await page.goto('/');
    // No database here, so there is nothing to count and nothing is said.
    await expect(page.getByText(/de transport cu documente verificate/)).toHaveCount(0);
  });

  test('the buttons go where they say', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Cum verificăm firmele' }).first().click();
    await expect(page).toHaveURL(/\/verificare$/);
  });
});

test.describe('the safety section', () => {
  test('introduces itself and lists six things', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#siguranta');
    await expect(section).toContainText('Siguranță');
    await expect(section.getByRole('heading', { name: /Transportatori cu acte valabile/ })).toBeVisible();
    await expect(section.locator('ol > li')).toHaveCount(6);
  });

  test('numbers them 01 to 06', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#siguranta');
    await expect(section).toContainText('01');
    await expect(section).toContainText('06');
  });

  test('labels the demonstration card as one', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#siguranta');
    await expect(section.getByText('Transport Exemplu SRL')).toBeVisible();
    await expect(section.getByText('Exemplu').first()).toBeVisible();
  });

  test('every status chip carries a word, not only a colour', async ({ page }) => {
    await page.goto('/');
    // Four rows, four states in words. A chip that said "valid" only by
    // being green would be invisible to a colour-blind reader and to a
    // screen reader alike.
    const states = await page
      .locator('#siguranta')
      .getByText(/^(Valid|Expiră curând)$/)
      .allTextContents();
    expect(states).toHaveLength(4);
    for (const state of states) expect(state.trim().length).toBeGreaterThan(0);
  });

  test('links on to the page that explains it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#siguranta').getByRole('link', { name: 'Vezi cum verificăm firmele' }).click();
    await expect(page).toHaveURL(/\/verificare$/);
  });
});

test.describe('the words the homepage does not use', () => {
  test('promises nothing it cannot keep', async ({ page }) => {
    await page.goto('/');
    const body = await page.locator('body').innerText();
    for (const pattern of FORBIDDEN) {
      expect(body, String(pattern)).not.toMatch(pattern);
    }
  });
});

test.describe('the verification page', () => {
  test('opens with one heading and says what it is about', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Cum verificăm');
    await expect(page.getByText(/pot trimite oferte doar firmele/)).toBeVisible();
  });

  test('walks the five steps', async ({ page }) => {
    await page.goto('/verificare');
    const steps = page.locator('ol > li');
    await expect(steps).toHaveCount(5);
    await expect(steps.first()).toContainText('CUI');
    await expect(steps.last()).toContainText('Blocare');
  });

  test('says what it does not check', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByText('Nu verificăm automat')).toBeVisible();
    await expect(page.getByText(/RAR/)).toBeVisible();
    await expect(page.getByText(/nu înlocuiește atenția ta/)).toBeVisible();
  });

  test('offers a way to report a company', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByRole('heading', { name: /Ce faci dacă observi o problemă/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Raportează firma' })).toBeVisible();
  });

  test('answers the questions that do not need a setting', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByText('Pot vedea documentele firmei?')).toBeVisible();
    await expect(page.getByText(/Plătesc pentru verificare/)).toBeVisible();
    await expect(page.getByText(/nu se anulează singură/)).toBeVisible();
  });

  test('promises nothing it cannot keep', async ({ page }) => {
    await page.goto('/verificare');
    const body = await page.locator('body').innerText();
    for (const pattern of FORBIDDEN) {
      expect(body, String(pattern)).not.toMatch(pattern);
    }
  });

  test('stays out of search results until launch', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('does not scroll sideways', async ({ page }) => {
    await page.goto('/verificare');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('reachable from where a carrier lands', () => {
  test('from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Cum verificăm firmele' }).last().click();
    await expect(page).toHaveURL(/\/verificare$/);
  });

  test('from the company sign-up', async ({ page }) => {
    await page.goto('/inregistrare/firma');
    await page.getByRole('link', { name: 'Cum verificăm firmele' }).first().click();
    await expect(page).toHaveURL(/\/verificare$/);
  });
});
