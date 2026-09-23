import { expect, test } from '@playwright/test';
import { settled } from './settled';

/**
 * What the Faza 1 unblocking changed, from a browser and with no database.
 *
 * The half that needs rows — signing up, confirming an address through a
 * mail catcher, publishing with photographs, a contact reveal asking for
 * a confirmed number, the pilot numbers excluding test accounts — is in
 * `faza-1-deblocare-supabase.spec.ts`, which runs with `E2E_SUPABASE=1`.
 * Everything here works against a build with nothing behind it, which is
 * what makes it worth running on every commit.
 */

const MOBILE = { width: 390, height: 844 };

test.describe('the boards are findable', () => {
  test('both are in the public bar, requests first', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigare' });
    await expect(nav.getByRole('link', { name: 'Cereri', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Trasee', exact: true })).toBeVisible();
  });

  test('the homepage links to the board even with nothing published', async ({ page }) => {
    // The link used to sit inside a block hidden below the activity
    // threshold, which on an empty platform meant no link at all.
    await page.goto('/');
    const links = page.locator('a[href="/cereri"]');
    expect(await links.count()).toBeGreaterThan(0);
  });

  test('prices stay out of the bar while the table is unpublished', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navigare' });
    await expect(nav.getByRole('link', { name: 'Prețuri' })).toHaveCount(0);
    // Reachable by link, which is the point of taking it out of the menu
    // rather than deleting the page.
    await page.goto('/preturi');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the request board opens for a visitor with no account', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await expect(page).toHaveURL(/\/cereri$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('empty states offer somewhere to go', () => {
  test('the request board offers both sides of the market', async ({ page }) => {
    // One button on the card, and the other side of the market one
    // click down: an empty board is the screen where a person has the
    // least to go on, and five things to choose between is the problem.
    await page.goto('/cereri');
    await settled(page);
    const main = page.locator('main');
    await expect(main.getByRole('link', { name: /Publică/ }).first()).toBeVisible();
    await main.getByText('Altceva de făcut de aici').click();
    await expect(main.getByRole('link', { name: /trasee/i }).first()).toBeVisible();
  });

  test('the departures board offers somewhere too', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await expect(page.locator('main').getByRole('link').first()).toBeVisible();
  });
});

test.describe('the filters cover what the board holds', () => {
  test('every category of the niche can be filtered for, not only six', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    const options = page.locator('#rf-category option');
    // The ten offered categories plus the „any" option.
    expect(await options.count()).toBe(11);

    // The three that were missing from the niche and used to be
    // published as „altele".
    for (const code of ['atv_quad', 'cvadriciclu', 'istoric']) {
      await expect(page.locator(`#rf-category option[value="${code}"]`)).toHaveCount(1);
    }
  });

  test('and nothing outside it', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    // This used to assert the opposite: that camion and ambarcatiune
    // were filterable, back when the filter mirrored the competitor's
    // thirteen categories. They need different equipment and different
    // authorisations, so they are no longer offered — anywhere.
    for (const code of ['camion', 'ambarcatiune', 'container', 'cap_tractor', 'utilaj_agricol']) {
      await expect(page.locator(`#rf-category option[value="${code}"]`)).toHaveCount(0);
    }
  });

  test('express is a filter, not only a badge', async ({ page }) => {
    // Inside „Mai multe filtre" now; `toHaveCount` reads the markup
    // rather than the pixels, so it does not need opening.
    await page.goto('/cereri');
    await settled(page);
    await expect(page.locator('#rf-service option[value="expres"]')).toHaveCount(1);
    await expect(page.locator('#rf-service option[value="tractare"]')).toHaveCount(0);
  });

  test('a chosen filter survives into the address bar', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await page.getByText('Mai multe filtre').click();
    await page.locator('#rf-service').selectOption('expres');
    await page.getByRole('button', { name: /Caută|Filtrează/ }).first().click();
    await expect(page).toHaveURL(/serviciu=expres/);
  });
});

test.describe('signing up as a private person', () => {
  test('asks for a telephone number, and says no SMS is coming', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await expect(page.getByLabel('Telefon')).toBeVisible();
    await expect(page.getByText(/nu îți trimitem niciun cod prin SMS/i)).toBeVisible();
  });

  test('refuses a number that is not a Romanian mobile', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica');
    await page.getByLabel('Nume și prenume').fill('Ion Popescu');
    await page.getByLabel('Adresă de e-mail').fill('ion@example.ro');
    await page.getByLabel('Telefon').fill('0264 123 456');
    await page.getByLabel('Parolă').fill('parolaSigura1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Creează contul' }).click();
    await expect(page.getByText(/nu pare un număr de mobil/i)).toBeVisible();
  });

  test('carries where it came from through to the confirmation', async ({ page }) => {
    await page.goto('/inregistrare/persoana-fizica?next=%2Fcerere%2Fnoua');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua');
  });
});

test.describe('the contact page', () => {
  test('is a real page, not a placeholder', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Scrie-ne');
    await expect(page.getByText('Pagină în lucru')).toHaveCount(0);
  });

  test('says what is not filled in rather than hiding it', async ({ page }) => {
    await page.goto('/contact');
    // Until src/config/company.ts is filled in, the page admits it. When
    // it is, this block disappears and the assertion below goes with it.
    const warning = page.getByText(/Încă nu sunt completate/);
    const placeholders = page.getByText('[de completat]');
    if ((await warning.count()) > 0) {
      expect(await placeholders.count()).toBeGreaterThan(0);
    } else {
      expect(await placeholders.count()).toBe(0);
    }
  });

  test('offers the things somebody can do without writing to us', async ({ page }) => {
    await page.goto('/contact');
    // Scoped to main: the footer links to /verificare too, with a longer
    // label, and an unscoped match hits both.
    const main = page.locator('main');
    await expect(main.getByRole('link', { name: /Întrebări frecvente/ })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Cum verificăm', exact: true })).toBeVisible();
  });

  test('states a response time, so it is a promise and not a hope', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByText(/două zile lucrătoare/)).toBeVisible();
  });
});

test.describe('the request form', () => {
  test('lets the client choose how long it stays up', async ({ page }) => {
    await page.goto('/cerere/noua');
    // The control is on the last step; walking there is the only way to
    // see it, and walking there is what a person does.
    await page.getByLabel('Oraș de plecare').fill('München');
    await page.getByLabel('Țara de plecare').selectOption('DE');
    await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
    await page.getByLabel('Poate fi încărcat de la').fill('2030-06-01');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await page.getByLabel('Marca').fill('Volkswagen');
    await page.getByLabel('Modelul').fill('Golf');
    await page.getByLabel('Anul fabricației').fill('2018');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await page.getByRole('button', { name: 'Continuă' }).click();

    const duration = page.getByLabel('Cât timp stă pe panou');
    await expect(duration).toBeVisible();
    await expect(duration).toHaveValue('14');
    await duration.selectOption('3');
    await expect(duration).toHaveValue('3');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: MOBILE });

  for (const path of ['/', '/cereri', '/trasee', '/contact', '/cerere/noua']) {
    test(`${path} does not scroll sideways at 390px`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('nothing shouts in the console', () => {
  for (const path of ['/', '/cereri', '/contact']) {
    test(`${path} renders without an error or a hydration warning`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(message.text());
      });
      page.on('pageerror', (error) => problems.push(error.message));

      await page.goto(path);
      await settled(page);
      await page.waitForLoadState('networkidle');

      // A failed request to a Supabase that is not configured is expected
      // in this environment and is not what this test is about.
      const real = problems.filter(
        (text) => !/supabase|Failed to load resource|net::ERR/i.test(text),
      );
      expect(real).toEqual([]);
    });
  }
});
