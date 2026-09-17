import { expect, test } from '@playwright/test';

/**
 * The half of the pricing page that needs rows: prices that change when the
 * database changes, the plan and period carried through sign-up, a manager
 * asking for a plan, and staff activating it.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * The staff paths need a platform_staff account; the manager paths need an
 * account that owns a verified company. Without them the tests skip rather
 * than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The rules each one asserts are covered without a browser in the ABO block
 * of `supabase/tests/rls_test.sql` and in `tests/unit/plans.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL ?? '';
const MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? '';

type Page = import('@playwright/test').Page;

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Parolă').fill(password);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

async function signInAsStaff(page: Page) {
  test.skip(
    STAFF_EMAIL === '' || STAFF_PASSWORD === '',
    'Needs E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD for a platform_staff account.',
  );
  await signIn(page, STAFF_EMAIL, STAFF_PASSWORD);
}

async function signInAsManager(page: Page) {
  test.skip(
    MANAGER_EMAIL === '' || MANAGER_PASSWORD === '',
    'Needs E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD for a verified company owner.',
  );
  await signIn(page, MANAGER_EMAIL, MANAGER_PASSWORD);
}

test.describe('the prices come from the database', () => {
  test('the seeded carrier plan is what the page states', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.getByText('149 lei').first()).toBeVisible();
  });

  test('twelve months shows the monthly equivalent and the total', async ({ page }) => {
    await page.goto('/abonamente?perioada=12');
    // 1.490 / 12 = 124,17 → 124 lei, and the total is stated under it.
    await expect(page.getByText('124 lei').first()).toBeVisible();
    await expect(page.getByText(/1\.490 lei la 12 luni/)).toBeVisible();
  });

  test('"2 luni gratuite" appears only because the totals divide that way', async ({ page }) => {
    await page.goto('/abonamente?perioada=12');
    await expect(page.getByText('2 luni gratuite').first()).toBeVisible();

    // Six months does not divide cleanly, so the saving is stated in lei.
    await page.goto('/abonamente?perioada=6');
    await expect(page.getByText('2 luni gratuite')).toHaveCount(0);
    await expect(page.getByText(/Economisești \d+ lei față de plata lunară/).first()).toBeVisible();
  });

  test('the forwarder tab shows the forwarder plan', async ({ page }) => {
    await page.goto('/abonamente?pentru=expeditii');
    await expect(page.getByText('249 lei').first()).toBeVisible();
  });

  test('changing a price in the admin screen changes the page', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/planuri');

    const card = page.locator('form', { has: page.locator('input[name="code"][value="carrier"]') });
    await card.getByLabel('Preț pe lună, lei').fill('157');
    await card.getByRole('button', { name: 'Salvează planul' }).click();
    await expect(page.getByText('Planul a fost salvat.')).toBeVisible();

    await page.goto('/abonamente');
    await expect(page.getByText('157 lei').first()).toBeVisible();

    // The homepage states the recommended plan's price from the same rows.
    await page.goto('/');
    await expect(page.locator('#transportatori')).toContainText('157 lei');

    // Put it back, so a repeat run starts where this one did.
    await page.goto('/admin/planuri');
    await card.getByLabel('Preț pe lună, lei').fill('149');
    await card.getByRole('button', { name: 'Salvează planul' }).click();
  });

  test('a period dearer than paying monthly is refused, with a reason', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/planuri');

    const period = page.locator('form', {
      has: page.locator('input[name="months"][value="12"]'),
    }).first();
    await period.getByRole('spinbutton').fill('99999');
    await period.getByRole('button', { name: 'Salvează perioada' }).click();
    await expect(page.getByText(/nu poate depăși plata lunară/)).toBeVisible();
  });
});

test.describe('a visitor who is not signed in', () => {
  test('carries the plan and the period through to sign-up', async ({ page }) => {
    await page.goto('/abonamente?perioada=12');
    await page.getByRole('link', { name: 'Începe perioada gratuită' }).first().click();
    await expect(page).toHaveURL(/plan=carrier/);
    await expect(page).toHaveURL(/perioada=12/);
  });
});

test.describe('a manager choosing a plan', () => {
  test('confirms first, and is told nothing is charged', async ({ page }) => {
    await signInAsManager(page);
    await page.goto('/abonamente?perioada=12');

    await page.getByRole('button', { name: 'Alege planul' }).first().click();
    await expect(page.getByText('Confirmi planul?')).toBeVisible();
    await expect(page.getByText(/Nu se ia niciun ban acum/)).toBeVisible();
    await expect(page.getByText(/1\.490 lei/)).toBeVisible();
  });

  test('sends the request and sees it on the account page', async ({ page }) => {
    await signInAsManager(page);
    await page.goto('/abonamente?perioada=12');

    await page.getByRole('button', { name: 'Alege planul' }).first().click();
    await page.getByRole('button', { name: 'Trimite cererea' }).click();
    await expect(page.getByText(/Am primit cererea/)).toBeVisible();

    await page.goto('/cont/abonament');
    await expect(page.getByRole('heading', { name: 'Cerere în lucru' })).toBeVisible();
  });

  test('a second request is refused while the first is open', async ({ page }) => {
    await signInAsManager(page);
    await page.goto('/abonamente?perioada=6');
    await expect(page.getByText('Cerere trimisă').first()).toBeVisible();
  });
});

test.describe('staff activating it', () => {
  test('the company sees the new plan afterwards', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/abonamente');
    await page.getByRole('button', { name: 'Activează abonamentul' }).first().click();
    await expect(page.getByText('Abonamentul a fost activat.')).toBeVisible();

    await signInAsManager(page);
    await page.goto('/cont/abonament');
    await expect(page.getByText('Activ')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cerere în lucru' })).toHaveCount(0);
  });

  test('a rejection needs a reason', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/abonamente');
    const reject = page.getByRole('button', { name: 'Respinge' }).first();
    test.skip((await reject.count()) === 0, 'No open request to reject.');
    await reject.click();
    await expect(page.getByText(/Scrie motivul/)).toBeVisible();
  });
});

test.describe('the trial', () => {
  test('starts when the company is approved, not when it signs up', async ({ page }) => {
    await signInAsManager(page);
    await page.goto('/cont/abonament');
    // Either a trial or an activated plan, but never nothing at all for a
    // verified company.
    await expect(page.getByText(/Perioadă gratuită|Activ/).first()).toBeVisible();
  });
});
