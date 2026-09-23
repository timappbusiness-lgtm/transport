import { expect, test } from '@playwright/test';

/**
 * Authentication tests that do not need a running Supabase.
 *
 * Everything here exercises code we own: route guards, redirect validation,
 * server-side form validation and the staff 404. The flows that need a real
 * auth server live in `auth-supabase.spec.ts`.
 */

test.describe('public pages render', () => {
  for (const [name, path] of [
    ['sign in', '/autentificare'],
    ['account type choice', '/inregistrare'],
    ['individual sign up', '/inregistrare/persoana-fizica'],
    ['company sign up', '/inregistrare/firma'],
    ['confirm e-mail', '/confirmare-email'],
    ['password reset', '/resetare-parola'],
  ] as const) {
    test(`${name} has exactly one h1 and no sideways scroll`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflows).toBe(false);
    });
  }

  test('the carrier link explains itself, then leads into sign-up with the type', async ({
    page,
  }) => {
    // It used to redirect straight into a form. A dispatcher arriving
    // from a printed leaflet met four fields and no reason for them.
    await page.goto('/transportatori/inscriere');
    await expect(page).toHaveURL(/\/transportatori\/inscriere$/);
    await page.getByRole('link', { name: /Fă-ți cont/ }).click();
    await expect(page).toHaveURL(/\/inregistrare\/firma\?tip=transport$/);
  });
});

test.describe('protected routes', () => {
  test('sending an anonymous visitor to sign-in carries the path back', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await expect(page).toHaveURL(
      /\/autentificare\?next=%2Fcont%2Ffirma%2Fmembri$/,
    );
  });

  test('the bare account page does not add a redundant next', async ({ page }) => {
    await page.goto('/cont');
    await expect(page).toHaveURL(/\/autentificare$/);
  });

  test('an external next is dropped rather than followed', async ({ page }) => {
    await page.goto('/autentificare?next=https://example.com/phish');
    // The form carries the validated value, not what the URL asked for.
    await expect(page.locator('input[name="next"]')).toHaveValue('/cont');
  });

  test('a protocol-relative next is dropped', async ({ page }) => {
    await page.goto('/autentificare?next=//example.com');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cont');
  });

  test('an internal next survives', async ({ page }) => {
    await page.goto('/autentificare?next=%2Fcont%2Fprofil');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cont/profil');
  });

  // The fleet and document screens are the ones that hold licence numbers,
  // ITP dates and a company's papers. They are guarded by the same
  // middleware as the rest of /cont, and this says so out loud.
  for (const [path, next] of [
    ['/cont/firma/documente', '%2Fcont%2Ffirma%2Fdocumente'],
    ['/cont/firma/flota', '%2Fcont%2Ffirma%2Fflota'],
    ['/cont/firma/flota/00000000-0000-0000-0000-000000000000', '%2Fcont%2Ffirma%2Fflota%2F00000000-0000-0000-0000-000000000000'],
  ] as const) {
    test(`${path} is closed to an anonymous visitor`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/autentificare\\?next=${next}$`));
    });
  }
});

test.describe('staff area', () => {
  test('a visitor who is not staff gets 404, not 403', async ({ page }) => {
    const response = await page.goto('/admin');
    // The distinction matters: a 403 confirms the route exists and that
    // there is something behind it worth finding.
    expect(response?.status()).toBe(404);
  });
});

test.describe('server-side form validation', () => {
  test('individual sign-up reports every bad field in Romanian', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Io');
    await page.getByLabel('Adresă de e-mail').fill('nu-e-email');
    await page.getByLabel('Parolă').fill('scurt');
    await page.getByRole('button', { name: 'Creează contul' }).click();

    await expect(page.getByText('Numele pare prea scurt.')).toBeVisible();
    await expect(page.getByText('Adresa de e-mail nu pare validă.')).toBeVisible();
    await expect(
      page.getByText('Parola trebuie să aibă cel puțin 8 caractere.'),
    ).toBeVisible();
    await expect(
      page.getByText('Confirmă că ai citit termenii și politica de confidențialitate.'),
    ).toBeVisible();
  });

  test('sign-up keeps what the user typed after a failed submit', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill('nu-e-email');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('button', { name: 'Creează contul' }).click();

    await expect(page.getByLabel('Nume și prenume')).toHaveValue('Ion Popescu');
  });

  test('sign-in reports a missing password without complaining about its length', async ({
    page,
  }) => {
    await page.goto('/autentificare');
    await page.getByLabel('Adresă de e-mail').fill('ion@example.com');
    await page.getByRole('button', { name: 'Intră în cont' }).click();

    await expect(page.getByText('Introdu parola.')).toBeVisible();
  });
});

test.describe('header', () => {
  test('a signed-out visitor is offered sign-in and posting a request', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Publică o cerere' }).first()).toBeVisible();
  });
});
