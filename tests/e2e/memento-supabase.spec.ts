import { expect, test, type Page } from '@playwright/test';
import { settled } from './settled';

/**
 * Memento expirări auto, end to end, against a real database.
 *
 *   supabase start && supabase functions serve
 *   E2E_SUPABASE=1 \
 *   E2E_CARRIER_EMAIL=… E2E_CARRIER_PASSWORD=… \
 *   pnpm test:e2e tests/e2e/memento-supabase.spec.ts
 *
 * Two stories:
 *
 *   - a signed-out person types a plate and two dates on the public page,
 *     makes the account at the end (confirmation e-mail read from the
 *     local mail catcher), comes back signed in to the same step with
 *     everything there, saves, and finds the car and its dates in the
 *     account — then renews one, and the old date is in the history;
 *   - a carrier whose firm is verified adds the plate of one of its own
 *     vehicles to the memento with every date valid for a year: the
 *     documents screen and the fleet read exactly as they did before.
 *     Declared is not verified.
 *
 * The carrier must have a verified firm with at least one vehicle. Without
 * it the second story skips rather than fails.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance, the same as
 * every other `-supabase` spec. Every rule asserted here is also checked
 * without a browser — block MEM of `supabase/tests/rls_test.sql` (access,
 * separation from compliance, verification, matching and the public views,
 * the reminder days, renewal history, export, deletion, limits) and, in a
 * browser without a database, `memento.spec.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const INBUCKET = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const CARRIER = { email: process.env.E2E_CARRIER_EMAIL ?? '', password: process.env.E2E_CARRIER_PASSWORD ?? '' };

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

function unique(prefix: string): string {
  return `${prefix}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function ro(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
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

test('a signed-out person starts a memento, makes the account at the end, and nothing is lost', async ({ page }) => {
  const email = unique('memento');
  const plate = `B${Math.floor(100 + Math.random() * 899)}MEM`;
  const rca = dayFromToday(45);
  const itp = dayFromToday(210);

  await page.goto('/memento-expirari');
  await settled(page);
  await page.getByLabel('Număr de înmatriculare').fill(plate);
  await page.getByLabel(/^Marca/).fill('Dacia');
  await page.locator('[data-starter-next]').click();
  await page.locator('[data-starter-date="rca"]').fill(rca);
  await page.locator('[data-starter-date="itp"]').fill(itp);
  await page.locator('[data-starter-next]').click();
  await expect(page.locator('[data-account-step="needed"]')).toBeVisible();

  // The account last: name, e-mail, phone, password, the terms.
  await page.locator('[data-starter-signup]').click();
  await page.getByLabel('Nume și prenume').fill('Ana Memento');
  await page.getByLabel('Adresă de e-mail').fill(email);
  await page.getByLabel('Telefon').fill('0722 123 456');
  await page.getByLabel('Parolă').fill('parolaSigura1');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Creează contul' }).click();
  await confirmFromMail(page, email);

  // Back on the step it left, signed in, with the draft.
  await expect(page).toHaveURL(/\/memento-expirari\?pas=cont/);
  await expect(page.locator('[data-account-step="done"]')).toBeVisible();
  await expect(page.locator('[data-starter-summary]')).toContainText(`${plate}, 2 date`);
  await page.locator('[data-starter-save]').click();

  await expect(page).toHaveURL(/\/cont\/memento/);
  const car = page.locator(`[data-memento-vehicle="${plate}"]`);
  await expect(car.locator('[data-memento-entry="rca"]')).toContainText(ro(rca));
  await expect(car.locator('[data-memento-entry="itp"]')).toContainText(ro(itp));

  // „Am reînnoit": the new date, and the old one in the history.
  const renewed = dayFromToday(410);
  await car.locator('[data-memento-entry="rca"]').getByRole('button', { name: 'Am reînnoit' }).click();
  await car.locator('[data-memento-entry="rca"]').getByLabel(/Data nouă/).fill(renewed);
  await car.locator('[data-memento-entry="rca"]').getByRole('button', { name: 'Salvează data nouă' }).click();
  await expect(car.getByText(`RCA: data nouă este ${ro(renewed)}.`)).toBeVisible();
  await car.getByRole('link', { name: new RegExp(plate.slice(0, 1)) }).first().click();
  await page.locator('[data-memento-entry="rca"] summary', { hasText: 'Istoric' }).click();
  await expect(page.locator('[data-memento-history="rca"]')).toContainText(`Valabil până la ${ro(rca)}`);

  // A refresh of the public page does not bring the old draft back.
  await page.goto('/memento-expirari');
  await settled(page);
  await expect(page.getByLabel('Număr de înmatriculare')).toHaveValue('');
});

test('a carrier’s verified documents are unchanged by memento entries for the same vehicle', async ({ page }) => {
  test.skip(CARRIER.email === '', 'Needs E2E_CARRIER_EMAIL and E2E_CARRIER_PASSWORD.');
  await signIn(page, CARRIER);

  // The fleet and the documents screen as they are now.
  await page.goto('/cont/firma/flota');
  await settled(page);
  const firstVehicle = page.locator('[data-fleet-list] li').first();
  test.skip((await firstVehicle.count()) === 0, 'The carrier has no vehicle.');
  const plate = ((await firstVehicle.locator('.font-mono').first().innerText()) ?? '').replace(/\s/g, '');
  const fleetBefore = await page.locator('[data-fleet-list]').innerText();
  await page.goto('/cont/firma/documente');
  await settled(page);
  const documentsBefore = await page.locator('main').innerText();

  // The same plate in the memento, every date valid for a year.
  await page.goto('/cont/memento/adauga');
  await settled(page);
  const form = page.locator('[data-memento-vehicle-form]');
  await form.getByLabel('Număr de înmatriculare').fill(plate);
  for (const kind of ['rca', 'itp', 'rovinieta', 'casco']) {
    await form.locator(`[data-memento-date="${kind}"]`).fill(dayFromToday(365));
  }
  await form.locator('[data-memento-save]').click();
  await expect(form.locator('[data-memento-added]')).toBeVisible();

  // Nothing moved where verification lives.
  await page.goto('/cont/firma/flota');
  await settled(page);
  expect(await page.locator('[data-fleet-list]').innerText()).toBe(fleetBefore);
  await page.goto('/cont/firma/documente');
  await settled(page);
  expect(await page.locator('main').innerText()).toBe(documentsBefore);

  // And the memento says what it is.
  await page.goto('/cont/memento');
  await settled(page);
  await expect(page.locator('[data-memento-declared]')).toContainText('neverificate de platformă');
  await expect(page.locator(`[data-memento-vehicle="${plate}"]`)).toBeVisible();
});
