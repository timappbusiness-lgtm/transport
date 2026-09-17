import { expect, test } from '@playwright/test';

/**
 * The half of the directory that needs rows: a listed company appearing,
 * a card opening its profile, a hidden company becoming a 404, and the
 * thresholds hiding the grid and the band.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * The threshold and price tests move settings through the staff screens, so
 * they need a platform_staff account as well; without one they skip rather
 * than fail. The company tests need a verified company that has opted into
 * the directory — pass its slug as E2E_COMPANY_SLUG.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The rules each one asserts are covered without a browser in
 * `supabase/tests/rls_test.sql` (the DIR block) and `tests/unit/directory.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
const COMPANY_SLUG = process.env.E2E_COMPANY_SLUG ?? '';

type Page = import('@playwright/test').Page;

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signInAsStaff(page: Page) {
  test.skip(
    STAFF_EMAIL === '' || STAFF_PASSWORD === '',
    'Needs E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD for a platform_staff account.',
  );
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(STAFF_EMAIL);
  await page.getByLabel('Parolă').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

/** Moves the two directory thresholds through the staff screen and saves. */
async function setThresholds(page: Page, statsMin: number, directoryMin: number) {
  await page.goto('/admin/setari');
  await page.getByLabel('Prag pentru banda cu cifre').fill(String(statsMin));
  await page.getByLabel('Prag pentru lista de pe prima pagină').fill(String(directoryMin));
  await page.getByRole('button', { name: 'Salvează' }).click();
  await expect(page.getByText('Setările au fost salvate.')).toBeVisible();
}

test.describe('a listed company', () => {
  test.beforeEach(() => {
    test.skip(COMPANY_SLUG === '', 'Needs E2E_COMPANY_SLUG for a verified, opted-in company.');
  });

  test('has a profile that says what is verified and until when', async ({ page }) => {
    await page.goto(`/firme/${COMPANY_SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Verificată').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scut de conformitate' })).toBeVisible();
  });

  test('never shows a file, a plate or a telephone number', async ({ page }) => {
    await page.goto(`/firme/${COMPANY_SLUG}`);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/\+4\s*0?7\d{2}/);
    expect(text).not.toMatch(/\b[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}\b/);
    await expect(page.locator('a[href*="storage/v1/object/sign"]')).toHaveCount(0);
  });

  test('appears in the directory, and its card opens the profile', async ({ page }) => {
    await page.goto('/firme');
    const card = page.locator(`a[href="/firme/${COMPANY_SLUG}"]`).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/firme/${COMPANY_SLUG}$`));
  });

  test('the search box finds it by name', async ({ page }) => {
    await page.goto(`/firme/${COMPANY_SLUG}`);
    const heading = await page.getByRole('heading', { level: 1 }).innerText();

    await page.goto('/firme');
    await page.getByLabel('Caută după nume sau CUI').fill(heading.slice(0, 8));
    await page.getByRole('button', { name: 'Filtrează' }).click();
    await expect(page.locator(`a[href="/firme/${COMPANY_SLUG}"]`).first()).toBeVisible();
  });
});

test.describe('a company staff took out of the list', () => {
  test.beforeEach(() => {
    test.skip(COMPANY_SLUG === '', 'Needs E2E_COMPANY_SLUG for a verified, opted-in company.');
  });

  test('becomes a 404, without a page saying why', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/firme');

    const row = page.locator('li', { has: page.locator(`a[href="/firme/${COMPANY_SLUG}"]`) });
    await row.getByPlaceholder('De ce scoatem profilul din listă').fill('Verificare Playwright');
    await row.getByRole('button', { name: 'Scoate din listă' }).click();
    await expect(page.getByText('Profilul a fost scos din listă.')).toBeVisible();

    const hidden = await page.goto(`/firme/${COMPANY_SLUG}`);
    expect(hidden?.status()).toBe(404);
    // Never a page that says the firm is suspended: that is a claim about a
    // real company, and it is not one we publish.
    await expect(page.getByText(/suspendat/i)).toHaveCount(0);
  });
});

test.describe('the thresholds decide what a visitor sees', () => {
  test('a high threshold hides the grid and the band entirely', async ({ page }) => {
    await signInAsStaff(page);
    await setThresholds(page, 100_000, 100_000);

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Vezi toate firmele' })).toHaveCount(0);
    await expect(page.getByText('Date actualizate zilnic din platformă.')).toHaveCount(0);
  });

  test('a threshold of one shows them', async ({ page }) => {
    await signInAsStaff(page);
    await setThresholds(page, 1, 1);

    await page.goto('/');
    await expect(page.getByText('Date actualizate zilnic din platformă.')).toBeVisible();
  });
});

test.describe('the price on the homepage is the one in the database', () => {
  test('changing it in the admin screen changes the homepage', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/planuri');

    const card = page.locator('form', { has: page.locator('input[name="code"][value="carrier"]') });
    await card.getByLabel('Preț pe lună, lei').fill('157');
    await card.getByRole('button', { name: 'Salvează planul' }).click();
    await expect(page.getByText('Planul a fost salvat.')).toBeVisible();

    await page.goto('/');
    await expect(page.locator('#transportatori')).toContainText('157 lei');

    // Put it back, so a repeat run starts where this one did.
    await page.goto('/admin/planuri');
    await card.getByLabel('Preț pe lună, lei').fill('149');
    await card.getByRole('button', { name: 'Salvează planul' }).click();
  });
});

test.describe('a carrier opting in', () => {
  test('sees the checkbox and the limit on the description', async ({ page }) => {
    test.skip(
      STAFF_EMAIL === '' || STAFF_PASSWORD === '',
      'Needs an account with a company: reuse E2E_STAFF_EMAIL.',
    );
    await signInAsStaff(page);
    await page.goto('/cont/firma');

    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Profil public' }) });
    await expect(
      section.getByLabel(/Afișează firma în lista publică de transportatori verificați/),
    ).toBeVisible();
    await expect(section.getByLabel('Descriere publică')).toHaveAttribute('maxlength', '300');
  });
});
