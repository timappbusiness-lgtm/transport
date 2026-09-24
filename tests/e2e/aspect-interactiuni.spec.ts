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
