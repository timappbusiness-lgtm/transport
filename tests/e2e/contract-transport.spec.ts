import { expect, test, type Page } from '@playwright/test';

/**
 * The „Contract de transport" card and the staff record, drawn by
 * `/proba/ecrane` from samples: the longest names, three versions, each
 * reader. What the database decides — who may generate, view, accept —
 * is the CON block of `supabase/tests/rls_test.sql`; the whole journey
 * with two real accounts is `contract-transport-supabase.spec.ts`.
 *
 * Runs at 1280 and at 390 (the two Playwright projects).
 */

const ORDER_ID = '00000000-0000-4000-8000-000000000950';
const LONG_PERSON = 'Maria-Alexandra Constantinescu-Dumitrescu, dispecerat Ardeal';

async function open(page: Page, query: string) {
  await page.goto(`/proba/ecrane?sectiune=${query}`);
  await expect(page.locator('[data-proba-sectiune]')).toBeVisible();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('the contract card', () => {
  test('shows the carrier’s acceptance to the client, and the client’s own to give', async ({ page }) => {
    await open(page, 'contract');
    const card = page.getByTestId('contract-card');
    await expect(card.getByRole('heading', { name: 'Contract de transport' })).toBeVisible();

    await expect(card.getByText('Versiunea 3 · CT-2026-0000950A').first()).toBeVisible();
    const accepted = card.locator('dd[data-accepted="da"]').first();
    await expect(accepted).toContainText(`Semnat de ${LONG_PERSON} la`);
    await expect(card.locator('dd[data-accepted="nu"]').first()).toHaveText('Neacceptat încă');
    await expect(card.getByText('nu semnătură electronică calificată')).toBeVisible();

    const accept = card.getByTestId('contract-accept');
    await expect(accept).toContainText('adresa IP');
    await expect(accept.getByRole('checkbox', { name: /Am citit versiunea 3/ })).toHaveAttribute('required', '');
    await expect(accept.getByRole('button', { name: 'Accept contractul' })).toBeVisible();
  });

  test('links the PDF, to open and to download, without prefetching it', async ({ page }) => {
    await open(page, 'contract');
    const card = page.getByTestId('contract-card');
    const preview = card.getByTestId('contract-preview');
    const download = card.getByTestId('contract-download');
    const base = `/cont/transporturi/${ORDER_ID}/contract/00000000-0000-4000-8000-000000000963`;
    await expect(preview).toHaveAttribute('href', base);
    await expect(preview).toHaveAttribute('target', '_blank');
    await expect(download).toHaveAttribute('href', `${base}?descarca=1`);
  });

  test('keeps at most three primary controls in view: open, download, accept', async ({ page }) => {
    await open(page, 'contract');
    const card = page.getByTestId('contract-card');
    const outsideDetails = card.locator(':is(a, button):not(details *)');
    expect(await outsideDetails.count()).toBeLessThanOrEqual(3);
  });

  test('keeps earlier versions one click away, still downloadable', async ({ page }) => {
    await open(page, 'contract');
    const card = page.getByTestId('contract-card');
    const history = card.locator('details');
    await expect(history.locator('summary')).toHaveText('Versiuni anterioare (2)');
    await expect(history.getByText('Versiunea 1 · CT-2026-0000950A')).toBeHidden();
    await history.locator('summary').click();
    await expect(history.getByText('Versiunea 1 · CT-2026-0000950A')).toBeVisible();
    await expect(history.getByRole('link', { name: 'Descarcă PDF' })).toHaveCount(2);
  });

  test('lists every version in the order’s documents', async ({ page }) => {
    await open(page, 'contract');
    const docs = page.locator('#dovezi').locator('xpath=..');
    await expect(docs.getByText('Contract de transport, versiunea 3')).toBeVisible();
    await expect(docs.getByText('Contract de transport, versiunea 1')).toBeVisible();
    await expect(docs.getByText(/acceptat de transportator/).first()).toBeVisible();
  });

  test('offers only „Generează" before anything exists', async ({ page }) => {
    await open(page, 'contract&stare=gol');
    const card = page.getByTestId('contract-card');
    await expect(card.getByText('Contractul nu a fost generat încă.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Generează contractul' })).toBeVisible();
    await expect(card.getByTestId('contract-preview')).toHaveCount(0);
  });

  test('says the contract is concluded once both accepted', async ({ page }) => {
    await open(page, 'contract&stare=ambele');
    const card = page.getByTestId('contract-card');
    await expect(card.getByText('Acceptat de ambele părți. Contractul este încheiat.')).toBeVisible();
    await expect(card.getByTestId('contract-accept')).toHaveCount(0);
  });

  test('never offers staff an acceptance', async ({ page }) => {
    await open(page, 'contract&stare=echipa');
    const card = page.getByTestId('contract-card');
    await expect(card.getByTestId('contract-accept')).toHaveCount(0);
    await expect(card.getByText(/nu îl acceptă în numele părților/)).toBeVisible();
    await card.locator('details summary').click();
    await expect(card.getByRole('button', { name: 'Generează o versiune nouă' })).toBeVisible();
  });

  test('says so, beside the card, when the PDF could not be drawn', async ({ page }) => {
    await open(page, 'contract&stare=indisponibil');
    await expect(page.getByTestId('contract-card').getByRole('status')).toContainText(
      'Contractul nu a putut fi deschis acum',
    );
  });

  test('fits a phone: nothing pushes the page sideways', async ({ page }) => {
    for (const state of ['contract', 'contract&stare=ambele', 'admin-contract']) {
      await open(page, state);
      const details = page.locator('[data-testid="contract-card"] details');
      if ((await details.count()) > 0) await details.locator('summary').click();
      await noSidewaysScroll(page);
    }
  });
});

test.describe('the staff record', () => {
  test('shows every version with the acceptance record: IP, browser, account', async ({ page }) => {
    await open(page, 'admin-contract');
    const record = page.getByTestId('admin-contracts');
    await expect(record.getByText('Versiunea 3 · CT-2026-0000950A')).toBeVisible();
    await expect(record.getByText('203.0.113.7').first()).toBeVisible();
    await expect(record.getByText(/Android 14/).first()).toBeVisible();
    await noSidewaysScroll(page);
    // Regression: as a table at 390 the firm's name broke one letter per
    // line. Every value now has at least the width of a short word.
    const narrowest = await record.locator('dd').evaluateAll((cells) =>
      Math.min(...cells.map((cell) => cell.getBoundingClientRect().width)),
    );
    expect(narrowest).toBeGreaterThan(120);
  });
});
