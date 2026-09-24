import { expect, test, type Page } from '@playwright/test';
import { coveredByBar } from './layout-probe';
import { openMenu, settled } from './settled';

/**
 * Interactions that looked broken without anything being "wrong" in the
 * markup: a field under the bar it belongs to, a menu cut off by the
 * bottom of a phone held sideways, two filled buttons on one screen.
 */

const FUTURE = '2030-06-01';
const next = (page: Page) => page.getByRole('button', { name: 'Continuă' });

async function tabThrough(page: Page, steps: number): Promise<string[]> {
  const hidden = new Set<string>();
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    const covered = await coveredByBar(page);
    if (covered !== null) hidden.add(covered);
  }
  return [...hidden];
}

test.describe('the request form on a phone', () => {
  test('no field of the vehicle step ends up under „Continuă"', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The bar is sticky on a phone only.');
    // A short screen, where it happened most: the year field and the
    // „Mai multe" box scrolled into view right under the bar.
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
    await page.getByLabel('Oraș de destinație').fill('București');
    await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await next(page).click();
    await expect(page.getByLabel('Marca')).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByLabel('Marca').focus();
    expect(await tabThrough(page, 30)).toEqual([]);
  });
});

test.describe('menus near the edge of the screen', () => {
  test('the phone menu reaches its last link on a phone held sideways', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone only.');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    expect(await openMenu(page)).toBe(true);

    const nav = page.getByRole('navigation', { name: 'Navigare' });
    const box = await nav.evaluate((el) => {
      const panel = el.closest('[id]') ?? el;
      const r = panel.getBoundingClientRect();
      return { bottom: r.bottom, overflowY: getComputedStyle(panel).overflowY };
    });
    // Either it fits, or it scrolls inside itself.
    if (box.bottom > 390) expect(box.overflowY).toBe('auto');
    const last = nav.getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});

test.describe('one filled button per decision', () => {
  // The accent fill of a primary button, and its bright step on a dark
  // section. A selected segment of a toggle is not a button to press.
  const FILLED = ['rgb(21, 97, 109)'];

  async function filledIn(page: Page, scope: string): Promise<string[]> {
    return page.locator(scope).evaluate(
      (root, fills) =>
        Array.from(root.querySelectorAll<HTMLElement>('a, button'))
          .filter(
            (el) =>
              fills.includes(getComputedStyle(el).backgroundColor) &&
              el.checkVisibility() &&
              el.getAttribute('aria-pressed') === null &&
              el.getAttribute('aria-current') === null,
          )
          .map((el) => el.textContent?.trim() ?? ''),
      FILLED,
    );
  }

  for (const path of ['/cereri', '/trasee']) {
    test(`${path} empty: the filter is not a second primary`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      // „Caută" was filled in the accent beside „Publică o cerere"; the
      // existing check counted links only and never saw the button.
      expect(await filledIn(page, 'main')).toHaveLength(1);
    });
  }

  test('the homepage activity section has one filled button', async ({ page }) => {
    await page.goto('/');
    // The empty card and the publishing card below it both had a filled
    // „Publică o cerere", 200px apart.
    expect(await filledIn(page, '#cereri')).toHaveLength(1);
  });
});

/**
 * The account's own layers, drawn on `/proba/ecrane` with a sample
 * session (E2E_HARNESS=1): the account needs a session CI does not have.
 */
const HARNESS = (section: string) => `/proba/ecrane?sectiune=${section}`;

test.describe('the „Mai mult" sheet on a phone', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The bottom menu is there below lg only.');
    await page.goto(HARNESS('cont-mobil'));
  });

  async function openSheet(page: Page) {
    const more = page.locator('[data-bottom-nav] button[aria-expanded]');
    await expect(async () => {
      if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 500 });
    }).toPass();
    return { more, dialog: page.getByRole('dialog') };
  }

  test('the page behind it stays put, and moves again once it closes', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 400));
    const at = await page.evaluate(() => window.scrollY);
    await openSheet(page);

    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    // A drag on the dimmed page, where it used to scroll the account.
    await page.mouse.move(195, 120);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(at);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  });

  test('the focus stays inside while it is open and goes back to „Mai mult"', async ({ page }) => {
    const { more, dialog } = await openSheet(page);
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    for (let step = 0; step < 20; step += 1) {
      await page.keyboard.press(step % 5 === 4 ? 'Shift+Tab' : 'Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Tab ${step}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
  });

  test('a tap on the dimmed page closes it and gives the focus back too', async ({ page }) => {
    const { more } = await openSheet(page);
    await page.mouse.click(195, 60);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test('the sheet is never taller than the screen', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const { dialog } = await openSheet(page);
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    await expect(dialog.getByRole('link').last()).toBeVisible();
  });
});

test.describe('bars at the bottom of the account', () => {
  for (const [section, bar] of [
    ['cont-mobil', '[data-save-bar]'],
    ['mesaje', '[data-composer]'],
  ] as const) {
    test(`${section}: the bar sits above the phone menu, not under it`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'The bottom menu is there below lg only.');
      await page.goto(HARNESS(section));
      const pinned = (await page.locator(bar).boundingBox())!;
      const menu = (await page.locator('[data-bottom-nav]').boundingBox())!;
      expect(pinned.y + pinned.height).toBeLessThanOrEqual(menu.y + 1);
    });
  }

  test('the footer comes out from under the phone menu at the end of the page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The bottom menu is there below lg only.');
    await page.goto(HARNESS('cereri-mele'));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = page.locator('footer a').last();
    const link = (await last.boundingBox())!;
    const menu = (await page.locator('[data-bottom-nav]').boundingBox())!;
    expect(link.y + link.height).toBeLessThanOrEqual(menu.y);
  });
});

test.describe('the account menu and the publish menu at the edges', () => {
  test('the sidebar reaches its last link on a 900px screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The sidebar is there from lg.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS('comanda'));
    // Far enough down that the sidebar is stuck to the top.
    await page.evaluate(() => window.scrollTo(0, 800));
    const last = page.locator('aside nav a').last();
    await last.focus();
    await expect(last).toBeInViewport({ ratio: 1 });
  });

  test('„Publică" opens its menu on the screen, wherever the button wrapped to', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(HARNESS('dashboard'));
    const button = page.locator('button[aria-haspopup="menu"]').first();
    const menu = page.getByRole('menu');
    await expect(async () => {
      if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
      await expect(menu).toBeVisible({ timeout: 500 });
    }).toPass();
    const box = (await menu.boundingBox())!;
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    // At 390, before: hung from the button's right edge, 100px off screen.
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    for (const item of await menu.getByRole('menuitem').all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
  });
});
