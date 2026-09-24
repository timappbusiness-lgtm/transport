import { expect, test, type Page } from '@playwright/test';

/**
 * The fast way in, end to end, against a real database.
 *
 * One story per role, told in order, because that is what each one is:
 *
 *   - a client publishes a request, and the clock runs from the account
 *     step to the published request: under a minute;
 *   - a new carrier signs up with four fields and is on the board in
 *     under a minute, browses, tries to send an offer and is walked —
 *     firm, vehicle, documents — to the one documents screen, which says
 *     why it is asking; uploads every document in one pass, the last one
 *     from the gallery; submits; a member of staff approves; the offer
 *     goes;
 *   - the same for a forwarder, who has no vehicles to add.
 *
 *   supabase start && supabase functions serve
 *   E2E_SUPABASE=1 \
 *   E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… \
 *   pnpm test:e2e tests/e2e/inscriere-rapida-supabase.spec.ts
 *
 * The accounts are made here, with the confirmation e-mail read from the
 * local mail catcher. Staff must be a platform admin.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance, the same
 * as every other `-supabase` spec. The rules each step leans on are
 * checked without a browser — the gates in `tests/unit/carrier-journey`,
 * the checklist and the reading in `tests/unit/document-reading`, the
 * uploads in `tests/unit/uploads` and, in a real browser without a
 * database, `tests/e2e/incarcari.spec.ts` and `inscriere-rapida.spec.ts`.
 * The database rules themselves did not change and keep their checks in
 * `supabase/tests/rls_test.sql`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const INBUCKET = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const STAFF = { email: process.env.E2E_STAFF_EMAIL ?? '', password: process.env.E2E_STAFF_PASSWORD ?? '' };
const FUTURE = '2031-06-30';
const MINUTE = 60_000;

/** A photograph-shaped file: the documents screen reads the type, not the pixels. */
const PAPER = { name: 'act.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360f8cfc0f01f0005000201a5b1d6f10000000049454e44ae426082', 'hex') };

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

let requestUrl = '';

function unique(prefix: string): string {
  return `${prefix}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

/** A CUI whose control digit is right and that nobody has used. */
function freshCui(): string {
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  const base = String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8);
  const digits = base.padStart(9, '0').split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * key[index]!, 0);
  return `${base}${((sum * 10) % 11) % 10}`;
}

async function confirmFromMail(page: Page, email: string) {
  const mailbox = encodeURIComponent(email.split('@')[0]!);
  let link: string | undefined;
  for (let attempt = 0; attempt < 20 && link === undefined; attempt += 1) {
    const list = (await (await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}`)).json()) as { id: string }[];
    if (list.length > 0) {
      const message = (await (await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}/${list.at(-1)!.id}`)).json()) as {
        body?: { html?: string; text?: string };
      };
      link = (message.body?.html ?? message.body?.text ?? '').match(/https?:\/\/[^\s"']*(?:auth\/callback|verify)[^\s"']*/)?.[0];
    }
    if (link === undefined) await page.waitForTimeout(500);
  }
  expect(link, 'the confirmation e-mail').toBeTruthy();
  await page.goto(link!.replace(/&amp;/g, '&'));
}

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/autentificare');
  await page.getByLabel('Adresă de e-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: 'Intră în cont' }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

/** Four fields and the terms; the board next. */
async function signUpCompany(page: Page, email: string) {
  await page.goto('/inregistrare/firma');
  await page.getByLabel('Nume și prenume').fill('Mihai Transport');
  await page.getByLabel('Adresă de e-mail de serviciu').fill(email);
  await page.getByLabel('Telefon').fill('0722 123 456');
  await page.getByLabel('Parolă').fill('parolaSigura1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuă' }).click();
  await expect(page).toHaveURL(/\/cereri\?.*confirma=/);
  await expect(page.locator('[data-confirm-email]')).toBeVisible();
  await confirmFromMail(page, email);
  await expect(page).toHaveURL(/\/cereri/);
}

/** The firm: the CUI first, and by hand whatever ANAF could not say. */
async function addCompany(page: Page, type: 'Firmă de transport' | 'Casă de expediții', name: string) {
  await expect(page.locator('[data-journey-because]')).toBeVisible();
  await page.getByLabel('CUI').fill(freshCui());
  // ANAF answers, or says it could not: either way the form goes on.
  await expect(page.locator('[data-anaf-state]')).not.toHaveAttribute('data-anaf-state', 'looking', { timeout: 15_000 });
  const legal = page.getByLabel('Denumire');
  if ((await legal.inputValue()) === '') await legal.fill(name);
  await page.getByLabel(type).check();
  const county = page.getByLabel('Județ');
  if ((await county.inputValue()) === '') await county.fill('Cluj');
  const city = page.getByLabel('Localitate');
  if ((await city.inputValue()) === '') await city.fill('Cluj-Napoca');
  await page.getByRole('button', { name: 'Salvează firma' }).click();
}

/**
 * Every blocking document, in one pass: each row's own file button for
 * all but the last, which goes through the gallery and is filed after
 * the carrier confirms what it is.
 */
async function uploadEverything(page: Page) {
  await expect(page.locator('[data-documents-screen]')).toBeVisible();
  const missing = () =>
    page.locator('[data-requirement][data-state="missing"]').filter({ hasText: 'Obligatoriu' });

  while ((await missing().count()) > 1) {
    const row = missing().first();
    const kind = await row.getAttribute('data-requirement');
    const vehicle = await row.getAttribute('data-vehicle');
    await row.locator('[data-file-input]').setInputFiles(PAPER);
    const same = page.locator(`[data-requirement="${kind}"][data-vehicle="${vehicle}"]`);
    // The date is the carrier's to confirm, whatever the model read.
    const confirm = same.locator('[data-date-confirm]');
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    await confirm.getByLabel('Valabil până la').fill(FUTURE);
    await confirm.getByRole('button', { name: 'Confirmă data' }).click();
    await expect(same.locator('[data-date-confirmed]')).toBeVisible({ timeout: 15_000 });
  }

  const last = missing().first();
  const kind = (await last.getAttribute('data-requirement'))!;
  const vehicle = (await last.getAttribute('data-vehicle')) ?? '';
  await page.locator('[data-gallery-input]').setInputFiles({ ...PAPER, name: 'din-galerie.png' });
  const item = page.locator('[data-gallery-item]').first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.getByLabel('Ce act este').selectOption(kind);
  if (vehicle !== '') await item.getByLabel('Pentru vehiculul').selectOption(vehicle);
  await item.getByLabel('Valabil până la').fill(FUTURE);
  await item.getByRole('button', { name: 'Confirmă' }).click();
  await expect(page.locator('[data-gallery-item]')).toHaveCount(0, { timeout: 30_000 });

  await expect(missing()).toHaveCount(0);
  await expect(page.locator('[data-documents-progress]')).toContainText(/(\d+) din \1 încărcate/);
}

async function approveAsStaff(page: Page, firm: string) {
  test.skip(STAFF.email === '' || STAFF.password === '', 'Needs E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD.');
  await signIn(page, STAFF);
  await page.goto('/admin/documente');
  const ours = () => page.locator('li').filter({ hasText: firm }).filter({ has: page.getByRole('button', { name: 'Aprobă' }) });
  while ((await ours().count()) > 0) {
    const doc = ours().first();
    // The file itself is one click away for the reviewer.
    await expect(doc.locator('[data-document-file]')).toBeVisible();
    const until = doc.getByLabel('Valabil până la');
    if ((await until.count()) > 0 && (await until.inputValue()) === '') await until.fill(FUTURE);
    await doc.getByRole('button', { name: 'Aprobă' }).click();
    await expect(page.getByText('Document aprobat.')).toBeVisible();
    await page.reload();
  }
  const company = page.locator('li').filter({ hasText: firm }).filter({ has: page.getByRole('button', { name: 'Aprobă firma' }) });
  if ((await company.count()) > 0) {
    await company.getByRole('button', { name: 'Aprobă firma' }).click();
    await expect(page.getByText('Firmă aprobată.')).toBeVisible();
  }
  await page.context().clearCookies();
}

async function sendOffer(page: Page) {
  await page.goto(requestUrl);
  await page.getByRole('button', { name: 'Trimite ofertă' }).click();
  await page.getByLabel('Preț').fill('2400');
  await page.getByLabel('Ridic pe').fill('2031-06-01');
  await page.getByLabel('Livrez pe').fill('2031-06-03');
  const vehicle = page.getByLabel(/Vehiculul care face/);
  if ((await vehicle.count()) > 0) await vehicle.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Trimite oferta' }).click();
  await expect(page.getByRole('button', { name: 'Retrage' }).first()).toBeVisible();
}

test('a client publishes in under a minute from the account step', async ({ page }) => {
  const email = unique('client');
  await page.goto('/cerere/noua');
  await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
  await page.getByLabel('Oraș de destinație').fill('București');
  await page.getByLabel('Poate fi încărcat de la').fill('2031-05-30');
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByLabel('Marca').fill('Dacia');
  await page.getByLabel('Modelul').fill('Logan');
  await page.getByLabel('Anul fabricației').fill('2016');
  await page.getByRole('button', { name: 'Continuă' }).click();
  await page.getByRole('button', { name: 'Continuă' }).click();

  // Nothing about the person on this step: the account form asks, once.
  await expect(page.locator('[data-contact-from-account]')).toBeVisible();
  const started = Date.now();
  await page.locator('[data-account-step="needed"]').getByRole('link', { name: 'Fă-ți cont gratuit' }).click();
  await page.getByLabel('Nume și prenume').fill('Ana Pop');
  await page.getByLabel('Adresă de e-mail').fill(email);
  await page.getByLabel('Telefon').fill('0722 123 456');
  await page.getByLabel('Parolă').fill('parolaSigura1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Creează contul' }).click();
  await confirmFromMail(page, email);

  await expect(page).toHaveURL(/\/cerere\/noua\?pas=contact/);
  // The number typed on the account form, not asked again.
  await expect(page.getByLabel('Telefon')).toHaveValue(/722/);
  await page.getByRole('button', { name: 'Publică cererea' }).click();
  await expect(page.locator('[data-publish-result]')).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - started).toBeLessThan(MINUTE);

  await page.goto('/cont/cereri');
  await page.getByRole('link', { name: /Dacia Logan/ }).first().click();
  const id = page.url().match(/[0-9a-f-]{36}/)?.[0];
  expect(id).toBeTruthy();
  requestUrl = `/cereri/${id}`;
});

test('a new carrier: board in a minute, documents when the offer asks, offer after approval', async ({ page, browser }) => {
  test.skip(requestUrl === '', 'Needs the request the client test publishes.');
  const email = unique('transportator');
  const firm = `Transport Rapid ${Date.now()}`;

  const started = Date.now();
  await signUpCompany(page, email);
  await expect(page.locator('[data-journey-banner]')).toBeVisible();
  await expect(page.locator('[data-journey-banner]')).toContainText('Poți trimite oferte după ce îți verificăm actele');
  expect(Date.now() - started).toBeLessThan(MINUTE);

  // Browsing is free.
  await expect(page.getByRole('link', { name: 'Vezi cererea' }).first()).toBeVisible();

  // The offer is where the paperwork is asked for.
  await page.goto(requestUrl);
  const gate = page.locator('[data-action-gate]');
  await expect(gate).toHaveAttribute('data-stage', 'no_company');
  await expect(page.getByLabel('Preț')).toHaveCount(0);
  await gate.getByRole('link').first().click();

  await addCompany(page, 'Firmă de transport', firm);
  await expect(page).toHaveURL(/\/cont\/firma\/flota/);
  await page.getByLabel('Număr de înmatriculare').fill(`CJ ${String(Date.now()).slice(-2)} RAP`);
  await page.getByRole('button', { name: 'Adaugă vehiculul' }).click();
  await page.getByRole('link', { name: 'Gata, mergi mai departe' }).click();

  await expect(page).toHaveURL(/\/cont\/firma\/documente/);
  // Why it is asking, in one line, and why each document, in one line.
  await expect(page.locator('[data-journey-because]')).toContainText('Ca să trimiți oferta');
  await expect(page.locator('[data-requirement="copie_conforma"]').first()).toContainText('3,5 t');
  await uploadEverything(page);
  await page.getByRole('button', { name: 'Trimite la verificare' }).click();
  await expect(page.getByText('Documentele sunt în verificare')).toBeVisible();
  await page.context().clearCookies();

  const staff = await (await browser.newContext()).newPage();
  await approveAsStaff(staff, firm);

  await signIn(page, { email, password: 'parolaSigura1' });
  await sendOffer(page);
});

test('a new forwarder: the same, without vehicles', async ({ page, browser }) => {
  test.skip(requestUrl === '', 'Needs the request the client test publishes.');
  const email = unique('expeditor');
  const firm = `Expediții Rapide ${Date.now()}`;

  await signUpCompany(page, email);
  await page.goto(requestUrl);
  await page.locator('[data-action-gate]').getByRole('link').first().click();
  await addCompany(page, 'Casă de expediții', firm);

  // No fleet step: straight to the documents.
  await expect(page).toHaveURL(/\/cont\/firma\/documente/);
  await expect(page.locator('[data-requirement][data-vehicle]:not([data-vehicle=""])')).toHaveCount(0);
  await uploadEverything(page);
  await page.getByRole('button', { name: 'Trimite la verificare' }).click();
  await expect(page.getByText('Documentele sunt în verificare')).toBeVisible();
  await page.context().clearCookies();

  const staff = await (await browser.newContext()).newPage();
  await approveAsStaff(staff, firm);

  await signIn(page, { email, password: 'parolaSigura1' });
  await sendOffer(page);
});

test('a document upload that fails keeps the file and retries without a second row', async ({ page }) => {
  const email = unique('reincercare');
  await signUpCompany(page, email);
  await page.goto('/cont/firma/creeaza?tip=expeditie');
  await addCompany(page, 'Casă de expediții', `Reîncercare ${Date.now()}`);
  await expect(page.locator('[data-documents-screen]')).toBeVisible();

  let failed = false;
  await page.route('**/storage/v1/object/documents/**', async (route) => {
    if (!failed) {
      failed = true;
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  const row = page.locator('[data-requirement][data-state="missing"]').first();
  const kind = await row.getAttribute('data-requirement');
  await row.locator('[data-file-input]').setInputFiles(PAPER);
  const line = page.locator(`[data-requirement="${kind}"] [data-upload-status="failed"]`);
  await expect(line).toContainText('Conexiunea s-a întrerupt');

  // A reload between the failure and the retry: the file is still chosen.
  await page.reload();
  await expect(page.locator(`[data-requirement="${kind}"]`)).toHaveAttribute('data-state', 'in_review', { timeout: 30_000 });
  await expect(page.locator(`[data-requirement="${kind}"] [data-date-confirm]`)).toHaveCount(1);
});
