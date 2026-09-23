import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settled } from './settled';

/**
 * The publishing flow, step by step, at 1440 and 390.
 *
 * What the rebuild promised, checked in a browser: four named steps with
 * the current one marked; a message only once a field has been left, and
 * gone as soon as it is right; the categories and the choices as cards;
 * the photo area; the Back/Continue bar on the bottom of a phone; and no
 * sideways scroll on any step.
 *
 * Signed out, because that is what CI has. The signed-in photo upload is
 * in faza-1-deblocare-supabase.spec.ts; the photo area with photos in it
 * is checked here through the component's golden file.
 */

const FUTURE = '2030-06-01';
const ACCENT = 'rgb(21, 97, 109)';

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

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

/**
 * Two boxes read in the same frame. Changing step scrolls back to the top
 * of the form, so two separate reads can land on either side of a scroll.
 */
async function pair(page: Page, a: string, b: string) {
  return page.evaluate(
    ([a, b]) =>
      [a, b].map((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`missing ${sel}`);
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    [a, b] as const,
  );
}

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  const wide = width >= 640;

  test.describe(`the publishing flow at ${width}`, () => {
    test.use({ viewport: { width, height } });

    test('names the four steps and marks the current one in the accent', async ({ page }) => {
      await page.goto('/cerere/noua');
      await settled(page);
      const steps = page.locator('[data-stepper] li');
      await expect(steps).toHaveText([/Traseu/, /Vehicul/, /Serviciu/, /Contact/]);
      const current = page.locator('[data-step="ruta"][data-state="current"]');
      await expect(current).toBeVisible();
      await expect(current.locator('[aria-current="step"]')).toHaveCount(1);
      await expect(current.locator('span[aria-hidden="true"]').first()).toHaveCSS('background-color', ACCENT);
      await expect(page.locator('[data-step-head] h2')).toHaveText('De unde până unde?');
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test('route: a message when a field is left, gone once it is right', async ({ page }) => {
      await page.goto('/cerere/noua');
      await settled(page);
      // Nothing is red before anybody has done anything.
      await expect(page.locator('[data-field-error]')).toHaveCount(0);

      const city = page.getByLabel('Oraș de plecare');
      await city.focus();
      await page.getByLabel('Țara de destinație').focus();
      await expect(page.getByText('Scrie orașul de plecare.')).toBeVisible();
      await expect(city).toHaveAttribute('aria-invalid', 'true');
      await expect(city).toHaveAccessibleDescription(/Scrie orașul de plecare/);
      // Only the field that was left: the date has not been touched.
      await expect(page.getByText('Alege data de la care poate fi încărcat.')).toHaveCount(0);

      await city.fill('München');
      await expect(page.getByText('Scrie orașul de plecare.')).toHaveCount(0);
      await expect(city).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('route: Continue with something missing goes to it and says how many', async ({ page }) => {
      await page.goto('/cerere/noua');
      await settled(page);
      await page.getByLabel('Oraș de plecare').fill('München');
      await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
      await next(page).click();

      await expect(page.getByText('Mai e un lucru de completat mai sus.')).toBeVisible();
      await expect(page.getByLabel('Poate fi încărcat de la')).toBeFocused();
      await expect(page.locator('[data-step="ruta"][data-state="current"]')).toBeVisible();
    });

    test('route: the places sit side by side on a wide screen, stacked on a phone', async ({ page }) => {
      await page.goto('/cerere/noua');
      await settled(page);
      // The two place fields, read in one frame.
      const fields = page.locator('input[role="combobox"]');
      await expect(fields).toHaveCount(2);
      const boxes = await fields.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
      const [f, t] = boxes as { x: number; y: number; height: number }[];
      if (!f || !t) throw new Error('no fields');
      if (wide) expect(Math.abs(f.y - t.y)).toBeLessThanOrEqual(2);
      else expect(t.y).toBeGreaterThan(f.y + f.height);
    });

    test('route: the drawing fills in as the places are chosen', async ({ page }) => {
      await page.goto('/cerere/noua');
      await settled(page);
      const drawing = page.locator('[data-route-preview]');
      await expect(drawing).toHaveAttribute('data-state', 'empty');
      await page.getByLabel('Oraș de plecare').fill('München');
      await expect(drawing).toHaveAttribute('data-state', 'from');
      await page.getByLabel('Oraș de destinație').fill('Cluj-Napoca');
      await expect(drawing).toHaveAttribute('data-state', 'both');
      await expect(drawing.getByRole('img')).toHaveAccessibleName(/München.*Cluj-Napoca/);
      // Typed, not picked from the list: no coordinates, so no invented
      // distance. The number itself is pinned in publish-flow.test.tsx.
      await expect(drawing.locator('[data-distance]')).toHaveCount(0);
    });

    test('vehicle: categories are cards with drawings, big enough to press', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      await expect(page.locator('[data-step-head] h2')).toHaveText('Ce trebuie mutat?');

      const group = page.getByRole('radiogroup', { name: 'Categoria', exact: true });
      const cards = group.locator('[data-choice]');
      await expect(cards).toHaveCount(10);
      for (const card of await cards.all()) {
        const box = await card.boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        await expect(card.locator('svg[data-category-art]')).toBeVisible();
      }
      // Two across on a phone, five on a wide screen.
      const [a, b] = await pair(page, '[data-choice="autoturism"]', '[data-choice="autoutilitara"]');
      expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);

      await expect(cards.first()).toHaveAttribute('data-checked', 'true');
      await group.locator('[data-choice="motocicleta"]').click();
      await expect(group.getByRole('radio', { name: 'Motocicletă' })).toBeChecked();
      await expect(group.locator('[data-choice="motocicleta"]')).toHaveCSS('border-color', ACCENT);
      await expect(page.getByLabel(/Greutatea/)).toHaveAttribute('placeholder', '200');
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test('vehicle: the running choice is two clear options', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      const yes = page.getByRole('radio', { name: 'Pornește și se deplasează' });
      const no = page.getByRole('radio', { name: 'Nu pornește sau nu se deplasează' });
      await expect(yes).toBeChecked();
      await expect(yes).toHaveAccessibleDescription(/.+/);
      await expect(no).toHaveAccessibleDescription(/.+/);
      await page.getByText('Nu pornește sau nu se deplasează').click();
      await expect(no).toBeChecked();
      await expect(page.getByText('Transportatorul vine pregătit cu troliu.')).toBeVisible();
    });

    test('vehicle: signed out, the photo area says when photos can be added', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      const area = page.locator('[data-photo-panel][data-locked="true"]');
      await expect(area).toBeVisible();
      await expect(area).toContainText('Pozele le poți adăuga după ce intri în cont.');
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
    });

    test('vehicle: a message on the make when it is left empty', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      await page.getByLabel('Marca').focus();
      await page.getByLabel('Modelul').focus();
      await expect(page.getByLabel('Marca')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('[data-field-error]')).toHaveCount(1);
    });

    test('the Back and Continue bar', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      const bar = page.locator('[data-action-bar]');
      await expect(bar.getByRole('button', { name: 'Înapoi' })).toBeVisible();

      if (wide) {
        // In the flow under the step on a wide screen.
        await expect(bar).toHaveCSS('position', 'static');
        return;
      }
      // On a phone it rides along the bottom while the step scrolls.
      await expect(bar).toHaveCSS('position', 'sticky');
      await page.getByRole('radiogroup', { name: 'Categoria', exact: true }).scrollIntoViewIfNeeded();
      const box = await bar.boundingBox();
      if (!box) throw new Error('no bar');
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      expect(box.y + box.height).toBeGreaterThanOrEqual(height - 2);
      const back = await bar.getByRole('button', { name: 'Înapoi' }).boundingBox();
      const cont = await bar.getByRole('button', { name: 'Continuă' }).boundingBox();
      expect(back?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(cont?.height ?? 0).toBeGreaterThanOrEqual(44);
    });

    test('service: standard and express as two cards that compare', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      await fillVehicle(page);
      await next(page).click();
      await expect(page.locator('[data-step-head] h2')).toHaveText('Cum vrei să meargă?');

      const standard = page.locator('[data-choice="pe_sens"]');
      const expres = page.locator('[data-choice="expres"]');
      await expect(standard).toContainText('Cel mai mic preț');
      await expect(expres).toContainText('Costă mai mult');
      const [s, e] = await pair(page, '[data-choice="pe_sens"]', '[data-choice="expres"]');
      if (!s || !e) throw new Error('no cards');
      if (wide) expect(Math.abs(s.y - e.y)).toBeLessThanOrEqual(1);
      else expect(e.y).toBeGreaterThan(s.y + s.height - 1);

      await expres.click();
      await expect(page.getByRole('radio', { name: 'Expres' })).toBeChecked();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test('contact: a summary of the rest, each block editable in place', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      await fillVehicle(page);
      await next(page).click();
      await next(page).click();
      await expect(page.locator('[data-step-head] h2')).toHaveText('Unde te găsim?');

      const summary = page.locator('[data-summary]');
      await expect(summary.locator('[data-summary-block]')).toHaveCount(3);
      const route = summary.locator('[data-summary-block="ruta"]');
      await expect(route).toContainText('München');
      await expect(summary.locator('[data-summary-block="vehicul"]')).toContainText('Volkswagen Golf 2018');

      await route.getByRole('button', { name: /Modifică/ }).click();
      const city = route.getByLabel('Oraș de plecare');
      await expect(city).toHaveValue('München');
      // „Gata" runs the same checks as Continue.
      await city.fill('');
      await route.getByRole('button', { name: /Gata/ }).click();
      await expect(route.getByText('Scrie orașul de plecare.')).toBeVisible();
      await city.fill('Graz');
      await route.getByRole('button', { name: /Gata/ }).click();
      await expect(route.getByLabel('Oraș de plecare')).toHaveCount(0);
      await expect(route).toContainText('Graz');
      // Still on the last step.
      await expect(page.locator('[data-step="contact"][data-state="current"]')).toBeVisible();
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    test('a finished step is pressed to go back, and keeps what was typed', async ({ page }) => {
      await page.goto('/cerere/noua');
      await fillRoute(page);
      await next(page).click();
      await page.locator('[data-step="ruta"]').getByRole('button').click();
      await expect(page.getByLabel('Oraș de plecare')).toHaveValue('München');
      await expect(page.locator('[data-step="ruta"][data-state="current"]')).toBeVisible();
    });
  });
}

/**
 * The photo area with photos in it. The markup is the real component
 * rendered by tests/unit/photo-panel-fixture.test.tsx, on a page with the
 * site's own stylesheet.
 */
const PHOTOS = readFileSync('tests/e2e/fixtures/poze-cerere.html', 'utf8');

async function mountPhotos(page: Page) {
  await page.goto('/');
  const shell = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    bodyClass: document.body.className,
    styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (link) => (link as HTMLLinkElement).href,
    ),
  }));
  await page.setContent(
    `<!doctype html><html lang="ro" class="${shell.htmlClass}"><head>${shell.styles
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join('')}</head><body class="${shell.bodyClass}"><main style="max-width:48rem;margin:0 auto;padding:20px">${PHOTOS}</main></body></html>`,
    { waitUntil: 'load' },
  );
}

for (const width of [1440, 390]) {
  test(`the photo area with photos at ${width}: thumbnails, a remove on each, the drop area`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mountPhotos(page);
    const thumbs = page.locator('[data-photo]');
    await expect(thumbs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const thumb = thumbs.nth(i);
      const remove = thumb.getByRole('button', { name: `Scoate poza ${i + 1}` });
      await expect(remove).toBeVisible();
      const [t, r] = [await thumb.boundingBox(), await remove.boundingBox()];
      if (!t || !r) throw new Error('no box');
      // Inside its own photo, and big enough to hit.
      expect(r.x).toBeGreaterThanOrEqual(t.x);
      expect(r.x + r.width).toBeLessThanOrEqual(t.x + t.width + 1);
      expect(r.height).toBeGreaterThanOrEqual(24);
    }
    await expect(page.getByText('din anunț')).toBeVisible();
    const drop = page.locator('[data-drop]');
    await expect(drop).toBeVisible();
    await expect(drop).toContainText('Trage pozele aici');
    expect((await drop.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
}
