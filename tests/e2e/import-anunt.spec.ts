import { expect, test } from '@playwright/test';

/**
 * The import panel on step 2, without a database and without the network.
 *
 * **No test here contacts a real listing site.** Every one that needs a
 * server answer intercepts the server action and replies with a fixture.
 * A test that fetched a real advert would be a request nobody gave us
 * permission to make, and a test that fails the day somebody redesigns
 * their page.
 *
 * What is checked hardest is the honesty of the result: the line that
 * says to verify, the chip on every field something else filled, and the
 * box that stays empty until somebody ticks it. Everything the model
 * produced is a guess about somebody else's advert, and a form that
 * presents a guess the way it presents typing is a form people stop
 * reading.
 */

/**
 * Fills step 1 and continues to step 2.
 *
 * The step buttons are disabled until a step has been reached, which is
 * the form working as designed — so the only way in is the way a person
 * takes. The date is a fortnight out so it is never yesterday.
 */
async function toVehicleStep(page: import('@playwright/test').Page) {
  await page.goto('/cerere/noua');

  const loadingDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
  await page.getByLabel('Oraș de destinație').fill('București');
  await page.getByLabel('Poate fi încărcat de la').fill(loadingDate);
  await page.getByRole('button', { name: 'Continuă' }).click();

  await expect(page.getByRole('tab', { name: 'Link anunț' })).toBeVisible();
}

/**
 * Answers the server action with a fixture, without faking the protocol.
 *
 * A server action's reply is an RSC flight stream: an envelope line, then
 * the returned value on its own line. Hand-writing that envelope means
 * guessing at a format that belongs to the framework and changes with it,
 * and the first version of this file did exactly that — nine tests failed
 * against a body Next could not parse.
 *
 * So the real request goes through, the real envelope comes back, and only
 * the line carrying the action's return value is replaced. Nothing here
 * reaches a listing site: without Supabase configured the action refuses
 * before it can, which is also what the unstubbed test below relies on.
 */
async function stubExtraction(
  page: import('@playwright/test').Page,
  value: Record<string, unknown>,
) {
  await page.route('**/cerere/noua**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || request.headers()['next-action'] === undefined) {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    const body = await response.text();
    // The envelope is line 0 and the value is the line it points at.
    const rewritten = body.replace(/^1:.*$/m, `1:${JSON.stringify(value)}`);

    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: rewritten,
    });
  });
}

/** The panel's own error line, which is the one these tests mean. */
function panelAlert(page: import('@playwright/test').Page) {
  return page.getByRole('alert').filter({ hasNotText: /^$/ }).first();
}

test.describe('the panel sits next to the form, never instead of it', () => {
  test('both tabs are offered, and the fields are there regardless', async ({ page }) => {
    await toVehicleStep(page);

    await expect(page.getByRole('tab', { name: 'Link anunț' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Fotografie' })).toBeVisible();

    // The point: the form is complete with the panel ignored.
    await expect(page.getByLabel('Marca')).toBeVisible();
    await expect(page.getByLabel('Modelul')).toBeVisible();
    await expect(page.getByLabel(/Anul fabricației/)).toBeVisible();
  });

  test('the link tab is the one that opens', async ({ page }) => {
    await toVehicleStep(page);
    await expect(page.getByRole('tab', { name: 'Link anunț' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('Adresa anunțului')).toBeVisible();
  });

  test('switching to the photo tab swaps the input', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByRole('tab', { name: 'Fotografie' }).click();

    await expect(page.getByLabel(/Poza anunțului/)).toBeVisible();
    await expect(page.getByLabel('Adresa anunțului')).toHaveCount(0);
  });

  test('it says the form still works without any of this', async ({ page }) => {
    await toVehicleStep(page);
    await expect(page.getByText(/completează câmpurile de mai jos/i)).toBeVisible();
  });

  test('nothing is filled and nothing is claimed before anybody asks', async ({ page }) => {
    await toVehicleStep(page);

    await expect(page.getByText('Date completate automat. Verifică-le înainte de publicare.'))
      .toHaveCount(0);
    await expect(page.getByTitle(/Completat automat/)).toHaveCount(0);
    await expect(page.getByLabel('Marca')).toHaveValue('');
  });
});

test.describe('the real path, with nothing intercepted', () => {
  test('a refusal reaches the person through the real action', async ({ page }) => {
    await toVehicleStep(page);

    // No route interception anywhere in this test. With no database
    // configured the action refuses before it can reach any site, which
    // is exactly what should happen — and it proves the wiring from the
    // button to the server and back is real, not a fixture.
    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/x');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(panelAlert(page)).toContainText('manual');
    // And nothing was claimed about the car on the way past.
    await expect(page.getByText('Date completate automat. Verifică-le înainte de publicare.'))
      .toHaveCount(0);
    await expect(page.getByLabel('Marca')).toHaveValue('');
  });
});

test.describe('what a link that worked looks like', () => {
  test('the fields fill, each one says it was filled, and the page says to check', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, {
      ok: true,
      fields: { make: 'Volkswagen', model: 'Golf', year: '2018' },
      dropped: [],
      image_url: null,
      remaining: 7,
    });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/golf-123');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(page.getByLabel('Marca')).toHaveValue('Volkswagen');
    await expect(page.getByLabel('Modelul')).toHaveValue('Golf');
    await expect(page.getByLabel(/Anul fabricației/)).toHaveValue('2018');

    // The sentence the whole feature is allowed to exist under.
    await expect(
      page.getByText('Date completate automat. Verifică-le înainte de publicare.'),
    ).toBeVisible();
    await expect(page.getByTitle(/Completat automat/)).toHaveCount(3);
  });

  test('editing a filled field takes its chip away', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, { ok: true, fields: { make: 'Dacia', model: 'Logan' }, dropped: [] });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/logan');
    await page.getByRole('button', { name: 'Completează din link' }).click();
    await expect(page.getByTitle(/Completat automat/)).toHaveCount(2);

    await page.getByLabel('Marca').fill('Renault');
    // A chip on something they typed would be a lie about where it came from.
    await expect(page.getByTitle(/Completat automat/)).toHaveCount(1);
  });

  test('a field left out is counted, not filled with a guess', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, {
      ok: true,
      fields: { make: 'Audi' },
      dropped: ['year', 'model'],
    });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/a4');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(page.getByText(/2 câmpuri au rămas goale/)).toBeVisible();
    await expect(page.getByLabel(/Anul fabricației/)).toHaveValue('');
  });

  test('an extraction that found nothing says so instead of pretending', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, { ok: true, fields: {}, dropped: [] });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/lista');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(page.getByText(/Nu am găsit nimic de completat/)).toBeVisible();
    await expect(page.getByText('Date completate automat. Verifică-le înainte de publicare.'))
      .toHaveCount(0);
  });

  test('a value the form would refuse never reaches the box', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, {
      ok: true,
      // A year no car has, and a weight no car transporter takes.
      fields: { make: 'Ford', year: '1823', weight_kg: '90000' },
      dropped: [],
    });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/x');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(page.getByLabel('Marca')).toHaveValue('Ford');
    await expect(page.getByLabel(/Anul fabricației/)).toHaveValue('');
    await expect(page.getByLabel(/Greutatea/)).toHaveValue('');
  });
});

test.describe('what a refusal looks like', () => {
  test('a site that forbids reading is explained, and not retried at', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, { ok: false, reason: 'robots_disallow' });

    await page.getByLabel('Adresa anunțului').fill('https://interzis.example.ro/auto/x');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    const alert = panelAlert(page);
    await expect(alert).toContainText('nu permite citirea automată');
    await expect(alert).toContainText('manual');
    // "Try again" on a permanent refusal spends a slot for nothing.
    await expect(alert).not.toContainText(/mai încearcă/i);
  });

  test('the daily limit says when to come back and that the form still works', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, { ok: false, reason: 'daily_limit' });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/x');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    const alert = panelAlert(page);
    await expect(alert).toContainText('limita');
    await expect(alert).toContainText('formularul merge la fel');
  });

  test('a link that is obviously not one is refused in the browser', async ({ page }) => {
    await toVehicleStep(page);
    // No stub: nothing should leave the page at all.
    await page.getByLabel('Adresa anunțului').fill('nu e un link');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(panelAlert(page)).toContainText('https://');
  });

  test('a refusal leaves what was already typed alone', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Marca').fill('Skoda');

    await stubExtraction(page, { ok: false, reason: 'http_error' });
    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/x');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(panelAlert(page)).toBeVisible();
    await expect(page.getByLabel('Marca')).toHaveValue('Skoda');
  });
});

test.describe('the photo is never taken without being asked', () => {
  test('logged out, the box is not offered at all', async ({ page }) => {
    await toVehicleStep(page);
    await stubExtraction(page, {
      ok: true,
      fields: { make: 'Opel' },
      image_url: 'https://cdn.example.ro/foto/1.jpg',
    });

    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/astra');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    // Wait for the extraction to land before asserting an absence. Without
    // this the test passes on a box that has not been rendered yet rather
    // than on one that is not offered, and it ends while the route handler
    // is still reading the response.
    await expect(page.getByLabel('Marca')).toHaveValue('Opel');

    await expect(page.getByLabel(/Atașează și poza/)).toHaveCount(0);
    await expect(page.getByText(/Poza se poate atașa după ce intri în cont/)).toBeVisible();
  });
});

test.describe('the import never argues with what was typed', () => {
  test('a make already typed survives an extraction that disagrees', async ({ page }) => {
    await toVehicleStep(page);
    await page.getByLabel('Marca').fill('Dacia');

    await stubExtraction(page, {
      ok: true,
      fields: { make: 'Volkswagen', model: 'Golf' },
      dropped: [],
    });
    await page.getByLabel('Adresa anunțului').fill('https://anunturi.example.ro/auto/golf');
    await page.getByRole('button', { name: 'Completează din link' }).click();

    await expect(page.getByLabel('Marca')).toHaveValue('Dacia');
    await expect(page.getByLabel('Modelul')).toHaveValue('Golf');
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the panel fits without sideways scrolling', async ({ page }) => {
    await toVehicleStep(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
