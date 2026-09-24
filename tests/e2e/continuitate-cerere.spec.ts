import { expect, test, type Page } from '@playwright/test';

/**
 * The reported bug, and everything around it: the request form keeps its
 * place.
 *
 * Before, the step lived in React state. A refresh on step 2, 3 or 4 — or
 * the way back from signing in — landed on step 1 with the answers still
 * there and nothing to say why. Now the step is in the address and the
 * draft is in the browser (and on the account, once there is one), so
 * every interruption lands on the same step with the same data.
 *
 * Runs in both Playwright projects: desktop, and a phone at 390.
 * Signed out, because that is what CI has; the real sign-in round trip is
 * in continuitate-supabase.spec.ts.
 */

const FUTURE = '2030-06-01';

async function fillRoute(page: Page) {
  await page.getByLabel('Oraș de plecare').fill('München');
  await page.getByLabel('Țara de plecare').selectOption('DE');
  await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
  await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
}

async function fillVehicle(page: Page) {
  await page.getByLabel('Marca').fill('Volkswagen');
  await page.getByLabel('Modelul').fill('Golf');
  await page.getByLabel('Anul fabricației').fill('2018');
}

const next = (page: Page) => page.getByRole('button', { name: 'Continuă' });
const current = (page: Page, step: string) =>
  page.locator(`[data-step="${step}"][data-state="current"]`);

/** The draft is written on every change; this waits for the last one. */
async function saved(page: Page) {
  await expect(page.locator('[data-draft-status="saved"]')).toBeVisible();
}

async function toContact(page: Page) {
  await page.goto('/cerere/noua');
  await fillRoute(page);
  await next(page).click();
  await expect(current(page, 'vehicul')).toBeVisible();
  await fillVehicle(page);
  await next(page).click();
  await expect(current(page, 'serviciu')).toBeVisible();
  await next(page).click();
  await expect(current(page, 'contact')).toBeVisible();
}

test.describe('the request form keeps its place', () => {
  test('the step is in the address, and a refresh on every step stays on it', async ({ page }) => {
    await page.goto('/cerere/noua');
    await expect(page).toHaveURL(/\/cerere\/noua$/);
    await fillRoute(page);
    await saved(page);
    await page.reload();
    await expect(current(page, 'ruta')).toBeVisible();
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('München');

    await next(page).click();
    await expect(page).toHaveURL(/\?pas=vehicul$/);
    await fillVehicle(page);
    await saved(page);
    await page.reload();
    await expect(current(page, 'vehicul')).toBeVisible();
    await expect(page.getByLabel('Marca')).toHaveValue('Volkswagen');
    await expect(page.getByLabel('Anul fabricației')).toHaveValue('2018');

    await next(page).click();
    await expect(page).toHaveURL(/\?pas=serviciu$/);
    await page.reload();
    await expect(current(page, 'serviciu')).toBeVisible();

    await next(page).click();
    await expect(page).toHaveURL(/\?pas=contact$/);
    // Signed out, the contact itself comes from the account; what is left
    // to type here is a note for the carrier.
    await page.locator('[data-optional="contact"] > summary').click();
    await page.getByLabel('Altceva de spus (opțional)').fill('Mașina e în curtea din spate.');
    await saved(page);
    await page.reload();
    await expect(current(page, 'contact')).toBeVisible();
    // The box opens by itself: it holds something.
    await expect(page.getByLabel('Altceva de spus (opțional)')).toBeVisible();
    await expect(page.getByLabel('Altceva de spus (opțional)')).toHaveValue('Mașina e în curtea din spate.');
    // Everything above is still there: the summary reads it back.
    await expect(page.locator('[data-summary-block="ruta"]')).toContainText('München');
    await expect(page.locator('[data-summary-block="vehicul"]')).toContainText('Volkswagen Golf 2018');
    // And the page says it resumed, with the way out.
    await expect(page.locator('[data-draft-restored]')).toBeVisible();
  });

  test('back and forward in the browser move between steps without losing input', async ({ page }) => {
    await toContact(page);
    await page.goBack();
    await expect(current(page, 'serviciu')).toBeVisible();
    await page.goBack();
    await expect(current(page, 'vehicul')).toBeVisible();
    await expect(page.getByLabel('Modelul')).toHaveValue('Golf');
    await page.goBack();
    await expect(current(page, 'ruta')).toBeVisible();
    await expect(page.getByLabel('Oraș de destinație')).toHaveValue('Cluj-Napoca');
    await page.goForward();
    await expect(current(page, 'vehicul')).toBeVisible();
    await expect(page.getByLabel('Marca')).toHaveValue('Volkswagen');
  });

  test('a step that cannot be reached yet goes to the last valid one, without shouting', async ({ page }) => {
    // Nothing filled in: step four is step one, and nothing is red.
    await page.goto('/cerere/noua?pas=contact');
    await expect(current(page, 'ruta')).toBeVisible();
    await expect(page).toHaveURL(/\/cerere\/noua$/);
    await expect(page.locator('[data-field-error]')).toHaveCount(0);

    // The route done, the vehicle not: `?pas=4` is the vehicle step.
    await fillRoute(page);
    await saved(page);
    await page.goto('/cerere/noua?pas=4');
    await expect(current(page, 'vehicul')).toBeVisible();
    await expect(page).toHaveURL(/\?pas=vehicul$/);
    await expect(page.locator('[data-field-error]')).toHaveCount(0);
  });

  test('a step that was filled in and is no longer valid says what is missing', async ({ page }) => {
    await toContact(page);
    // The draft as the next morning might find it: the loading date passed.
    await page.evaluate(() => {
      const key = 'coridor.ciorna.cerere';
      const envelope = JSON.parse(localStorage.getItem(key) ?? '{}');
      envelope.payload.draft.loadingFrom = '2020-01-01';
      localStorage.setItem(key, JSON.stringify(envelope));
    });
    await page.reload();
    await expect(current(page, 'ruta')).toBeVisible();
    await expect(page.locator('[data-field-error]').first()).toBeVisible();
    // The date is kept as it was, not dropped: the person corrects it.
    await expect(page.getByLabel('Poate fi încărcat de la')).toHaveValue('2020-01-01');
  });

  test('editing the summary on the last step stays on the last step', async ({ page }) => {
    await toContact(page);
    const route = page.locator('[data-summary-block="ruta"]');
    await route.getByRole('button', { name: /Modifică/ }).click();
    await route.getByLabel('Oraș de plecare').fill('');
    await expect(current(page, 'contact')).toBeVisible();
  });

  test('sign-in and sign-up from step four carry the exact step, through every page on the way', async ({ page }) => {
    await toContact(page);
    const back = encodeURIComponent('/cerere/noua?pas=contact');
    const panel = page.locator('[data-account-step="needed"]');
    await expect(panel.getByRole('link', { name: 'Am deja cont' })).toHaveAttribute(
      'href',
      `/autentificare?next=${back}`,
    );
    await expect(panel.getByRole('link', { name: 'Fă-ți cont gratuit' })).toHaveAttribute(
      'href',
      `/inregistrare/persoana-fizica?next=${back}`,
    );

    await panel.getByRole('link', { name: 'Am deja cont' }).click();
    await expect(page).toHaveURL(`/autentificare?next=${back}`);
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
    // A forgotten password, and the switch to sign-up, keep the place too.
    await expect(page.getByRole('link', { name: 'Ai uitat parola?' })).toHaveAttribute(
      'href',
      `/resetare-parola?next=${back}`,
    );
    await expect(page.getByRole('link', { name: 'Creează un cont' })).toHaveAttribute(
      'href',
      `/inregistrare?next=${back}`,
    );
    await page.getByRole('link', { name: 'Ai uitat parola?' }).click();
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');
    await page.goto(`/inregistrare?next=${back}`);
    await expect(page.getByRole('link', { name: 'Continuă ca persoană fizică' })).toHaveAttribute(
      'href',
      `/inregistrare/persoana-fizica?next=${back}`,
    );
    await expect(page.getByRole('link', { name: 'Continuă ca firmă' })).toHaveAttribute(
      'href',
      `/inregistrare/firma?next=${back}`,
    );
    await page.goto(`/inregistrare/firma?next=${back}`);
    await expect(page.locator('input[name="next"]')).toHaveValue('/cerere/noua?pas=contact');

    // Coming back — which is where signing in sends the browser — lands on
    // step four with everything in it.
    await page.goto('/cerere/noua?pas=contact');
    await expect(current(page, 'contact')).toBeVisible();
    await expect(page.locator('[data-summary-block="vehicul"]')).toContainText('Volkswagen Golf');
  });

  test('a link that is not ours is never followed after sign-in', async ({ page }) => {
    await page.goto('/autentificare?next=https://evil.example/cerere');
    await expect(page.locator('input[name="next"]')).toHaveValue('/cont');
    await page.goto('/inregistrare?next=//evil.example');
    await expect(page.getByRole('link', { name: 'Continuă ca persoană fizică' })).toHaveAttribute(
      'href',
      '/inregistrare/persoana-fizica',
    );
  });

  test('a closed tab reopened finds the draft; „Începe din nou" empties it', async ({ page, context }) => {
    await toContact(page);
    await page.locator('[data-optional="contact"] > summary').click();
    await page.getByLabel('Altceva de spus (opțional)').fill('Predă mașina fratele meu.');
    await saved(page);
    await page.close();

    const again = await context.newPage();
    await again.goto('/cerere/noua?pas=contact');
    await expect(current(again, 'contact')).toBeVisible();
    await expect(again.getByLabel('Altceva de spus (opțional)')).toHaveValue('Predă mașina fratele meu.');

    again.once('dialog', (dialog) => void dialog.accept());
    await again.locator('[data-draft-restored]').getByRole('button', { name: 'Începe din nou' }).click();
    await expect(current(again, 'ruta')).toBeVisible();
    await expect(again.getByLabel('Oraș de plecare')).toHaveValue('');
    await again.reload();
    await expect(again.locator('[data-draft-restored]')).toHaveCount(0);
    await expect(again.getByLabel('Oraș de plecare')).toHaveValue('');
  });

  test('a calculator link seeds the draft once, and a refresh does not seed it again', async ({ page }) => {
    await page.goto('/cerere/noua?plecare=Timi%C8%99oara%7CRO&sosire=Ia%C8%99i%7CRO');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('Timișoara');
    // The choices come off the address once they are in the draft.
    await expect(page).toHaveURL(/\/cerere\/noua$/);
    await page.getByLabel('Oraș de plecare').fill('Arad');
    await saved(page);
    await page.reload();
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('Arad');
    await expect(page.getByLabel('Oraș de destinație')).toHaveValue('Iași');
  });

  test('nothing on the page scrolls sideways on a phone, on any step', async ({ page }) => {
    await toContact(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
