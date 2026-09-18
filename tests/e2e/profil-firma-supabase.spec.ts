import { expect, test } from '@playwright/test';

/**
 * The half of the company profile that needs rows: the five tabs saving,
 * the completeness card moving, and the alert a request causes.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Needs a manager of a verified transport company, passed as E2E_EMAIL and
 * E2E_PASSWORD. Without them these skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * What each one asserts about the rules is covered without a browser by the
 * FIRM block in `supabase/tests/rls_test.sql`, and the form's own rules by
 * `tests/unit/company-profile.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_ACCOUNT = ENABLED && EMAIL !== '' && PASSWORD !== '';

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
  await expect(page).toHaveURL(/\/cont/);
}

test.describe('the five tabs', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a verified carrier account');

  test('opens on the identity tab and offers the other four', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Profilul firmei');
    for (const label of ['Date firmă', 'Acoperire', 'Servicii și dotări', 'Alerte', 'Profil public']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('the CUI is shown and cannot be typed over', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    await expect(page.getByText('CUI')).toBeVisible();
    await expect(page.getByLabel('CUI')).toHaveCount(0);
  });

  test('a telephone number comes back in one shape', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    await page.getByLabel('Telefon de contact').fill('0722 000 111');
    await page.getByRole('button', { name: 'Salvează' }).click();

    await expect(page.getByText('Modificările au fost salvate.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Telefon de contact')).toHaveValue('+40722000111');
  });

  test('a website loses the campaign that linked it', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    await page.getByLabel('Site').fill('http://Firma-Test.RO/servicii?utm_source=nl#top');
    await page.getByRole('button', { name: 'Salvează' }).click();

    await page.reload();
    await expect(page.getByLabel('Site')).toHaveValue('https://firma-test.ro/servicii');
  });
});

test.describe('coverage asks only what the scope needs', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a verified carrier account');

  test('a national carrier is not shown forty-two counties', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=acoperire');
    await page.getByLabel('Toată România').check();
    await expect(page.getByLabel('Cluj')).toHaveCount(0);
  });

  test('choosing counties reveals them, and saving keeps them', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=acoperire');
    await page.getByLabel('Câteva județe').check();
    await page.getByLabel('Cluj', { exact: true }).check();
    await page.getByLabel('Timiș', { exact: true }).check();
    await page.getByRole('button', { name: 'Salvează' }).click();

    await expect(page.getByText('Modificările au fost salvate.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Cluj', { exact: true })).toBeChecked();
  });

  test('a county carrier with no county is refused, in Romanian', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=acoperire');
    await page.getByLabel('Câteva județe').check();
    for (const county of ['Cluj', 'Timiș']) {
      const box = page.getByLabel(county, { exact: true });
      if (await box.isChecked()) await box.uncheck();
    }
    await page.getByRole('button', { name: 'Salvează' }).click();
    await expect(page.getByText('Alege cel puțin un județ în care transporți.')).toBeVisible();
  });

  test('going national afterwards clears the counties behind it', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=acoperire');
    await page.getByLabel('Toată România').check();
    await page.getByRole('button', { name: 'Salvează' }).click();

    await page.reload();
    await page.getByLabel('Câteva județe').check();
    await expect(page.getByLabel('Cluj', { exact: true })).not.toBeChecked();
  });
});

test.describe('capabilities', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a verified carrier account');

  test('the fleet count is read out, never typed in', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=dotari');
    await expect(page.getByText('Vehicule în flotă')).toBeVisible();
    await expect(page.getByLabel('Vehicule în flotă')).toHaveCount(0);
  });

  test('a note about a rate with no rate is refused', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=dotari');
    await page.getByLabel(/Tarif orientativ/).fill('');
    await page.getByLabel('Observație la tarif').fill('Negociabil peste 500 km');
    await page.getByRole('button', { name: 'Salvează' }).click();
    await expect(page.getByText('Scrie tariful înainte de observația despre el.')).toBeVisible();
  });
});

test.describe('alerts say what they send and nothing else', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a verified carrier account');

  test('offers e-mail and never SMS or WhatsApp', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=alerte');
    await expect(page.getByText(/Primesc alerte pe e-mail/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/SMS|WhatsApp/i);
  });

  test('lists the rules the database actually applies', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma?sectiune=alerte');
    await expect(page.getByText(/doar dacă ai troliu/)).toBeVisible();
  });
});

test.describe('the completeness card', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a verified carrier account');

  test('links each missing line to the tab that fixes it', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    const card = page.locator('section', { hasText: 'Cât este completat' }).first();
    await expect(card).toBeVisible();

    const link = card.getByRole('link').first();
    if ((await card.getByRole('link').count()) > 0) {
      await link.click();
      await expect(page).toHaveURL(/\/cont\/firma(\?sectiune=)?/);
    }
  });

  test('never blocks anything: publishing a route is still offered', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    await expect(page.getByText('Nimic nu este blocat dacă îl lași așa.')).toBeVisible();
  });
});

test.describe('a forwarder is asked four questions, not five', () => {
  test.skip(
    !HAS_ACCOUNT || process.env.E2E_COMPANY_TYPE !== 'expeditie',
    'needs a forwarder account, passed as E2E_COMPANY_TYPE=expeditie',
  );

  test('there is no tab about kit it does not own', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/firma');
    await expect(page.getByRole('link', { name: 'Servicii și dotări' })).toHaveCount(0);
  });

  test('and the URL for it is a 404 rather than a redirect', async ({ page }) => {
    await signIn(page);
    const response = await page.goto('/cont/firma?sectiune=dotari');
    expect(response?.status()).toBe(404);
  });
});
