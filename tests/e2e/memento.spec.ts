import { expect, test, type Page } from '@playwright/test';
import { settled } from './settled';

/**
 * Memento expirări auto, in a real browser without a database.
 *
 * The public page is the real one: a signed-out person types a plate and
 * dates, goes to make an account, and comes back to find all of it. The
 * account screens are drawn by `/proba/ecrane` with sample vehicles whose
 * dates are counted from today and with stand-ins for the server actions
 * (`src/components/proba/memento-stubs.tsx`): the forms, the filters, the
 * CSV reading, the photo and its reading are all the real components.
 *
 * What needs a database — the account made at the end, the reminders,
 * the carrier's verified documents left alone — is in
 * `memento-supabase.spec.ts`, and the rules themselves in block MEM of
 * `supabase/tests/rls_test.sql`.
 */

const ACCENT = 'rgb(21, 97, 109)';
const SECTION = (slug: string, query = '') => `/proba/ecrane?sectiune=${slug}${query}`;

/** A day N days from today, as the date input wants it. */
function dayFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await settled(page);
}

/** Nothing on the page is wider than the window. */
async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}

test.describe('the public page', () => {
  test('says what it is in three lines, and that the dates are the person’s', async ({ page }) => {
    await open(page, '/memento-expirari');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Memento expirări auto');
    await expect(page.locator('[data-memento-benefits] li')).toHaveCount(3);
    await expect(page.locator('[data-memento-landing]')).toContainText('Platforma nu le verifică');
    await noSidewaysScroll(page);
  });

  test('a signed-out person adds a vehicle and dates, goes to make the account, and loses nothing', async ({ page }) => {
    await open(page, '/memento-expirari');
    await page.getByLabel('Număr de înmatriculare').fill('b 123 abc');
    await page.getByLabel(/^Marca/).fill('Dacia');
    await page.getByLabel(/^Modelul/).fill('Logan');
    await page.locator('[data-starter-next]').click();
    await expect(page).toHaveURL(/pas=documente/);
    // Rovinieta has no public API: the page never claims to check it.
    await expect(page.locator('[data-starter-step="documente"]')).toContainText('nu există o verificare publică automată');

    const rca = dayFromToday(40);
    const itp = dayFromToday(200);
    await page.locator('[data-starter-date="rca"]').fill(rca);
    await page.locator('[data-starter-date="itp"]').fill(itp);
    await page.locator('[data-starter-next]').click();
    await expect(page).toHaveURL(/pas=cont/);

    const summary = page.locator('[data-starter-summary]');
    await expect(summary).toContainText('B123ABC, 2 date');
    // The account is asked for last, and the way there comes back here.
    const signUp = page.locator('[data-starter-signup]');
    await expect(signUp).toHaveAttribute('href', /\/inregistrare\/persoana-fizica\?next=%2Fmemento-expirari%3Fpas%3Dcont/);

    // A refresh: everything is still there.
    await page.reload();
    await settled(page);
    await expect(page.locator('[data-starter-summary]')).toContainText('B123ABC, 2 date');

    // To the sign-up page and back, the way the confirmation link returns.
    await signUp.click();
    await expect(page).toHaveURL(/\/inregistrare\/persoana-fizica/);
    await expect(page.getByLabel('Telefon')).toBeVisible();
    await open(page, '/memento-expirari?pas=cont');
    await expect(page.locator('[data-starter-summary]')).toContainText('B123ABC, 2 date');
    const [day, month, year] = [rca.slice(8, 10), rca.slice(5, 7), rca.slice(0, 4)];
    await expect(page.locator('[data-starter-summary]')).toContainText(`RCA ${day}.${month}.${year}`);

    // And the dates step still holds what was typed.
    await open(page, '/memento-expirari?pas=documente');
    await expect(page.locator('[data-starter-date="itp"]')).toHaveValue(itp);
  });

  test('a plate is asked for before the dates', async ({ page }) => {
    await open(page, '/memento-expirari?pas=documente');
    // Without a plate the address cannot skip the first step.
    await expect(page.locator('[data-starter-step="vehicul"]')).toBeVisible();
    await page.locator('[data-starter-next]').click();
    await expect(page.getByText('Scrie numărul de înmatriculare.')).toBeVisible();
  });

  test('carries no accent: it is the person’s own list, not something the platform vouches for', async ({ page }) => {
    await open(page, '/memento-expirari');
    const used = await page.locator('[data-memento-landing] *').evaluateAll(
      (ns, accent) => ns.some((n) => {
        const cs = getComputedStyle(n);
        return cs.color === accent || cs.backgroundColor === accent;
      }),
      ACCENT,
    );
    expect(used).toBe(false);
  });
});

test.describe('the account screens', () => {
  test('a person’s cars: days left and a state on every date, in words, no badge', async ({ page }) => {
    await open(page, SECTION('memento'));
    const car = page.locator('[data-memento-vehicle="B123ABC"]');
    await expect(car.locator('[data-memento-entry="rca"] [data-memento-state]')).toHaveText(/Expiră curând · expiră în 5 zile/);
    await expect(car.locator('[data-memento-entry="itp"] [data-memento-state]')).toHaveText(/Valabil · expiră în 120 de zile/);
    await expect(car.locator('[data-memento-entry="rovinieta"] [data-memento-state]')).toHaveText(/Expirat · a expirat acum 3 zile/);
    await expect(page.locator('[data-memento-declared]')).toContainText('neverificate de platformă');
    await expect(page.locator('[data-memento-conversion="cerere"]')).toContainText('Ai nevoie să muți o mașină? Publică o cerere gratuit');
    await noSidewaysScroll(page);
  });

  test('declared is not verified: no verification word, no badge, no accent on any memento screen', async ({ page }) => {
    for (const slug of ['memento', 'memento-flota', 'memento-adauga', 'memento-poza', 'memento-import']) {
      await open(page, SECTION(slug));
      const content = page.locator('[data-proba-continut]');
      const text = await content.innerText();
      expect(text, slug).not.toMatch(/\bverificat|\bconform\b|\bConform\b|\baprobat|\bvalidat/);
      const accent = await content.locator('*').evaluateAll(
        (ns, colour) => ns.some((n) => {
          const cs = getComputedStyle(n);
          return cs.color === colour || cs.backgroundColor === colour;
        }),
        ACCENT,
      );
      expect(accent, `${slug} uses the accent`).toBe(false);
      // The pill with a coloured dot is what a verified document looks
      // like on the fleet page. None here.
      await expect(content.locator('.bg-success, .bg-success\\/8'), slug).toHaveCount(0);
    }
  });

  test('„Am reînnoit": one tap, the new date, the old one kept', async ({ page }) => {
    await open(page, SECTION('memento'));
    const rca = page.locator('[data-memento-vehicle="B123ABC"] [data-memento-entry="rca"]');
    await rca.getByRole('button', { name: 'Am reînnoit' }).click();
    const form = rca.locator('[data-memento-renew-form]');
    await expect(form).toContainText('Data veche rămâne în istoric.');
    await form.getByLabel(/Data nouă/).fill('2027-11-20');
    await form.getByRole('button', { name: 'Salvează data nouă' }).click();
    await expect(rca.getByText('Documentul: data nouă este 20.11.2027.')).toBeVisible();
  });

  test('the fleet filter „expiră în 30 de zile" keeps what is due within a month', async ({ page }) => {
    await open(page, SECTION('memento-flota'));
    await expect(page.locator('[data-memento-vehicle]')).toHaveCount(5);
    await page.locator('[data-memento-filter="30"]').click();
    await expect(page).toHaveURL(/filtru=30/);
    await expect(page).toHaveURL(/sectiune=memento-flota/);
    const plates = page.locator('[data-memento-vehicle]');
    await expect(plates).toHaveCount(2);
    await expect(page.locator('[data-memento-vehicle="B20BBB"]')).toBeVisible();
    await expect(page.locator('[data-memento-vehicle="IS50EEE"]')).toBeVisible();
    // Sorted by the nearest date: 12 days before 30.
    await expect(plates.first()).toHaveAttribute('data-memento-vehicle', 'B20BBB');

    await page.locator('[data-memento-filter="expirate"]').click();
    await expect(page.locator('[data-memento-vehicle]')).toHaveCount(1);
    await expect(page.locator('[data-memento-vehicle="CJ30CCC"]')).toBeVisible();

    await page.locator('[data-memento-filter="toate"]').click();
    // Each link is built from the page it is on: wait for this one first.
    await expect(page).not.toHaveURL(/filtru=/);
    await expect(page.locator('[data-memento-vehicle]')).toHaveCount(5);
    await page.locator('[data-memento-sort="numar"]').click();
    await expect(page).toHaveURL(/ordine=numar/);
    await expect(page.locator('[data-memento-vehicle]').first()).toHaveAttribute('data-memento-vehicle', 'AR40DDD');
    await expect(page.locator('[data-memento-vehicle="B20BBB"]')).toContainText('Mementouri către Ion Popescu-Rădulescu');
    await expect(page.locator('[data-memento-conversion="transport"]')).toContainText(
      'Faci transport auto? Primești cereri de transport pe platformă',
    );
    await noSidewaysScroll(page);
  });

  test('a firm adds three vehicles without leaving the form', async ({ page }) => {
    await open(page, SECTION('memento-adauga'));
    const form = page.locator('[data-memento-vehicle-form]');
    for (const [index, plate] of ['TM 01 AAA', 'TM 02 BBB', 'TM 03 CCC'].entries()) {
      await form.getByLabel('Număr de înmatriculare').fill(plate);
      await form.locator('[data-memento-date="rca"]').fill(dayFromToday(30 + index));
      await form.locator('[data-memento-save]').click();
      await expect(form.locator('[data-memento-added]')).toHaveAttribute('data-memento-added', String(index + 1));
      // Empty again for the next one.
      await expect(form.getByLabel('Număr de înmatriculare')).toHaveValue('');
      await expect(form.locator('[data-memento-date="rca"]')).toHaveValue('');
    }
    await expect(form.locator('[data-memento-added]')).toHaveText('Adăugate acum: TM01AAA, TM02BBB, TM03CCC');
  });

  test('a CSV names every bad line, imports nothing until it is right, then imports all', async ({ page }) => {
    await open(page, SECTION('memento-import'));
    const text = page.locator('[data-memento-csv-text]');
    await text.fill('numar;marca;rca;itp\nB1ABC;Dacia;15.03.2027;\nX;;;\nB2ABC;Ford;31.02.2027;01.06.2027\nB1ABC;;;01.01.2027\n');
    const errors = page.locator('[data-memento-csv-errors]');
    await expect(errors).toHaveAttribute('data-memento-csv-errors', '3');
    await expect(errors).toContainText('Rândul 3: numărul „X" nu pare corect.');
    await expect(errors).toContainText('Rândul 4: data „31.02.2027" pentru RCA nu este o dată');
    await expect(errors).toContainText('Rândul 5: numărul B1ABC apare deja pe rândul 2.');
    await expect(page.locator('[data-memento-csv-submit]')).toBeDisabled();

    await text.fill('numar;marca;rca;itp\nB1ABC;Dacia;15.03.2027;\nB2ABC;Ford;28.02.2027;01.06.2027\nB3ABC;Iveco;;10.10.2027\n');
    await expect(page.locator('[data-memento-csv-preview]')).toHaveAttribute('data-memento-csv-preview', '3');
    await page.locator('[data-memento-csv-submit]').click();
    await expect(page.locator('[data-memento-csv-done]')).toHaveText('Gata: 3 adăugate, 0 actualizate, 4 date salvate.');
  });
});

test.describe('the photo of a document', () => {
  const PHOTO = {
    name: 'rca.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360f8cfc0f01f0005000201a5b1d6f10000000049454e44ae426082',
      'hex',
    ),
  };

  async function answerUploads(page: Page) {
    await page.route('**/__proba/memento', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, path: 'f0000000-0000-4000-8000-000000000001/7e1d9c2b-2222-4f3e-8a1b-000000000002.jpg' }),
      }),
    );
  }

  test('with the reading configured: the date is proposed, and saved only when the person confirms', async ({ page }) => {
    await answerUploads(page);
    await open(page, SECTION('memento-poza'));
    const editor = page.locator('[data-memento-entry-editor]');
    await editor.locator('[data-memento-photo-input]').setInputFiles(PHOTO);
    await expect(editor.locator('[data-memento-reading="read"]')).toContainText('Din poză: 15.03.2027. Verifică data');
    await expect(editor.locator('[data-memento-entry-date]')).toHaveValue('2027-03-15');
    await expect(editor.getByLabel(/Serie sau număr poliță/)).toHaveValue('RO/25/ABC123');
    // Nothing saved yet: the person checks, then presses.
    await expect(editor.getByRole('status').filter({ hasText: 'Salvat.' })).toHaveCount(0);
    await editor.locator('[data-memento-entry-save]').click();
    await expect(editor.getByText('Salvat. 15.03.2027')).toBeVisible();
  });

  test('without it: the photo is kept, and the date is typed as it always was', async ({ page }) => {
    await answerUploads(page);
    await open(page, SECTION('memento-poza', '&ai=nu'));
    const editor = page.locator('[data-memento-entry-editor]');
    await editor.locator('[data-memento-photo-input]').setInputFiles(PHOTO);
    await expect(editor.locator('[data-memento-reading="unavailable"]')).toHaveText(
      'Citirea automată nu este disponibilă acum. Scrie data de mână.',
    );
    await expect(editor.locator('[data-memento-entry-date]')).toHaveValue('');
    await editor.locator('[data-memento-entry-date]').fill('2027-05-01');
    await editor.locator('[data-memento-entry-save]').click();
    await expect(editor.getByText('Salvat. 01.05.2027')).toBeVisible();
  });

  test('without a photo at all, the form is the manual one', async ({ page }) => {
    await open(page, SECTION('memento-poza', '&ai=nu'));
    const editor = page.locator('[data-memento-entry-editor]');
    await editor.locator('[data-memento-entry-date]').fill('2027-08-08');
    await editor.locator('[data-memento-entry-save]').click();
    await expect(editor.getByText('Salvat. 08.08.2027')).toBeVisible();
  });
});

test.describe('the link that stops the e-mails', () => {
  test('asks with a button, never on the link itself', async ({ page }) => {
    await open(page, '/memento-expirari/dezabonare?t=6f1d0c7a-0000-4000-8000-00000000abcd');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oprește mementourile pe e-mail');
    const button = page.locator('[data-memento-unsubscribe-button]');
    await expect(button).toBeVisible();
    await button.click();
    // No database here: the token is not one, and the page says so plainly.
    await expect(page.locator('[data-memento-unsubscribe]')).toHaveAttribute('data-memento-unsubscribe', 'invalid');
  });
});

test.describe('on a phone', () => {
  test('390px: the public page, the list and the fleet fit, and the actions are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/memento-expirari', SECTION('memento'), SECTION('memento-flota'), SECTION('memento-adauga'), SECTION('memento-import')]) {
      await open(page, path);
      await noSidewaysScroll(page);
    }
    await open(page, SECTION('memento-flota'));
    await expect(page.locator('[data-memento-filter="30"]')).toBeInViewport();
  });
});
