import { expect, test, type Page, type Route } from '@playwright/test';
import { settled } from './settled';

/**
 * Keeping the place, outside the request form: a failed request never
 * costs typed input, a sign-in page that is left carries the way back, a
 * board's filters survive leaving it, and the page a second tab lands on
 * after signing in again.
 *
 * Signed out, because that is what CI has; the signed-in flows (offers,
 * drivers, settings, the session that expires) are in
 * continuitate-supabase.spec.ts. Runs on desktop and on a phone at 390.
 */

const NETWORK = 'Nu am putut trimite: conexiunea s-a întrerupt. Ce ai completat a rămas aici — încearcă din nou.';
const SERVER = 'Nu am putut salva: serverul a răspuns cu o eroare. Ce ai completat a rămas aici — încearcă din nou peste un minut.';

/** Fails the next server action posted from this page, the way the network would. */
async function failNextAction(page: Page, how: (route: Route) => Promise<void>) {
  let failed = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (!failed && request.method() === 'POST' && request.headers()['next-action'] !== undefined) {
      failed = true;
      await how(route);
      return;
    }
    await route.continue();
  });
}

test.describe('a failed request keeps what was typed', () => {
  test('sign-in: a dropped connection keeps the e-mail and says so, and the page stays', async ({ page }) => {
    await page.goto('/autentificare?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    await page.getByLabel('Adresă de e-mail').fill('ana@example.ro');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await failNextAction(page, (route) => route.abort('internetdisconnected'));
    await page.getByRole('button', { name: 'Intră în cont' }).click();

    await expect(page.getByText(NETWORK)).toBeVisible();
    await expect(page.getByLabel('Adresă de e-mail')).toHaveValue('ana@example.ro');
    await expect(page.getByLabel('Parolă')).toHaveValue('parolaSigura1');
    // Still the sign-in page, still carrying the way back.
    await expect(page).toHaveURL(/\/autentificare\?next=/);
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
  });

  test('sign-up: a server error keeps every field, the terms box included', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill('ion@example.ro');
    await page.getByLabel('Telefon').fill('0722 123 456');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await failNextAction(page, (route) =>
      route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>502</h1>' }),
    );
    await page.getByRole('button', { name: 'Creează contul' }).click();

    await expect(page.getByText(SERVER)).toBeVisible();
    await expect(page.getByLabel('Nume și prenume')).toHaveValue('Ion Popescu');
    await expect(page.getByLabel('Adresă de e-mail')).toHaveValue('ion@example.ro');
    await expect(page.getByLabel('Telefon')).toHaveValue('0722 123 456');
    await expect(page.getByRole('checkbox')).toBeChecked();
  });

  test('a validation refusal no longer empties the form', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill('ion@example.ro');
    await page.getByLabel('Telefon').fill('0722 123 456');
    // No password and the terms unticked: refused by the action.
    await page.getByRole('button', { name: 'Creează contul' }).click();
    await expect(page.locator('.text-danger').first()).toBeVisible();
    await expect(page.getByLabel('Nume și prenume')).toHaveValue('Ion Popescu');
    await expect(page.getByLabel('Telefon')).toHaveValue('0722 123 456');
  });
});

test.describe('a sign-in page keeps the way back', () => {
  test('an expired e-mail link says so, and still goes back to the form', async ({ page }) => {
    await page.goto('/autentificare?eroare=link&next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    await expect(page.getByText(/Linkul din e-mail a expirat sau a fost deja folosit/)).toBeVisible();
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
  });

  test('the confirmation page, its resend and its way back carry the place', async ({ page }) => {
    await page.goto('/confirmare-email?email=ion%40example.ro&next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
    await expect(page.getByText(/Deschide linkul pe acest dispozitiv/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Înapoi la autentificare' })).toHaveAttribute(
      'href',
      '/autentificare?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact',
    );
  });

  test('a new password goes back to the form, not the dashboard', async ({ page }) => {
    await page.goto('/resetare-parola?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
    // Without a recovery session the page says the link expired, and the
    // way to ask for another keeps the place.
    await page.goto('/parola-noua?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact');
    await expect(page.getByRole('link', { name: /Cere un link nou|link nou/i })).toHaveAttribute(
      'href',
      '/resetare-parola?next=%2Fcerere%2Fnoua%3Fpas%3Dcontact',
    );
  });

  test('the page a second tab lands on after signing in again asks to sign in when nobody is', async ({ page }) => {
    await page.goto('/reconectat');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Încă nu ești în cont pe acest dispozitiv.');
    await expect(page.getByRole('link', { name: 'Intră în cont' }).last()).toHaveAttribute(
      'href',
      '/autentificare?next=%2Freconectat',
    );
  });
});

test.describe('a board keeps its filters', () => {
  test('leaving the board and coming back with the browser keeps them', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await page.getByText('Mai multe filtre').click();
    await page.getByLabel('Țara de plecare').selectOption('DE');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page).toHaveURL(/tara-plecare=DE/);

    await page.goto('/trasee');
    await settled(page);
    await page.goBack();
    await expect(page).toHaveURL(/tara-plecare=DE/);
    await expect(page.getByLabel('Țara de plecare')).toHaveValue('DE');
  });

  test('the board remembers them for the detail pages’ way back', async ({ page }) => {
    await page.goto('/trasee?directie=retur');
    await settled(page);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('coridor.panou./trasee')))
      .toBe('?directie=retur');
    await page.goto('/cereri?tara-plecare=DE');
    await settled(page);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('coridor.panou./cereri')))
      .toBe('?tara-plecare=DE');
  });
});
