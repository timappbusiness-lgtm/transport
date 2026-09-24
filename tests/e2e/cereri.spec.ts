import { expect, test } from '@playwright/test';
import { openMoreFilters, settled } from './settled';

/**
 * Publishing a request and the board, without a database.
 *
 * Most of this file is about the form, because the form is the part that
 * works with nothing behind it: four steps, validation at each, and a draft
 * that survives being sent away to make an account. That last one is the
 * reason the flow is shaped this way at all, so it is checked here rather
 * than left to the half that needs rows.
 *
 * The half that needs rows — a published request appearing on the board,
 * the filters narrowing it, the contact costing a plan — is in
 * `cereri-supabase.spec.ts`.
 */

/** Far enough ahead that this file does not expire. */
const FUTURE = '2030-06-01';

async function fillRoute(page: import('@playwright/test').Page): Promise<void> {
  await page.getByLabel('Oraș de plecare').fill('München');
  await page.getByLabel('Țara de plecare').selectOption('DE');
  await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
  await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
}

async function fillVehicle(page: import('@playwright/test').Page): Promise<void> {
  await page.getByLabel('Marca').fill('Volkswagen');
  await page.getByLabel('Modelul').fill('Golf');
  await page.getByLabel('Anul fabricației').fill('2018');
}

test.describe('the form is open to a visitor with no account', () => {
  test('/cerere/noua does not send anybody to sign in', async ({ page }) => {
    await page.goto('/cerere/noua');
    await expect(page).toHaveURL(/\/cerere\/noua$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Spune-ne ce ai de transportat',
    );
  });

  test('says publishing is free before asking for anything', async ({ page }) => {
    await page.goto('/cerere/noua');
    await expect(page.getByText(/Publicarea este gratuită/)).toBeVisible();
  });
});

test.describe('the steps', () => {
  test('refuses to move on from an empty route', async ({ page }) => {
    await page.goto('/cerere/noua');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await expect(page.getByText('Scrie orașul de plecare.')).toBeVisible();
    await expect(page.getByText('Alege data de la care poate fi încărcat.')).toBeVisible();
    // Still on step one.
    await expect(page.getByLabel('Oraș de plecare')).toBeVisible();
  });

  test('does not complain about a field two steps away', async ({ page }) => {
    // The route step must not ask for a telephone number nobody has been
    // offered a box for yet.
    await page.goto('/cerere/noua');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await expect(page.getByText(/număr de telefon/i)).toHaveCount(0);
  });

  test('walks all four and offers an account at the end', async ({ page }) => {
    await page.goto('/cerere/noua');

    await fillRoute(page);
    await page.getByRole('button', { name: 'Continuă' }).click();

    await fillVehicle(page);
    await expect(page.getByRole('radio', { name: 'Pornește și se deplasează' })).toBeChecked();
    await page.getByRole('button', { name: 'Continuă' }).click();

    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
    await page.getByRole('button', { name: 'Continuă' }).click();

    // Nobody is signed in: the name, the number and the address are asked
    // once, on the account form, not here and then again there.
    await expect(page.locator('[data-contact-from-account]')).toBeVisible();
    await expect(page.getByLabel('Telefon')).toHaveCount(0);
    // Nobody is signed in, so there is no publish button — an account is
    // offered instead, and the wording says what is already saved.
    await expect(page.getByRole('button', { name: 'Publică cererea' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Fă-ți cont gratuit' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Am deja cont' })).toBeVisible();
  });

  test('lets you go back to a step you have finished, not forward', async ({ page }) => {
    await page.goto('/cerere/noua');
    await fillRoute(page);
    await page.getByRole('button', { name: 'Continuă' }).click();

    // A step still ahead is not a button: going forward runs the checks.
    await expect(page.getByRole('button', { name: /Contact/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Traseu/ }).click();
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('München');
  });

  test('says a winch is coming as soon as the answers say so', async ({ page }) => {
    await page.goto('/cerere/noua');
    await fillRoute(page);
    await page.getByRole('button', { name: 'Continuă' }).click();
    await fillVehicle(page);

    await expect(page.getByText('Transportatorul vine pregătit cu troliu.')).toHaveCount(0);
    await page.getByText('Nu pornește sau nu se deplasează').click();
    await expect(page.getByText('Transportatorul vine pregătit cu troliu.')).toBeVisible();
  });

  test('asks what is damaged only when there is damage', async ({ page }) => {
    await page.goto('/cerere/noua');
    await fillRoute(page);
    await page.getByRole('button', { name: 'Continuă' }).click();
    await fillVehicle(page);

    await expect(page.getByLabel('Ce este avariat')).toHaveCount(0);
    await page.locator('[data-optional="masina"] > summary').click();
    await page.getByLabel('Are avarii').check();
    await expect(page.getByLabel('Ce este avariat')).toBeVisible();
  });
});

test.describe('the draft survives the trip to make an account', () => {
  test('comes back after following the sign-up link and returning', async ({ page }) => {
    await page.goto('/cerere/noua');
    await fillRoute(page);
    await page.getByRole('button', { name: 'Continuă' }).click();
    await fillVehicle(page);

    // The whole point of the design: leaving to make an account and coming
    // back must not cost an hour of typing.
    await page.goto('/inregistrare/persoana-fizica');
    await page.goto('/cerere/noua');

    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('München');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await expect(page.getByLabel('Marca')).toHaveValue('Volkswagen');
    await expect(page.getByLabel('Anul fabricației')).toHaveValue('2018');
  });

  test('a fresh link beats a stored draft', async ({ page }) => {
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('München');

    // Arriving from the calculator is a more recent intention than whatever
    // was half typed before.
    await page.goto('/cerere/noua?plecare=Milano%7CIT&sosire=Arad%7CRO');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('Milano');
  });
});

test.describe('the board with nothing on it', () => {
  test('says what will be here, and offers the one thing that fills it', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // An unfiltered empty board is not a search that found nothing: it
    // is a board with nothing on it yet, and it says which.
    await expect(page.getByText('Încă nu este nicio cerere aici')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Publică o cerere' }).first(),
    ).toBeVisible();
  });

  test('tells a visitor what a session would add', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await expect(page.getByText(/Contactul se deschide dintr-un cont de transportator/)).toBeVisible();
  });

  test('keeps every filter in the URL', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    // Both of these are one click down now, under „Mai multe filtre".
    // The keys they write are the ones they always wrote.
    await openMoreFilters(page);
    await page.getByLabel('Țara de plecare').selectOption('DE');
    await page.getByLabel('Starea vehiculului').selectOption('nu-ruleaza');
    await page.getByRole('button', { name: 'Caută' }).click();

    await expect(page).toHaveURL(/tara-plecare=DE/);
    await expect(page).toHaveURL(/stare=nu-ruleaza/);
    // And the form comes back showing what was asked for.
    await expect(page.getByLabel('Țara de plecare')).toHaveValue('DE');
  });

  test('carries the tab through a filter', async ({ page }) => {
    await page.goto('/cereri?cine=retur');
    await settled(page);
    await page.getByLabel('Țara de destinație').selectOption('RO');
    await page.getByRole('button', { name: 'Caută' }).click();
    await expect(page).toHaveURL(/cine=retur/);
  });

  test('offers a way back out of a search that found nothing', async ({ page }) => {
    await page.goto('/cereri?tara-plecare=DE');
    await settled(page);
    await page.getByRole('link', { name: 'Vezi toate cererile' }).click();
    await expect(page).toHaveURL(/\/cereri$/);
  });
});

test.describe('a request nobody can see', () => {
  test('an id that is not on the board is a 404', async ({ page }) => {
    const response = await page.goto('/cereri/00000000-0000-0000-0000-000000000000');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the account list is closed', () => {
  test('/cont/cereri sends an anonymous visitor to sign in', async ({ page }) => {
    await page.goto('/cont/cereri');
    await expect(page).toHaveURL(/\/autentificare/);
    await expect(page).toHaveURL(/next=%2Fcont%2Fcereri/);
  });
});
