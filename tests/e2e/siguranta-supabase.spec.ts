import { expect, test } from '@playwright/test';

/**
 * The half of the safety pages that needs a database: the document table,
 * which /verificare renders from `document_requirements`, and the number of
 * verified carriers on the homepage.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * The count tests move `verified_companies_min` through the staff RPC, so
 * they need a platform_staff account as well; without one they skip rather
 * than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The rules each one asserts are covered without a browser in
 * `supabase/tests/rls_test.sql` and `tests/unit/trust.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signInAsStaff(page: import('@playwright/test').Page) {
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

/** Moves the company threshold through the staff screen and saves. */
async function setCompanyThreshold(page: import('@playwright/test').Page, value: number) {
  await page.goto('/admin/activitate');
  await page.getByLabel('Prag pentru numărul de firme').fill(String(value));
  await page.getByRole('button', { name: 'Salvează pragurile' }).click();
  await expect(page.getByText('Praguri salvate.')).toBeVisible();
}

test.describe('the document table', () => {
  test('lists the documents the platform actually requires', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByRole('heading', { name: 'Ce documente cerem' })).toBeVisible();
    for (const label of ['Licență comunitară', 'Asigurare CMR', 'Poliță RCA', 'Copie conformă ARR']) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test('says what each expiry costs, per scope', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 640, 'The table is a stack of cards on a phone.');
    await page.goto('/verificare');
    const rca = page.locator('tr', { hasText: 'Poliță RCA' });
    await expect(rca).toContainText('Vehicul');
    await expect(rca).toContainText('iese de pe bursă');

    const licence = page.locator('tr', { hasText: 'Licență comunitară' });
    await expect(licence).toContainText('Firmă');
    await expect(licence).toContainText('nu mai poate trimite oferte');
  });

  test('reads the reminder schedule from the rows, not from the copy', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByText(/Atenționări cu 30, 14, 7 și o zi înainte/).first()).toBeVisible();
  });

  test('leaves out the documents that are not a condition of the account', async ({ page }) => {
    await page.goto('/verificare');
    // Carte Verde and ADR are needed for particular jobs, not to be listed.
    await expect(page.getByText('Carte Verde')).toHaveCount(0);
    await expect(page.getByText('Autorizație ADR')).toHaveCount(0);
  });

  test('becomes a card per document on a phone', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) > 640, 'The card stack is the phone rendering.');
    await page.goto('/verificare');
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByText('Licență comunitară').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('how many carriers we say there are', () => {
  test('says nothing while the threshold is above the real count', async ({ page }) => {
    await signInAsStaff(page);
    await setCompanyThreshold(page, 100000);
    await page.goto('/');
    await expect(page.getByText(/de transport cu documente verificate/)).toHaveCount(0);
  });

  test('states the count once the threshold is met', async ({ page }) => {
    await signInAsStaff(page);
    await setCompanyThreshold(page, 1);
    await page.goto('/');
    // "N firme de transport cu documente verificate", with the Romanian plural.
    await expect(
      page.getByText(/(o firmă|\d+ (de )?firme) de transport cu documente verificate/),
    ).toBeVisible();
  });

  test.afterAll(async ({ browser }) => {
    if (!ENABLED || STAFF_EMAIL === '') return;
    const page = await browser.newPage();
    await signInAsStaff(page);
    await setCompanyThreshold(page, 20);
    await page.close();
  });
});

test.describe('the review-time question', () => {
  test('appears when the team has set what to promise', async ({ page }) => {
    await page.goto('/verificare');
    await expect(page.getByText('Cât durează verificarea?')).toBeVisible();
  });

  test('disappears when the setting is cleared', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/activitate');
    await page.getByLabel('Durata verificării, în cuvinte').fill('');
    await page.getByRole('button', { name: 'Salvează pragurile' }).click();
    await expect(page.getByText('Praguri salvate.')).toBeVisible();

    await page.goto('/verificare');
    await expect(page.getByText('Cât durează verificarea?')).toHaveCount(0);

    await page.goto('/admin/activitate');
    await page.getByLabel('Durata verificării, în cuvinte').fill('în cel mult o zi lucrătoare');
    await page.getByRole('button', { name: 'Salvează pragurile' }).click();
  });
});

test.describe('reporting a company', () => {
  test('a signed-in person gets a form, not an e-mail client', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/verificare');
    await page.getByRole('button', { name: 'Raportează firma' }).click();
    await expect(page.getByLabel('Ce s-a întâmplat')).toBeVisible();

    await page.getByLabel('Ce s-a întâmplat').selectOption('Document care pare modificat');
    await page.getByLabel('Detalii').fill('Data de pe copia conformă pare modificată.');
    await page.getByRole('button', { name: 'Trimite sesizarea' }).click();
    await expect(page.getByText('Am primit sesizarea')).toBeVisible();
  });
});
