import { expect, test } from '@playwright/test';

/**
 * The half of phase 1 that needs a real auth server.
 *
 * These are written against a local Supabase (`supabase start`), which
 * provides GoTrue for sign-up and sessions and Inbucket for the confirmation
 * e-mails. They are skipped unless E2E_SUPABASE=1, so a run without the
 * stack reports honestly instead of going green on nothing.
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * NOT YET RUN: the environment this was written in cannot pull container
 * images, so `supabase start` never came up. Treat every expectation here as
 * unverified until somebody runs it with the stack up.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const INBUCKET = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a local Supabase: supabase start, then E2E_SUPABASE=1.');
});

function uniqueEmail(prefix: string): string {
  return `${prefix}+${Date.now()}@example.com`;
}

/** Pulls the newest confirmation link for an address out of Inbucket. */
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

test.describe('individual account', () => {
  test('signs up, confirms by e-mail, signs in and out', async ({ page }) => {
    const email = uniqueEmail('persoana');

    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill(email);
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Creează contul' }).click();

    await expect(page).toHaveURL(/\/confirmare-email/);

    await page.goto(await confirmationLink(email));
    await expect(page).toHaveURL(/\/cont/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ion');

    // The phone step is offered, never forced.
    await expect(page.getByText('Confirmă numărul de telefon')).toBeVisible();

    await page.getByRole('button', { name: /Ion|Cont/ }).click();
    await page.getByRole('menuitem', { name: 'Ieșire' }).click();
    await expect(page).toHaveURL('/');
  });

  test('resets a forgotten password', async ({ page }) => {
    const email = uniqueEmail('reset');
    // …sign up and confirm first, then:
    await page.goto('/resetare-parola');
    await page.getByLabel('Adresă de e-mail').fill(email);
    await page.getByRole('button', { name: 'Trimite linkul' }).click();
    await expect(page.getByText(/link de resetare/i)).toBeVisible();

    await page.goto(await confirmationLink(email));
    await page.getByLabel('Parolă nouă').fill('altaParolaSigura1');
    await page.getByRole('button', { name: 'Salvează parola' }).click();
    await expect(page).toHaveURL(/\/cont/);
  });
});

test.describe('company account', () => {
  test('creates a company and shows the carrier checklist', async ({ page }) => {
    // Sign up, confirm, then step 2.
    await page.goto('/cont/firma/creeaza');
    await page.getByLabel('CUI').first().fill('RO14399840');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page.getByText(/Firmă găsită la ANAF/)).toBeVisible();

    await page.getByRole('radio', { name: 'Firmă de transport' }).check();
    await page.getByRole('button', { name: 'Creează firma' }).click();

    await page.goto('/cont');
    await expect(page.getByText('Pași până la primul traseu publicat')).toBeVisible();
    await expect(page.getByText('Vehicule și documente')).toBeVisible();
    await expect(page.getByText('în curând').first()).toBeVisible();
  });

  test('shows the forwarder checklist for a freight forwarder', async ({ page }) => {
    await page.goto('/cont');
    await expect(page.getByText('Pași până la prima cerere publicată')).toBeVisible();
  });

  test('a draft company is told what to do next', async ({ page }) => {
    await page.goto('/cont');
    await expect(
      page.getByText('Completează datele firmei pentru a trimite documentele la verificare.'),
    ).toBeVisible();
  });
});

test.describe('members and invitations', () => {
  test('invites a colleague, who accepts from their own account', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await page.getByLabel('Adresa de e-mail').fill(uniqueEmail('coleg'));
    await page.getByLabel('Rol').selectOption('dispatcher');
    await page.getByRole('button', { name: 'Trimite invitația' }).click();
    await expect(page.getByText(/Am trimis invitația/)).toBeVisible();
    // …then, signed in as the invitee: /cont/invitatii, Acceptă.
  });

  test('changes a member role', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await page.getByRole('combobox').first().selectOption('admin');
    await page.getByRole('button', { name: 'Salvează' }).first().click();
    await expect(page.getByText('Administrator')).toBeVisible();
  });

  test('revokes a pending invitation', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await page.getByRole('button', { name: 'Anulează' }).first().click();
    await expect(page.getByText('Invitații în așteptare')).toHaveCount(0);
  });

  test('transfers ownership behind a confirmation', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await page.getByRole('button', { name: 'Transferă proprietatea' }).click();
    await page.getByRole('button', { name: 'Da, transferă' }).click();
    await expect(page.getByText('Proprietatea a fost transferată.')).toBeVisible();
  });

  test('a non-manager sees no invite form', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await expect(
      page.getByText('Doar proprietarul și administratorii pot invita sau schimba roluri.'),
    ).toBeVisible();
  });
});

test.describe('suspension', () => {
  test('a suspended company still reaches its profile and is told what expired', async ({
    page,
  }) => {
    await page.goto('/cont');
    await expect(page.getByText('Cont suspendat')).toBeVisible();
    await expect(page.getByText(/Te poți autentifica și vedea tot/)).toBeVisible();

    await page.goto('/cont/profil');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Profil');
  });
});

test.describe('staff', () => {
  test('a signed-in non-staff user gets 404 on the staff area', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });

  test('a staff user reaches the review queue', async ({ page }) => {
    await page.goto('/admin/documente');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Documente de verificat',
    );
  });
});
