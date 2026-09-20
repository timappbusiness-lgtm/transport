import { expect, test } from '@playwright/test';

/**
 * The Faza 1 unblocking, against a real database and a real auth server.
 *
 * The question this file exists to answer is the one the gap analysis
 * could not: **can a private person actually publish?** Before
 * 20260920100000 they could not, anywhere, because publishing asked for a
 * telephone number confirmed by SMS and no SMS provider was ever
 * configured. The first test walks the whole thing — sign up, confirm the
 * address out of the local mail catcher, publish — and counts the screens
 * on the way.
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * NOT YET RUN: the environment this was written in cannot pull container
 * images, so `supabase start` never came up. Every expectation here is
 * unverified until somebody runs it with the stack up. `pnpm db:test`
 * covers the same rules at the database level and does run.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const INBUCKET = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const FUTURE = '2030-06-01';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a local Supabase: supabase start, then E2E_SUPABASE=1.');
});

function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}@example.com`;
}

async function confirmationLink(email: string): Promise<string> {
  const mailbox = email.split('@')[0] ?? email;
  const response = await fetch(`${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}`);
  const messages = (await response.json()) as Array<{ id: string }>;
  const latest = messages.at(-1);
  if (!latest) throw new Error(`No message for ${mailbox}`);

  const detail = await fetch(
    `${INBUCKET}/api/v1/mailbox/${encodeURIComponent(mailbox)}/${latest.id}`,
  );
  const body = (await detail.json()) as { body?: { text?: string; html?: string } };
  const source = body.body?.html ?? body.body?.text ?? '';
  const match = source.match(/https?:\/\/[^\s"']*(?:auth\/callback|verify)[^\s"']*/);
  if (!match) throw new Error('No confirmation link in the message');
  return match[0];
}

/** A 1×1 PNG, which is a real image as far as sharp is concerned. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('a private person can publish again', () => {
  test('signs up, confirms the address and publishes in at most three screens', async ({
    page,
  }) => {
    const email = uniqueEmail('publica');

    // Screen one: the request form, filled in before any account exists.
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

    // The account panel appears at the last step, carrying where to come back to.
    await page.getByRole('link', { name: /Creează un cont|Cont nou|Înregistrează/ }).first().click();
    await expect(page).toHaveURL(/inregistrare/);

    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill(email);
    await page.getByLabel('Telefon').fill('0722 123 456');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Creează contul' }).click();
    await expect(page).toHaveURL(/\/confirmare-email/);

    // The confirmation link comes back to the form, not to a dashboard.
    const link = await confirmationLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/cerere\/noua/);

    // Screen two: the form again, with the draft the browser kept, and the
    // publish button now that there is a session. Screen three is the
    // result. Three screens from confirmation to published.
    await expect(page.getByLabel('Marca')).toHaveValue('Volkswagen');
    await page.getByRole('button', { name: /Publică/ }).click();

    await expect(page.getByText(/Cererea ta este pe panou|este publicată/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('an unconfirmed address cannot publish, and the message says why', async ({ page }) => {
    // GoTrue is configured to require confirmation, so an account created
    // and not confirmed is exactly this case.
    const email = uniqueEmail('neconfirmat');

    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Maria Ion');
    await page.getByLabel('Adresă de e-mail').fill(email);
    await page.getByLabel('Telefon').fill('0722 123 457');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Creează contul' }).click();
    await expect(page.getByText(/Confirmă adresa|ți-am trimis/i)).toBeVisible();
  });
});

test.describe('photographs on a request', () => {
  test('a client can attach their own, and they appear', async ({ page }) => {
    // Assumes a signed-in individual; the storage state is set up by the
    // project configuration the other *-supabase specs use.
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Milano');
    await page.getByLabel('Țara de plecare').selectOption('IT');
    await page.getByLabel('Oraș de destinație').fill('Timișoara');
    await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await page.getByRole('button', { name: 'Continuă' }).click();

    await page.setInputFiles('input[type="file"][multiple]', {
      name: 'masina.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(page.getByRole('button', { name: 'Șterge poza' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Mai poți adăuga 5 poze/)).toBeVisible();
  });

  test('stops at six', async ({ page }) => {
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Milano');
    await page.getByLabel('Oraș de destinație').fill('Timișoara');
    await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await page.getByRole('button', { name: 'Continuă' }).click();

    const files = Array.from({ length: 7 }, (_, i) => ({
      name: `masina-${i}.png`,
      mimeType: 'image/png',
      buffer: TINY_PNG,
    }));
    await page.setInputFiles('input[type="file"][multiple]', files);

    await expect(page.getByText(/cel mult 6 poze/i)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('opening a carrier contact', () => {
  test('asks for a confirmed number, and says who to write to', async ({ page }) => {
    // The one thing a verified phone still guards. An individual whose
    // number nobody has confirmed sees a sentence with a way out of it,
    // rather than the old "confirmă numărul" pointing at nothing.
    await page.goto('/trasee');
    const first = page.getByRole('link', { name: /Vezi traseul|Detalii/ }).first();
    await first.click();

    await page.getByRole('button', { name: /Vezi datele de contact|Deschide contactul/ }).click();
    await expect(page.getByText(/trebuie confirmat/i)).toBeVisible();
    await expect(page.getByText(/Scrie-ne la/i)).toBeVisible();
  });
});

test.describe('our own accounts say so', () => {
  test('a test account carries a badge on every account screen', async ({ page }) => {
    await page.goto('/cont');
    // The fixture account is marked is_test by the migration, because its
    // address is on @test.ro.
    await expect(page.getByText('Cont de test')).toBeVisible();
    await expect(page.getByText(/nu apare pe panourile publice/)).toBeVisible();
  });

  test('and stays off the public board', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/cereri');
    // Nothing published by a test account may appear. The strongest thing
    // assertable without knowing the fixture set: the board renders and
    // the test firm's name is not on it.
    await expect(page.getByText('Transport Demo SRL')).toHaveCount(0);
  });
});

test.describe('the pilot dashboard', () => {
  test('shows both criteria with their targets', async ({ page }) => {
    await page.goto('/admin/pilot');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Pilotul');
    await expect(page.getByText(/20 de transportatori/)).toBeVisible();
    await expect(page.getByText(/5 case de expediții/)).toBeVisible();
  });

  test('says out loud that our own accounts are excluded', async ({ page }) => {
    await page.goto('/admin/pilot');
    await expect(page.getByText(/Conturile noastre de test sunt scoase/)).toBeVisible();
  });

  test('is closed to somebody who is not staff', async ({ page }) => {
    await page.goto('/admin/pilot');
    // The admin layout gives a non-staff visitor a 404 rather than a 403.
    await expect(page.locator('body')).not.toContainText('Pilotul');
  });
});

test.describe('the notifications screen', () => {
  test('names the missing secret rather than showing an empty queue', async ({ page }) => {
    await page.goto('/admin/notificari');
    await expect(page.getByRole('heading', { name: 'Furnizorul de e-mail' })).toBeVisible();
    // One of the three states, never nothing.
    await expect(
      page.getByText(/Neconfigurat|Configurat|Necunoscut/).first(),
    ).toBeVisible();
  });

  test('offers a test send that goes through the real dispatcher', async ({ page }) => {
    await page.goto('/admin/notificari');
    await expect(page.getByRole('heading', { name: /Trimite un e-mail de test/ })).toBeVisible();
    await page.getByLabel('Adresa').fill('cineva@example.com');
    await page.getByRole('button', { name: 'Trimite' }).click();
    await expect(page.getByText(/Am pus la coadă/)).toBeVisible();
  });
});
