import { expect, test, type Browser, type Page } from '@playwright/test';
import { adminClient, cleanup, createUser, hasSupabaseE2E, type TestUser } from './support/supabase-admin';

/*
 * Phase 1 exit criteria, end to end, against a real Supabase project:
 * a carrier signs up, invites a dispatcher, registers a platform, uploads
 * its papers and is verified by a reviewer without anyone touching the
 * database; an expired RCA takes the platform off and an expired CMR
 * suspends the company, and approved renewals bring both back.
 *
 * Only the nightly sweep is triggered directly (with the service role, as
 * pg_cron does), and the expiry dates are moved into the past to simulate
 * time passing. Everything else goes through the screens.
 */

test.describe.configure({ mode: 'serial' });
test.skip(!hasSupabaseE2E(), 'Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY');
test.setTimeout(240_000);

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const companyName = `E2E Transport ${runId} SRL`;
const cui = String(90_000_000 + Math.floor(Math.random() * 9_999_999));
const plate = `E2E${Math.floor(Math.random() * 900 + 100)}${runId.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X')}`;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

const admin = hasSupabaseE2E() ? adminClient() : null;
const users: Record<'owner' | 'dispatcher' | 'staff', TestUser | null> = { owner: null, dispatcher: null, staff: null };
let companyId = '';
let vehicleId = '';

async function signIn(browser: Browser, user: TestUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Parolă').fill(user.password);
  await page.getByRole('button', { name: 'Intră în cont' }).click();
  await expect(page).toHaveURL(/\/cont$/);
  return page;
}

async function upload(page: Page, kindLabel: string, fileName: string) {
  // Start from a fresh page, so the confirmation below is this upload's and
  // not the previous one's.
  await page.reload();
  await page.getByLabel('Tipul documentului').selectOption({ label: kindLabel });
  await page.getByLabel('Fișier').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Încarcă documentul' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Document încărcat' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Încarcă documentul' })).toBeEnabled();
}

async function approveAll(staff: Page, validUntil: string) {
  await staff.goto('/admin/documente');
  const cards = staff.getByRole('listitem').filter({ hasText: companyName });
  // An approved document leaves the queue: that is the confirmation.
  for (let remaining = await cards.count(); remaining > 0; remaining--) {
    const card = cards.first();
    const date = card.getByLabel('Valabil până la');
    if (await date.count()) await date.fill(validUntil);
    await card.getByRole('button', { name: 'Aprobă' }).click();
    await expect(cards).toHaveCount(remaining - 1, { timeout: 30_000 });
  }
}

async function sweep() {
  const { error } = await admin!.rpc('run_compliance_sweep');
  if (error) throw new Error(error.message);
}

test.beforeAll(async ({}, testInfo) => {
  // Writes data: runs once, on the desktop project.
  test.skip(testInfo.project.name !== 'desktop', 'Runs on desktop only');
  users.owner = await createUser(admin!, runId, 'owner');
  users.dispatcher = await createUser(admin!, runId, 'dispatcher');
  users.staff = await createUser(admin!, runId, 'staff');
  const { error } = await admin!.rpc('set_platform_staff', {
    p_user_id: users.staff.id,
    p_role: 'admin',
    p_reason: `e2e ${runId}`,
  });
  if (error) throw new Error(`set_platform_staff: ${error.message}`);
});

test.afterAll(async ({}, testInfo) => {
  if (!admin || testInfo.project.name !== 'desktop') return;
  // Staff access is revoked through the RPC so the audit trail stays whole.
  if (users.staff) {
    await admin.rpc('set_platform_staff', { p_user_id: users.staff.id, p_role: null as unknown as 'admin', p_reason: `e2e ${runId} cleanup` });
  }
  await cleanup(admin, Object.values(users).filter((u): u is TestUser => u !== null), companyId ? [companyId] : []);
});

test('a carrier registers its company', async ({ browser }) => {
  const owner = await signIn(browser, users.owner!);
  await owner.getByRole('link', { name: 'Înregistrează firma' }).click();
  await owner.getByLabel('CUI').fill(cui);
  await owner.getByLabel('Denumirea firmei').fill(companyName);
  await owner.getByLabel('Tipul firmei').selectOption('transport');
  await owner.getByRole('button', { name: 'Înregistrează firma' }).click();

  await expect(owner.getByRole('heading', { level: 1, name: companyName })).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByText('În completare')).toBeVisible();
  companyId = owner.url().split('/cont/firma/')[1]!.split('/')[0]!;
});

test('the owner invites a dispatcher, who accepts', async ({ browser }) => {
  const owner = await signIn(browser, users.owner!);
  await owner.goto(`/cont/firma/${companyId}`);
  await owner.getByLabel('E-mail', { exact: true }).fill(users.dispatcher!.email);
  await owner.getByLabel('Rol').selectOption('dispatcher');
  await owner.getByRole('button', { name: 'Trimite invitația' }).click();
  await expect(owner.getByText('Invitație trimisă')).toBeVisible();

  const dispatcher = await signIn(browser, users.dispatcher!);
  await expect(dispatcher.getByText(companyName)).toBeVisible();
  await dispatcher.getByRole('button', { name: 'Accept' }).click();
  // The invitation leaves the page and the company joins "Firmele mele".
  await expect(dispatcher.getByRole('link', { name: new RegExp(`${companyName}.*Dispecer`) })).toBeVisible({ timeout: 15_000 });
  await expect(dispatcher.getByRole('button', { name: 'Accept' })).toHaveCount(0);
});

test('the dispatcher registers a platform with its dimensions and routes', async ({ browser }) => {
  const dispatcher = await signIn(browser, users.dispatcher!);
  await dispatcher.goto(`/cont/firma/${companyId}/flota`);
  await dispatcher.getByLabel('Număr de înmatriculare').fill(plate);
  await dispatcher.getByLabel('Tip').selectOption('platforma_auto');
  await dispatcher.getByLabel('Lungime (m)').fill('19,5');
  await dispatcher.getByLabel('Masă maximă (kg)').fill('40000');
  await dispatcher.getByRole('button', { name: 'Adaugă vehiculul' }).click();

  await expect(dispatcher).toHaveURL(/\/flota\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  vehicleId = dispatcher.url().split('/flota/')[1]!;
  await expect(dispatcher.getByText('Nu poate apărea pe bursă')).toBeVisible();

  await dispatcher.getByLabel('Din țara').selectOption('DE');
  await dispatcher.getByLabel('Spre țara').selectOption('RO');
  await dispatcher.getByRole('button', { name: 'Adaugă ruta' }).click();
  await expect(dispatcher.getByText('Germania → România')).toBeVisible();
});

test('the papers are uploaded and a reviewer verifies the company and the platform', async ({ browser }) => {
  const owner = await signIn(browser, users.owner!);
  await owner.goto(`/cont/firma/${companyId}/documente`);
  await upload(owner, 'Licență comunitară', 'licenta.pdf');
  await upload(owner, 'Certificat de înregistrare (ONRC)', 'onrc.pdf');
  await upload(owner, 'Asigurare CMR', 'cmr.pdf');

  await owner.goto(`/cont/firma/${companyId}/flota/${vehicleId}`);
  await upload(owner, 'ITP (inspecție tehnică periodică)', 'itp.pdf');
  await upload(owner, 'Poliță RCA', 'rca.pdf');
  await upload(owner, 'Copie conformă ARR', 'copie.pdf');

  const staff = await signIn(browser, users.staff!);
  await approveAll(staff, '2027-12-31');

  await owner.goto(`/cont/firma/${companyId}`);
  await expect(owner.getByText('Verificată')).toBeVisible();
  await owner.goto(`/cont/firma/${companyId}/flota/${vehicleId}`);
  await expect(owner.getByText('Poate apărea pe bursă')).toBeVisible();
});

test('an expired RCA takes the platform off; the approved renewal brings it back', async ({ browser }) => {
  await admin!
    .from('documents')
    .update({ valid_until: '2020-01-01' })
    .eq('vehicle_id', vehicleId)
    .eq('kind', 'rca')
    .eq('status', 'approved');
  await sweep();

  const owner = await signIn(browser, users.owner!);
  await owner.goto(`/cont/firma/${companyId}/flota/${vehicleId}`);
  await expect(owner.getByText('Nu poate apărea pe bursă')).toBeVisible();
  await upload(owner, 'Poliță RCA', 'rca-2028.pdf');

  const staff = await signIn(browser, users.staff!);
  await approveAll(staff, '2028-06-30');

  await owner.reload();
  await expect(owner.getByText('Poate apărea pe bursă')).toBeVisible();
});

test('an expired CMR suspends the company; the approved renewal reactivates it', async ({ browser }) => {
  await admin!
    .from('documents')
    .update({ valid_until: '2020-01-01' })
    .eq('company_id', companyId)
    .eq('kind', 'asigurare_cmr')
    .eq('status', 'approved');
  await sweep();

  const owner = await signIn(browser, users.owner!);
  await owner.goto(`/cont/firma/${companyId}`);
  await expect(owner.getByText('Suspendată')).toBeVisible();
  await expect(owner.getByText('Documente obligatorii expirate sau lipsă', { exact: false })).toBeVisible();

  await owner.goto(`/cont/firma/${companyId}/documente`);
  await upload(owner, 'Asigurare CMR', 'cmr-2028.pdf');

  const staff = await signIn(browser, users.staff!);
  await approveAll(staff, '2028-06-30');

  await owner.goto(`/cont/firma/${companyId}`);
  await expect(owner.getByText('Verificată')).toBeVisible();
});

test('staff management lists the reviewer; a non-staff user cannot open admin pages', async ({ browser }) => {
  const staff = await signIn(browser, users.staff!);
  await staff.goto('/admin/personal');
  await expect(staff.getByText(users.staff!.email)).toBeVisible();

  const owner = await signIn(browser, users.owner!);
  await owner.goto('/admin/documente');
  await expect(owner).toHaveURL(/\/cont$/);
});
