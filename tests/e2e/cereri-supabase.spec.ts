import { expect, test } from '@playwright/test';

/**
 * The half of the request flow that needs rows: a request actually being
 * written, appearing on the board, and the three things its owner can do to
 * it afterwards.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Needs an individual account with a confirmed telephone number — the
 * publish guard refuses one without — passed as E2E_EMAIL and E2E_PASSWORD.
 * Without them these skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * What each one asserts about the rules is covered without a browser by the
 * REQ block in `supabase/tests/rls_test.sql`, and the form's own rules by
 * `tests/unit/request-form.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_ACCOUNT = ENABLED && EMAIL !== '' && PASSWORD !== '';

/** Far enough ahead that this file does not expire. */
const FUTURE = '2030-06-01';

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
  await expect(page).toHaveURL(/\/cont/);
}

/** Fills all four steps and stops on the last one, without submitting. */
async function fillForm(
  page: import('@playwright/test').Page,
  city: string,
): Promise<void> {
  await page.goto('/cerere/noua');
  await page.getByLabel('Oraș de plecare').fill(city);
  await page.getByLabel('Țara de plecare').selectOption('DE');
  await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
  await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
  await page.getByRole('button', { name: 'Continuă' }).click();

  await page.getByLabel('Marca').fill('Volkswagen');
  await page.getByLabel('Modelul').fill('Golf');
  await page.getByLabel('Anul fabricației').fill('2018');
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByRole('button', { name: 'Continuă' }).click();

  await page.getByLabel('Telefon').fill('+40722000111');
}

test.describe('publishing a request end to end', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a confirmed individual account');

  test('a published request is on the board within the same visit', async ({ page }) => {
    await signIn(page);
    const city = `Stuttgart`;
    await fillForm(page, city);
    await page.getByRole('button', { name: 'Publică cererea' }).click();

    await expect(page.getByText('Cererea ta este publicată')).toBeVisible();
    await page.getByRole('link', { name: 'Vezi panoul de cereri' }).click();
    await expect(page.getByText(city).first()).toBeVisible();
  });

  test('the board card carries the window and the condition', async ({ page }) => {
    await signIn(page);
    await page.goto('/cereri');
    const card = page.locator('a[href^="/cereri/"]').first();
    await expect(card).toContainText('Pornește și se deplasează');
  });

  test('the detail page adds what a session buys, and not the number', async ({ page }) => {
    await signIn(page);
    await page.goto('/cereri');
    await page.locator('a[href^="/cereri/"]').first().click();

    await expect(page.getByText('Roțile se învârt')).toBeVisible();
    // The contact is behind a button that spends one from the plan; it is
    // never on the page to begin with.
    await expect(page.locator('body')).not.toContainText('+407');
    await expect(page.getByRole('button', { name: 'Deschide datele de contact' })).toBeVisible();
  });

  test('it shows up in the client\'s own list, on the board', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/cereri');
    await expect(page.getByText('Pe panou').first()).toBeVisible();
  });

  test('withdrawing takes it off the board', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/cereri');

    const card = page.locator('li').filter({ hasText: 'Pe panou' }).first();
    await card.getByRole('button', { name: 'Retrage' }).click();
    await card.getByRole('button', { name: 'Da, continuă' }).click();

    await expect(page.getByText('Cererea a fost retrasă de pe panou.')).toBeVisible();
  });

  test('reopening asks for new dates rather than reusing the old ones', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/cereri');

    const card = page.locator('li').filter({ hasText: 'Retrasă' }).first();
    await card.getByRole('button', { name: 'Republică' }).click();
    await expect(card.getByText('Alege datele noi')).toBeVisible();

    await card.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await card.getByRole('button', { name: 'Republică cererea' }).click();
    await expect(page.getByText('Cererea este din nou pe panou.')).toBeVisible();
  });
});

test.describe('what stops a request from going on the board', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a confirmed individual account');

  test('the plan limit keeps the draft and names the limit', async ({ page }) => {
    // The individual plan allows two active requests. The third must not
    // cost somebody the form they just filled in.
    await signIn(page);
    for (const city of ['Hamburg', 'Bremen', 'Hanovra']) {
      await fillForm(page, city);
      await page.getByRole('button', { name: 'Publică cererea' }).click();
      await expect(page.getByRole('heading', { name: /Cererea/ })).toBeVisible();
    }
    await expect(page.getByText(/anunțuri active/)).toBeVisible();
    await expect(page.getByText('Cererea este salvată ca ciornă')).toBeVisible();
  });

  test('a draft is published from the list once there is room', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/cereri');
    const draft = page.locator('li').filter({ hasText: 'Ciornă' }).first();
    await expect(draft.getByText('Nu este vizibilă pentru transportatori.')).toBeVisible();
    await expect(draft.getByRole('button', { name: 'Publică' })).toBeVisible();
  });
});

test.describe('the contact costs a plan', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a confirmed individual account');

  test('an individual asking for a contact is told what is missing', async ({ page }) => {
    // An individual has no firm and no contact allowance, so `reveal_contact`
    // refuses — in Romanian, saying what to do about it.
    await signIn(page);
    await page.goto('/cereri');
    await page.locator('a[href^="/cereri/"]').first().click();
    await page.getByRole('button', { name: 'Deschide datele de contact' }).click();

    await expect(page.locator('body')).not.toContainText('+407');
    await expect(page.getByRole('alert').or(page.getByText(/plan|firm/i)).first()).toBeVisible();
  });
});
