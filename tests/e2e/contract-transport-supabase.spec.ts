import { expect, test, type Page } from '@playwright/test';

/**
 * The transport contract, end to end, with two parties, a stranger and
 * the team.
 *
 * The carrier generates the contract on an order, opens it and downloads
 * it; both parties accept; a third company asks for it by id and gets the
 * same 404 as for an id that does not exist; the carrier changes the
 * firm's legal representative and generates again, and the first
 * version's PDF still says what it said.
 *
 *   supabase start && supabase functions serve contract-pdf
 *   E2E_SUPABASE=1 \
 *   E2E_CLIENT_EMAIL=…     E2E_CLIENT_PASSWORD=… \
 *   E2E_DISPATCHER_EMAIL=… E2E_DISPATCHER_PASSWORD=… \
 *   E2E_OUTSIDER_EMAIL=…   E2E_OUTSIDER_PASSWORD=… \
 *   pnpm test:e2e contract-transport-supabase
 *
 * The dispatcher manages the carrier on an order of the client's (the
 * fixture `faza-2-comanda-supabase.spec.ts` sets up); the outsider
 * manages a different, verified company.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance. Treat
 * every expectation as unverified until somebody runs it with the stack
 * up. What it asserts is covered without a browser by the CON block of
 * `supabase/tests/rls_test.sql` (who may generate, read and accept, one
 * acceptance per side, immutability, storage) and by
 * `tests/unit/contract-*.test.ts` (the PDF itself).
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const CLIENT = account('CLIENT');
const CARRIER = account('DISPATCHER');
const OUTSIDER = account('OUTSIDER');

function account(prefix: string) {
  return {
    email: process.env[`E2E_${prefix}_EMAIL`] ?? '',
    password: process.env[`E2E_${prefix}_PASSWORD`] ?? '',
    name: prefix,
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signIn(page: Page, who: ReturnType<typeof account>) {
  test.skip(who.email === '' || who.password === '', `Needs E2E_${who.name}_EMAIL and _PASSWORD.`);
  await page.context().clearCookies();
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

/** The PDF behind a link on the card, followed through the 60-second storage link. */
async function fetchPdf(page: Page, href: string) {
  const response = await page.request.get(href);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const body = await response.body();
  expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  return { response, body };
}

async function pdfText(body: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(body), disableFontFace: true });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    parts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  await task.destroy();
  return parts.join('\n');
}

let orderPath = '';
let firstVersionHref = '';

test('the carrier generates, opens and downloads the contract', async ({ page }) => {
  await signIn(page, CARRIER);
  await page.goto('/cont/transporturi');
  await page.locator('a[href^="/cont/transporturi/"]').first().click();
  await expect(page).toHaveURL(/\/cont\/transporturi\/[0-9a-f-]{36}/);
  orderPath = new URL(page.url()).pathname;

  const card = page.getByTestId('contract-card');
  const generate = card.getByRole('button', { name: 'Generează contractul' });
  if (await generate.isVisible()) {
    await generate.click();
    await expect(card.getByText(/Versiunea \d+ a fost generată/)).toBeVisible();
  }

  const preview = card.getByTestId('contract-preview');
  firstVersionHref = (await preview.getAttribute('href')) ?? '';
  expect(firstVersionHref).toMatch(/\/contract\/[0-9a-f-]{36}$/);

  const opened = await fetchPdf(page, firstVersionHref);
  expect(await pdfText(opened.body)).toContain('Contract de transport');

  const downloaded = await fetchPdf(page, `${firstVersionHref}?descarca=1`);
  expect(downloaded.response.headers()['content-disposition'] ?? '').toContain('attachment');
});

test('both parties accept, and each sees the other’s acceptance', async ({ page }) => {
  test.skip(orderPath === '', 'Needs the first test.');
  await signIn(page, CARRIER);
  await page.goto(`${orderPath}#contract`);
  let card = page.getByTestId('contract-card');
  const carrierAccept = card.getByTestId('contract-accept');
  if (await carrierAccept.isVisible()) {
    await carrierAccept.getByRole('checkbox').check();
    await carrierAccept.getByRole('button', { name: 'Accept contractul' }).click();
    await expect(card.getByText('Ai acceptat contractul.')).toBeVisible();
  }

  await signIn(page, CLIENT);
  await page.goto(`${orderPath}#contract`);
  card = page.getByTestId('contract-card');
  await expect(card.locator('dd[data-accepted="da"]').first()).toContainText('Semnat de');
  const clientAccept = card.getByTestId('contract-accept');
  await clientAccept.getByRole('checkbox').check();
  await clientAccept.getByRole('button', { name: 'Accept contractul' }).click();
  await expect(card.getByText('Ai acceptat contractul.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('contract-card').getByText('Contractul este încheiat.')).toBeVisible();
});

test('a third company cannot reach it by id', async ({ page }) => {
  test.skip(firstVersionHref === '', 'Needs the first test.');
  await signIn(page, OUTSIDER);
  const file = await page.request.get(firstVersionHref, { maxRedirects: 0 });
  expect(file.status()).toBe(404);
  const order = await page.goto(orderPath);
  expect(order?.status()).toBe(404);
});

test('a new version after a data change leaves the old one as it was', async ({ page }) => {
  test.skip(firstVersionHref === '', 'Needs the first test.');
  await signIn(page, CARRIER);

  const before = await pdfText((await fetchPdf(page, firstVersionHref)).body);

  const representative = `Reprezentant Probă ${Date.now()}`;
  await page.goto('/cont/firma');
  await page.getByLabel('Reprezentant legal').fill(representative);
  await page.getByRole('button', { name: /Salvează/ }).first().click();
  await expect(page.getByText(/salvat/i).first()).toBeVisible();

  await page.goto(`${orderPath}#contract`);
  const card = page.getByTestId('contract-card');
  await card.locator('details summary').click();
  await card.getByRole('button', { name: 'Generează o versiune nouă' }).click();
  await expect(card.getByText(/Versiunea \d+ a fost generată/)).toBeVisible();
  await page.reload();

  const latestHref = (await page.getByTestId('contract-preview').getAttribute('href')) ?? '';
  expect(latestHref).not.toBe(firstVersionHref);
  expect(await pdfText((await fetchPdf(page, latestHref)).body)).toContain(representative);

  const after = await pdfText((await fetchPdf(page, firstVersionHref)).body);
  expect(after).not.toContain(representative);
  // The old version only gains the notice that a newer one exists.
  expect(after).toContain('Versiune înlocuită');
  expect(before.replace(/\s+/g, ' ')).toContain('Contract de transport');
});
