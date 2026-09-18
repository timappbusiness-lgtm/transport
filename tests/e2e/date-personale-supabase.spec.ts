import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/config/routes';

/**
 * The half of „Date personale" and of the carrier count that needs rows.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Needs an individual account with a confirmed telephone number, passed
 * as E2E_EMAIL and E2E_PASSWORD. Without them these skip rather than
 * fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the
 * network policy blocks it and `supabase start` cannot pull its images.
 * Treat every expectation here as unverified until somebody runs it with
 * the stack up. What each one asserts about the rules is covered without
 * a browser by the DEL and MAT blocks in `supabase/tests/rls_test.sql`,
 * and the archive's own format by `tests/unit/data-export.test.ts`.
 *
 * These tests delete an account. Point them at a throwaway one.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_ACCOUNT = ENABLED && EMAIL !== '' && PASSWORD !== '';

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(ROUTES.signIn);
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
  await expect(page).toHaveURL(/\/cont/);
}

test.describe('descarcă datele mele', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a test account');

  test('builds an archive and offers it once', async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTES.accountPersonalData);

    await page.getByRole('button', { name: 'Pregătește arhiva' }).click();
    const link = page.getByRole('link', { name: 'Descarcă arhiva' });
    await expect(link).toBeVisible({ timeout: 30_000 });

    const download = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download[0].suggestedFilename()).toMatch(/\.zip$/);
  });

  test('refuses a second archive the same day', async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTES.accountPersonalData);
    await page.getByRole('button', { name: 'Pregătește arhiva' }).click();
    await expect(page.getByText(/Ai cerut deja datele/)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('ștergerea contului', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a throwaway test account');

  test('asks for the e-mail to be typed before anything happens', async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTES.accountPersonalData);

    await page.getByRole('button', { name: 'Șterge contul' }).click();
    await page.getByLabel('Confirmare').fill('altceva@exemplu.ro');
    await page.getByRole('button', { name: 'Cere ștergerea' }).click();

    await expect(page.getByText('Textul nu se potrivește. Ștergerea nu a pornit.')).toBeVisible();
    await expect(page.getByText('Ștergere programată')).toHaveCount(0);
  });

  test('holds the account and shows the date, then lets it go', async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTES.accountPersonalData);

    await page.getByRole('button', { name: 'Șterge contul' }).click();
    await page.getByLabel('Confirmare').fill(EMAIL);
    await page.getByRole('button', { name: 'Cere ștergerea' }).click();

    await expect(page.getByText('Ștergere programată')).toBeVisible();
    await expect(page.getByText(/Ștergem datele pe /)).toBeVisible();

    // Held means held: nothing goes on the board from here.
    await page.goto(ROUTES.accountRequests);
    await expect(page.getByRole('button', { name: 'Publică' })).toHaveCount(0);

    await page.goto(ROUTES.accountPersonalData);
    await page.getByRole('button', { name: 'Anulează ștergerea' }).click();
    await expect(page.getByText(/Ștergerea a fost anulată/)).toBeVisible();
  });
});

test.describe('transportatori potriviți', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a test account');

  test('the preview in the last step answers a number or says nobody yet', async ({ page }) => {
    await signIn(page);
    await page.goto(ROUTES.newRequest);
    await page.getByLabel('Oraș de plecare').fill('München');
    await page.getByLabel('Țara de plecare').selectOption('DE');
    await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
    await page.getByLabel('Poate fi încărcat de la').fill('2030-06-01');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await page.getByLabel('Marca').fill('Volkswagen');
    await page.getByLabel('Modelul').fill('Golf');
    await page.getByLabel('Anul fabricației').fill('2018');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await page.getByRole('button', { name: 'Continuă' }).click();

    await page.getByRole('button', { name: /Vezi câți transportatori/ }).click();
    await expect(
      page.getByText(/circulă pe această rută|Încă nu avem transportatori/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('a stranger reading the same request sees no count', async ({ page, browser }) => {
    await signIn(page);
    await page.goto(ROUTES.accountRequests);
    const first = page.locator('a[href^="/cereri/"]').first();
    await expect(first).toBeVisible();
    const href = await first.getAttribute('href');

    const anonymous = await browser.newContext();
    const other = await anonymous.newPage();
    await other.goto(href!);
    await expect(other.getByText(/circulă pe această rută/)).toHaveCount(0);
    await expect(other.getByText(/Încă nu avem transportatori/)).toHaveCount(0);
    await anonymous.close();
  });
});
