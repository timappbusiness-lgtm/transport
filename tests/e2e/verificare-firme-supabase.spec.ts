import { expect, test } from '@playwright/test';

/**
 * The whole loop: a manager submits, staff decides, the carrier sees it.
 *
 * Skipped unless E2E_SUPABASE=1, with a staff account and a carrier account
 * whose documents are already uploaded:
 *
 *   supabase start
 *   E2E_SUPABASE=1 E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… \
 *     E2E_CARRIER_EMAIL=… E2E_CARRIER_PASSWORD=… pnpm test:e2e
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The rules each one asserts are covered without a browser by the REV block
 * in `supabase/tests/rls_test.sql`, which does run.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
const CARRIER_EMAIL = process.env.E2E_CARRIER_EMAIL ?? '';
const CARRIER_PASSWORD = process.env.E2E_CARRIER_PASSWORD ?? '';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  test.skip(email === '' || password === '', 'Needs the account credentials in the environment.');
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Parolă').fill(password);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

test.describe('the carrier side', () => {
  test('sees what is still missing, and cannot submit yet', async ({ page }) => {
    await signIn(page, CARRIER_EMAIL, CARRIER_PASSWORD);
    await page.goto('/cont/firma/documente');
    await expect(page.getByText(/documente obligatorii sunt încărcate/)).toBeVisible();
  });

  test('submits once everything is uploaded', async ({ page }) => {
    await signIn(page, CARRIER_EMAIL, CARRIER_PASSWORD);
    await page.goto('/cont/firma/documente');

    const submit = page.getByRole('button', { name: 'Trimite la verificare' });
    test.skip(await submit.isDisabled(), 'The seeded carrier still has documents missing.');

    await submit.click();
    await expect(page.getByText('Documentele sunt în verificare')).toBeVisible();
  });

  test('cannot submit twice', async ({ page }) => {
    await signIn(page, CARRIER_EMAIL, CARRIER_PASSWORD);
    await page.goto('/cont/firma/documente');
    // Once pending, the panel replaces the button entirely.
    await expect(page.getByRole('button', { name: 'Trimite la verificare' })).toHaveCount(0);
  });
});

test.describe('the staff side', () => {
  test('lists the company that is waiting', async ({ page }) => {
    await signIn(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/documente');
    await expect(page.getByRole('heading', { name: 'Firme care așteaptă decizia' })).toBeVisible();
  });

  test('a rejection needs a reason', async ({ page }) => {
    await signIn(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/documente');

    const reject = page.getByRole('button', { name: 'Respinge' }).last();
    test.skip((await reject.count()) === 0, 'Nothing is waiting in the queue.');

    await reject.click();
    await page.getByRole('button', { name: 'Trimite respingerea' }).click();
    await expect(page.getByText('Scrie motivul respingerii.')).toBeVisible();
  });

  test('approving a document asks for the expiry date it read', async ({ page }) => {
    await signIn(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/documente');

    const dates = page.getByLabel('Valabil până la');
    test.skip((await dates.count()) === 0, 'No document with an expiry is waiting.');
    await expect(dates.first()).toBeVisible();
  });

  test('approves the company, and the carrier sees it', async ({ page }) => {
    await signIn(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto('/admin/documente');

    const approve = page.getByRole('button', { name: 'Aprobă firma' }).first();
    test.skip((await approve.count()) === 0, 'No company is waiting.');
    await approve.click();
    await expect(page.getByText('Firmă aprobată.')).toBeVisible();

    await signIn(page, CARRIER_EMAIL, CARRIER_PASSWORD);
    await page.goto('/cont/firma/documente');
    await expect(page.getByText('Firma ta e verificată.')).toBeVisible();
  });
});
