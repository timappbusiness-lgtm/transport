import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

/**
 * Keeping the place, signed in: the half of docs/16-continuitate.md that
 * needs a real auth server and real rows.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_CLIENT_EMAIL=…  E2E_CLIENT_PASSWORD=… \
 *   E2E_CARRIER_EMAIL=… E2E_CARRIER_PASSWORD=… \
 *   E2E_DRIVER_EMAIL=…  E2E_DRIVER_PASSWORD=… \
 *   pnpm test:e2e
 *
 * The carrier's company must be verified, with a vehicle; the driver
 * must have an order in progress that still needs photographs; there must
 * be at least one active request on the board. Without them the tests
 * skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance. Every rule
 * asserted here is also covered without a browser — the DRF block of
 * supabase/tests/rls_test.sql for the account drafts, and
 * tests/unit/continuity-*.test.ts for the rest — and the signed-out half
 * runs in continuitate-cerere.spec.ts and continuitate-fluxuri.spec.ts.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const INBUCKET = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const CLIENT = account('CLIENT');
const CARRIER = account('CARRIER');
const DRIVER = account('DRIVER');
const FUTURE = '2030-06-01';

function account(prefix: string) {
  return {
    email: process.env[`E2E_${prefix}_EMAIL`] ?? '',
    password: process.env[`E2E_${prefix}_PASSWORD`] ?? '',
    name: prefix.toLowerCase(),
  };
}

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signInHere(page: Page, who: { email: string; password: string; name: string }) {
  test.skip(who.email === '' || who.password === '', `Needs E2E_${who.name.toUpperCase()}_EMAIL and _PASSWORD.`);
  await page.getByLabel('Adresă de e-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: 'Intră în cont' }).click();
}

async function signIn(page: Page, who: { email: string; password: string; name: string }) {
  await page.goto('/autentificare');
  await signInHere(page, who);
  await expect(page).not.toHaveURL(/autentificare/);
}

async function toContact(page: Page) {
  await page.goto('/cerere/noua');
  await page.getByLabel('Oraș de plecare').fill('München');
  await page.getByLabel('Țara de plecare').selectOption('DE');
  await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
  await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByLabel('Marca').fill('Volkswagen');
  await page.getByLabel('Modelul').fill('Golf');
  await page.getByLabel('Anul fabricației').fill('2018');
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByRole('button', { name: 'Continuă' }).click();
  await expect(page.locator('[data-step="contact"][data-state="current"]')).toBeVisible();
}

/** Fails the next server action posted from this page, the way the network would. */
async function failNextAction(page: Page, how: (route: Route) => Promise<void> = (r) => r.abort('internetdisconnected')) {
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

test.describe('the request form and an account', () => {
  test('signing in at step four comes back to step four, with the account step done', async ({ page }) => {
    await toContact(page);
    await page.getByLabel('Numele tău').fill('Ana Pop');
    await page.locator('[data-account-step="needed"]').getByRole('link', { name: 'Am deja cont' }).click();
    await signInHere(page, CLIENT);

    await expect(page).toHaveURL(/\/cerere\/noua\?pas=contact$/);
    await expect(page.locator('[data-step="contact"][data-state="current"]')).toBeVisible();
    await expect(page.getByLabel('Numele tău')).toHaveValue('Ana Pop');
    await expect(page.locator('[data-account-step="done"]')).toBeVisible();
    await expect(page.locator('[data-account-step="needed"]')).toHaveCount(0);
  });

  test('signing up at step four with a confirmation e-mail comes back to step four', async ({ page }) => {
    const email = `continuitate+${Date.now()}@example.com`;
    await toContact(page);
    await page.locator('[data-account-step="needed"]').getByRole('link', { name: 'Fă-ți cont gratuit' }).click();
    await page.getByLabel('Nume și prenume').fill('Ana Pop');
    await page.getByLabel('Adresă de e-mail').fill(email);
    await page.getByLabel('Telefon').fill('0722 123 456');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Creează contul' }).click();
    await expect(page).toHaveURL(/\/confirmare-email\?.*next=/);

    const mailbox = email.split('@')[0]!;
    const list = (await (await fetch(`${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}`)).json()) as { id: string }[];
    const message = (await (await fetch(`${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${list.at(-1)!.id}`)).json()) as {
      body?: { html?: string; text?: string };
    };
    const link = (message.body?.html ?? message.body?.text ?? '').match(/https?:\/\/[^\s"']*(?:auth\/callback|verify)[^\s"']*/)?.[0];
    expect(link).toBeTruthy();
    await page.goto(link!.replace(/&amp;/g, '&'));

    await expect(page).toHaveURL(/\/cerere\/noua\?pas=contact/);
    await expect(page.locator('[data-summary-block="vehicul"]')).toContainText('Volkswagen Golf');
    await expect(page.locator('[data-account-step="done"]')).toBeVisible();
  });

  test('signed in, the draft follows the account to another device', async ({ browser }) => {
    const desktop = await (await browser.newContext()).newPage();
    await signIn(desktop, CLIENT);
    await toContact(desktop);
    await expect(desktop.locator('[data-draft-status="saved-account"]')).toBeVisible({ timeout: 10_000 });

    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await signIn(phone, CLIENT);
    await phone.goto('/cerere/noua?pas=contact');
    await expect(phone.locator('[data-step="contact"][data-state="current"]')).toBeVisible();
    await expect(phone.locator('[data-summary-block="ruta"]')).toContainText('München');

    // Started over on the phone: gone from the account too.
    phone.once('dialog', (d) => void d.accept());
    await phone.locator('[data-draft-restored]').getByRole('button', { name: 'Începe din nou' }).click();
    await desktop.context().clearCookies();
  });
});

test.describe('a session that ends while a form is open', () => {
  async function expire(browser: Browser, who: typeof CARRIER) {
    // Signing out everywhere from another browser ends this one's session
    // the way a changed password or a long night does.
    const other = await (await browser.newContext()).newPage();
    await signIn(other, who);
    await other.goto('/cont/profil');
    await other.getByRole('button', { name: /Ieși de pe toate dispozitivele/ }).click();
    await other.close();
  }

  test('keeps the form, says so, and sends after signing in again in a new tab', async ({ page, browser, context }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/firma');
    const field = page.getByLabel(/Denumire comercială|Nume afișat/).first();
    await field.fill('Transport Ardeal Express');

    await expire(browser, CARRIER);
    await page.getByRole('button', { name: /Salvează/ }).first().click();

    await expect(page.getByRole('alert').filter({ hasText: 'Sesiunea ta a expirat' })).toBeVisible();
    await expect(field).toHaveValue('Transport Ardeal Express');
    await expect(page).toHaveURL(/\/cont\/firma/);

    const [second] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('[data-session-notice="expired"]').getByRole('link', { name: 'Intră din nou în cont' }).click(),
    ]);
    await signInHere(second, CARRIER);
    await expect(second).toHaveURL(/\/reconectat/);
    await expect(page.locator('[data-session-notice="restored"]')).toBeVisible();

    await page.getByRole('button', { name: /Salvează/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: /salvat/i }).first()).toBeVisible();
  });
});

test.describe('carrier flows', () => {
  test('an offer being written survives a refresh and a dropped connection', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cereri');
    await page.locator('a[href^="/cereri/"]').first().click();
    await page.getByRole('button', { name: /Trimite ofertă|ofertă/ }).first().click();
    await page.getByLabel(/Prețul/).fill('650');
    await page.reload();

    // Opened by itself, with the price in it.
    await expect(page.getByLabel(/Prețul/)).toHaveValue('650');
    await expect(page.locator('[data-draft-restored]')).toBeVisible();

    await failNextAction(page);
    await page.getByRole('button', { name: /Trimite oferta/ }).click();
    await expect(page.getByText(/conexiunea s-a întrerupt/)).toBeVisible();
    await expect(page.getByLabel(/Prețul/)).toHaveValue('650');
  });

  test('a departure being published survives a refresh, series options included', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/trasee/nou');
    await page.locator('input[name="from_city"]').fill('Graz');
    await page.getByLabel(/Se repetă|repetă/).check();
    await page.reload();
    await expect(page.locator('input[name="from_city"]')).toHaveValue('Graz');
    await expect(page.getByLabel(/Se repetă|repetă/)).toBeChecked();
  });

  test('a profile tab with unsaved changes asks once before another tab, and not after a save', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/firma');
    await page.getByLabel(/Descriere|Despre firmă/).first().fill('Mutăm mașini din 2009.');
    let asked = 0;
    page.on('dialog', (dialog) => {
      asked += 1;
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Acoperire' }).click();
    expect(asked).toBe(1);
    await expect(page).toHaveURL(/\/cont\/firma$/);

    await page.getByRole('button', { name: /Salvează/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: /salvat/i }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Acoperire' }).click();
    await expect(page).toHaveURL(/sectiune=acoperire/);
    expect(asked).toBe(1);
  });

  test('the way back from a request returns to the filtered board', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cereri?tara-plecare=DE');
    const card = page.locator('a[href^="/cereri/"]').first();
    test.skip((await card.count()) === 0, 'Needs an active request leaving from Germany.');
    await card.click();
    await page.locator('[data-back-to-board]').click();
    await expect(page).toHaveURL(/\/cereri\?tara-plecare=DE$/);
  });
});

test.describe('the driver at the loading bay', () => {
  test('a photograph that fails is kept, survives a reload, and is sent without taking it again', async ({ page }) => {
    await signIn(page, DRIVER);
    await page.goto('/cont/transporturi');
    await page.getByRole('link', { name: /Deschide|Am ridicat|Programează/ }).first().click();
    const capture = page.locator('[data-photo-capture]').first();
    test.skip((await capture.count()) === 0, 'Needs an order waiting for photographs.');

    const before = await capture.locator('li.bg-success').count();
    await failNextAction(page);
    await capture.locator('input[name="photo"]').setInputFiles({
      name: 'fata.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
          'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
          'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
        'base64',
      ),
    });
    await expect(capture.locator('[data-photo-failed="1"]')).toBeVisible();

    await page.reload();
    const again = page.locator('[data-photo-capture]').first();
    await expect(again.locator('[data-photo-waiting="1"]')).toBeVisible();
    await again.getByRole('button', { name: 'Trimite-le acum' }).click();
    await expect(again.locator('li.bg-success')).toHaveCount(before + 1);
    await expect(again.locator('[data-photo-waiting]')).toHaveCount(0);
  });
});
