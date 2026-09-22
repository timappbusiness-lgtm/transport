import { expect, test } from '@playwright/test';

/**
 * The categories, the locality field and the icons, without a database.
 *
 * What can be checked with nobody signed in is most of it: the form and
 * both boards open to a visitor. The locality *suggestions* need the
 * gazetteer and are in `categorii-localitati-supabase.spec.ts`; the
 * ranking itself is checked where it runs, in the LOC block of
 * `supabase/tests/rls_test.sql`.
 */

const OFFERED = [
  ['autoturism', 'Autoturism / SUV'],
  ['autoutilitara', 'Autoutilitară'],
  ['microbuz', 'Microbuz'],
  ['motocicleta', 'Motocicletă'],
  ['atv_quad', 'ATV sau quad'],
  ['rulota', 'Rulotă'],
  ['remorca', 'Remorcă ușoară'],
  ['cvadriciclu', 'Cvadriciclu'],
  ['istoric', 'Vehicul istoric'],
  ['altele', 'Altceva'],
] as const;

const RETIRED = [
  'camion',
  'ambarcatiune',
  'container',
  'cap_tractor',
  'utilaj_agricol',
  'utilaj_constructii',
  'utilaj_manipulare',
] as const;

async function toVehicleStep(page: import('@playwright/test').Page) {
  await page.goto('/cerere/noua');
  const loadingDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
  await page.getByLabel('Oraș de destinație').fill('București');
  await page.getByLabel('Poate fi încărcat de la').fill(loadingDate);
  await page.getByRole('button', { name: 'Continuă' }).click();
  await expect(page.getByLabel('Marca')).toBeVisible();
}

test.describe('the categories on the publish form', () => {
  test('offers all ten of the niche', async ({ page }) => {
    await toVehicleStep(page);
    const select = page.getByLabel('Categoria', { exact: true });
    for (const [code, label] of OFFERED) {
      await expect(select.locator(`option[value="${code}"]`), code).toHaveCount(1);
      await expect(select.locator(`option[value="${code}"]`)).toContainText(label);
    }
  });

  test('and nothing that needs another kind of lorry', async ({ page }) => {
    await toVehicleStep(page);
    const select = page.getByLabel('Categoria', { exact: true });
    for (const code of RETIRED) {
      await expect(select.locator(`option[value="${code}"]`), code).toHaveCount(0);
    }
  });

  test('every one of them can be chosen and carried to the next step', async ({ page }) => {
    for (const [code] of OFFERED) {
      await toVehicleStep(page);
      await page.getByLabel('Categoria', { exact: true }).selectOption(code);
      await page.getByLabel('Marca').fill('Volkswagen');
      await page.getByLabel('Modelul').fill('Golf');
      await page.getByLabel('Anul fabricației').fill('2018');
      if (code === 'altele') {
        await page.getByLabel('Ce transporți').fill('Un generator pe remorcă, 400 kg.');
      }
      await page.getByRole('button', { name: 'Continuă' }).click();
      // The third step is „Starea", which only appears once the second
      // one is accepted.
      await expect(page.getByRole('button', { name: 'Starea' })).toBeEnabled();
    }
  });

  test('the weight hint follows the category', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('motocicleta');
    await expect(page.getByText(/între 120 și 350 kg/)).toBeVisible();

    await page.getByLabel('Categoria', { exact: true }).selectOption('microbuz');
    await expect(page.getByText(/între 2\.200 și 3\.500 kg/)).toBeVisible();
  });

  test('and so does the placeholder in the weight field', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('motocicleta');
    await expect(page.getByLabel(/Greutatea/)).toHaveAttribute('placeholder', '200');
    // A placeholder, never a value: nothing is written into the field.
    await expect(page.getByLabel(/Greutatea/)).toHaveValue('');
  });
});

test.describe('a historic vehicle', () => {
  test('is offered closed transport, as a suggestion', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('istoric');
    await expect(page.getByText(/remorcă închisă/)).toBeVisible();
    // A suggestion, not a gate: the step still continues.
    await expect(page.getByText(/Poți alege și platformă deschisă/)).toBeVisible();
  });

  test('and no other category is', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('autoturism');
    await expect(page.getByText(/remorcă închisă/)).toHaveCount(0);
  });
});

test.describe('„Altceva"', () => {
  test('asks what it is, and will not continue without an answer', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('altele');
    await page.getByLabel('Marca').fill('Honda');
    await page.getByLabel('Modelul').fill('EU22i');
    await page.getByLabel('Anul fabricației').fill('2020');

    await expect(page.getByLabel('Ce transporți')).toBeVisible();
    await page.getByRole('button', { name: 'Continuă' }).click();
    await expect(page.getByText(/cel puțin 10 caractere/)).toBeVisible();
  });

  test('and continues once there is one', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('altele');
    await page.getByLabel('Marca').fill('Honda');
    await page.getByLabel('Modelul').fill('EU22i');
    await page.getByLabel('Anul fabricației').fill('2020');
    await page.getByLabel('Ce transporți').fill('Un generator de curent, aproximativ 400 kg.');

    await page.getByRole('button', { name: 'Continuă' }).click();
    await expect(page.getByRole('button', { name: 'Starea' })).toBeEnabled();
  });

  test('and the field is not there for any other category', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('rulota');
    await expect(page.getByLabel('Ce transporți')).toHaveCount(0);
  });
});

test.describe('the locality field', () => {
  test('takes a town the gazetteer may not have', async ({ page }) => {
    // The gazetteer holds 2.750 localities and Romania has thirteen
    // thousand. Somebody collecting a car from a village is the normal
    // case, and the field must not refuse them.
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Cătunul Meu');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('Cătunul Meu');
  });

  test('says nothing about a missing town before it has looked', async ({ page }) => {
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Cl');
    // „Nu găsim localitatea?" two letters in is a refusal nobody earned.
    await expect(page.getByText('Nu găsim localitatea?')).toHaveCount(0);
  });

  test('is a combobox, and says so', async ({ page }) => {
    await page.goto('/cerere/noua');
    const field = page.getByLabel('Oraș de plecare');
    await expect(field).toHaveRole('combobox');
    await expect(field).toHaveAttribute('aria-expanded', 'false');
  });
});

/*
 * The icon checks moved to `tests/e2e/iconuri.spec.ts`.
 *
 * What was here counted unlabelled icons and labelled ones and asserted
 * the two were equal — which on a page with no icons is `0 === 0`. It
 * passed for as long as the board had none, which was the entire time.
 */

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/cerere/noua', '/cereri', '/trasee']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }

  test('the vehicle step fits too', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Categoria', { exact: true }).selectOption('altele');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
