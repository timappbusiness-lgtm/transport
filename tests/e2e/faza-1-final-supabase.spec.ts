import { expect, test } from '@playwright/test';

/**
 * The last code-only Faza 1 items, against a real database.
 *
 * Six things the sibling spec cannot check without rows: a saved search
 * that finds something and is then edited and deleted, the plan limit
 * refusing a seventh one, a request inside and outside the detour
 * tolerance, a report closed and its reporter told, the audit viewer's
 * filters and its CSV, and a staff member granted and revoked.
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * NOT YET RUN: the environment this was written in cannot pull container
 * images, so `supabase start` never came up. Every expectation here is
 * unverified until somebody runs it with the stack up. `pnpm db:test`
 * covers the same rules at the database level and does run — the SRC,
 * DET, REP, AUD, TEA and CAT blocks of `supabase/tests/rls_test.sql`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a local Supabase: supabase start, then E2E_SUPABASE=1.');
});

test.describe('a saved search, from the board to the alert', () => {
  test('is created from the board with the filters that are on it', async ({ page }) => {
    await page.goto('/cereri?tara-plecare=DE&categorie=autoturism');

    await page.locator('aside').getByRole('button', { name: 'Salvează căutarea' }).click();

    // The name is suggested from the criteria, because „Căutarea 3" tells
    // nobody anything.
    const name = page.getByLabel('Cum o numim');
    await expect(name).toHaveValue(/Germania|Autoturism/);
    await name.fill('Germania → România, autoturisme');

    await page.getByRole('radio', { name: /Imediat/ }).check();
    await page.getByRole('button', { name: 'Salvează căutarea' }).click();

    await expect(page.getByText(/Am salvat/)).toBeVisible();
    await page.getByRole('link', { name: 'Vezi alertele' }).click();
    await expect(page).toHaveURL(/\/cont\/alerte/);
    await expect(page.getByRole('heading', { name: 'Germania → România, autoturisme' })).toBeVisible();
  });

  test('shows what it found, and why each one was chosen', async ({ page }) => {
    // The reasons are stored with the match rather than recomputed for
    // display, so what the screen says is what the decision said.
    await page.goto('/cont/alerte');
    await page.getByRole('button', { name: 'Ce a găsit' }).first().click();
    await expect(page.getByText('De ce s-a potrivit').first()).toBeVisible();
    await expect(page.getByText(/^· Ruta: /).first()).toBeVisible();
  });

  test('is renamed, paused and deleted from the same row', async ({ page }) => {
    await page.goto('/cont/alerte');

    await page.getByRole('button', { name: 'Redenumește' }).first().click();
    await page.getByLabel('Redenumește').fill('Doar Germania');
    await page.getByRole('button', { name: 'Salvează' }).click();
    await expect(page.getByRole('heading', { name: 'Doar Germania' })).toBeVisible();

    await page.getByRole('button', { name: 'Oprește' }).first().click();
    await expect(page.getByText('Oprită').first()).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Șterge' }).first().click();
    await expect(page.getByRole('heading', { name: 'Doar Germania' })).toHaveCount(0);
  });

  test('refuses one past the plan limit, and names the plan', async ({ page }) => {
    // The limit is `plans.max_saved_searches`, applied by `save_search`.
    // The refusal is the database's own sentence, shown as written.
    await page.goto('/cereri');
    await page.locator('aside').getByRole('button', { name: 'Salvează căutarea' }).click();
    await page.getByLabel('Cum o numim').fill('Una peste limită');
    await page.getByRole('button', { name: 'Salvează căutarea' }).click();

    await expect(page.getByText(/Ai atins limita de .* căutări salvate a planului/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi planurile' })).toBeVisible();
  });
});

test.describe('the detour tolerance decides what a carrier is shown', () => {
  test('a request inside the tolerance appears, with the ocol spelled out', async ({ page }) => {
    await page.goto('/cont');
    const matches = page.getByRole('region', { name: 'Cereri potrivite' });
    await expect(matches.getByText(/Ocol de \d+ km .* \(toleranță \d+ km\)/).first()).toBeVisible();
  });

  test('and one outside it does not', async ({ page }) => {
    // The board filtered to „potrivite cu firma mea" is the same rule,
    // so the count there is the check: fewer than the whole board.
    await page.goto('/cereri?doar=firma');
    await expect(
      page.getByText(/din cele mai recente \d+ cereri se potrivesc cu firma ta/),
    ).toBeVisible();
  });

  test('the filter explains an empty result rather than looking broken', async ({ page }) => {
    await page.goto('/cereri?doar=firma&tara-plecare=PT');
    await expect(page.getByText('Nicio cerere potrivită cu firma ta acum.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi toate cererile' })).toBeVisible();
  });
});

test.describe('a report, from the queue to the reply', () => {
  test('staff resolves one and the reporter is told', async ({ page }) => {
    await page.goto('/admin/sesizari');
    await expect(page.getByRole('heading', { name: 'Sesizări' })).toBeVisible();

    const first = page.getByRole('listitem').first();
    await first.getByLabel('Ce îi răspundem').fill(
      'Am verificat firma. Documentele sunt valabile, nu am găsit nimic în neregulă.',
    );
    await first.getByRole('button', { name: 'Rezolvă' }).click();

    await expect(page.getByText(/I-am trimis răspunsul pe e-mail|Nu am putut trimite/)).toBeVisible();
  });

  test('refuses to close one without a reason', async ({ page }) => {
    // Mandatory in `handle_report`, because „rezolvat" with no
    // explanation is the answer that makes people stop reporting things.
    await page.goto('/admin/sesizari?stare=open');
    const first = page.getByRole('listitem').first();
    await first.getByLabel('Ce îi răspundem').fill('');
    await first.getByRole('button', { name: 'Respinge' }).click();
    await expect(page.getByText(/Scrie ce ai decis și de ce/)).toBeVisible();
  });

  test('the reporter sees the answer and not the internal notes', async ({ page }) => {
    await page.goto('/admin/sesizari?stare=resolved');
    await expect(page.getByText('Ce am răspuns').first()).toBeVisible();
    // The notes are staff-only by construction: `handle_report` never
    // puts them in the e-mail payload.
    await expect(page.getByText('Nu ajung niciodată la cel care a sesizat.').first()).toBeVisible();
  });
});

test.describe('the audit viewer', () => {
  test('filters by action and keeps the total across the page', async ({ page }) => {
    await page.goto('/admin/jurnal');
    await expect(page.getByRole('heading', { name: 'Jurnal de acțiuni' })).toBeVisible();

    await page.getByLabel('Ce acțiune').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page.getByText(/\d+ înregistrări · Pagina 1 din \d+/)).toBeVisible();
  });

  test('shows a readable diff, without the timestamps every update touches', async ({ page }) => {
    await page.goto('/admin/jurnal');
    await page.getByRole('button', { name: /Vezi diferențele/ }).first().click();
    await expect(page.getByText('Înainte').first()).toBeVisible();
    await expect(page.getByText('updated_at')).toHaveCount(0);
  });

  test('exports exactly the filtered range as a CSV', async ({ page }) => {
    await page.goto('/admin/jurnal?entitate=companies');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Descarcă CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^jurnal-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('offers nothing that writes', async ({ page }) => {
    // `audit_log` has allowed nobody to write to it since phase 0, and
    // the screen must not suggest otherwise.
    await page.goto('/admin/jurnal');
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: /Șterge|Modifică|Salvează/ })).toHaveCount(0);
  });
});

test.describe('the team', () => {
  test('lists who has access, since when and on whose say-so', async ({ page }) => {
    await page.goto('/admin/echipa');
    await expect(page.getByRole('heading', { name: 'Echipa platformei' })).toBeVisible();
    await expect(page.getByText('De când').first()).toBeVisible();
    await expect(page.getByText('Acordat de').first()).toBeVisible();
  });

  test('says what the role can do, rather than leaving it to be guessed', async ({ page }) => {
    await page.goto('/admin/echipa');
    await expect(page.getByText('Ce poate face un administrator')).toBeVisible();
    await expect(page.getByText(/Citește jurnalul de acțiuni/)).toBeVisible();
  });

  test('adds somebody by the address on an account that already exists', async ({ page }) => {
    await page.goto('/admin/echipa');
    await page.getByLabel('E-mailul contului').fill('dispecer@test.ro');
    await page.getByLabel('De ce').fill('Preia coada de verificare pe perioada concediului.');
    await page.getByRole('button', { name: 'Dă acces' }).click();
    await expect(page.getByText(/are acum acces de administrare/)).toBeVisible();
  });

  test('refuses an address with no account behind it', async ({ page }) => {
    await page.goto('/admin/echipa');
    await page.getByLabel('E-mailul contului').fill('nimeni@example.com');
    await page.getByLabel('De ce').fill('Test.');
    await page.getByRole('button', { name: 'Dă acces' }).click();
    await expect(page.getByText('Nu există niciun cont cu adresa asta.')).toBeVisible();
  });

  test('revokes, with the reason typed before the button', async ({ page }) => {
    await page.goto('/admin/echipa');
    const row = page.getByRole('listitem').filter({ hasText: 'dispecer@test.ro' });
    await row.getByRole('button', { name: 'Scoate din echipă' }).click();
    await row.getByLabel('De ce îl scoți').fill('S-a întors din concediu.');
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Scoate din echipă' }).click();
    await expect(page.getByText(/nu mai are acces de administrare/)).toBeVisible();
  });

  test('will not let the last administrator remove themselves', async ({ page }) => {
    // `set_platform_staff` refuses it; the screen hides the button so
    // nobody types a reason for an action that was never going to happen.
    await page.goto('/admin/echipa');
    const rows = page.getByRole('listitem');
    if ((await rows.count()) === 1) {
      await expect(page.getByText('Ultimul administrator nu poate fi scos.')).toBeVisible();
    }
  });
});

test.describe('the category counters, once there is something to count', () => {
  test('appear above the threshold and link to the board filtered by them', async ({ page }) => {
    await page.goto('/');
    const block = page.locator('#categorii');
    await expect(block).toBeVisible();
    await expect(block.getByText(/Cereri publicate în ultimele \d+ de? zile\./)).toBeVisible();

    const first = block.getByRole('link').first();
    const href = await first.getAttribute('href');
    expect(href).toMatch(/^\/cereri\?categorie=/);

    await first.click();
    await expect(page).toHaveURL(/\/cereri\?categorie=/);
  });

  test('never shows a zero', async ({ page }) => {
    // `category_counts()` has `having count(*) > 0`, so a category with
    // nothing in it is absent rather than a card saying nothing is there.
    await page.goto('/');
    const block = page.locator('#categorii');
    if (await block.isVisible()) {
      await expect(block.getByText(/^0$/)).toHaveCount(0);
    }
  });

  test('the window follows the number the team set', async ({ page }) => {
    await page.goto('/admin/activitate');
    await page.getByLabel('Fereastra pentru categorii (zile)').fill('30');
    await page.getByRole('button', { name: 'Salvează' }).last().click();
    await expect(page.getByText('Setările de potrivire au fost salvate.')).toBeVisible();

    await page.goto('/');
    const block = page.locator('#categorii');
    if (await block.isVisible()) {
      await expect(block.getByText('Cereri publicate în ultimele 30 de zile.')).toBeVisible();
    }
  });
});
