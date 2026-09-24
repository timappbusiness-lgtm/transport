import { expect, test, type Page } from '@playwright/test';
import { moreFilters, openMoreFilters, settled } from './settled';

/**
 * „Mai multe filtre" is closed on every first load, on every search screen.
 *
 * It used to open by itself whenever the address carried a filter from
 * inside it — and on /cereri a carrier's default view counted as one, so
 * the panel was spread open on every visit. Now the count on the button
 * and a removable chip per filter say what is applied, and the panel
 * opens only when somebody opens it.
 *
 * Every screen with a panel is here. The public three are the real pages,
 * which render without a database; the five staff lists need a session,
 * so their real panels are drawn on the harness (`/proba/ecrane`) with
 * the form and every chip pointing back at it. Both Playwright projects
 * run this file, so each check also runs at 390px.
 */

interface Screen {
  name: string;
  /** Nothing applied. */
  path: string;
  /** Advanced filters in the address, and main ones or a sort beside them. */
  withAdvanced: string;
  count: number;
  /** One per chip, in order. */
  chips: RegExp[];
  /** The chip removed, the key it takes out, and what must survive. */
  remove: { chip: RegExp; key: string; keeps: Record<string, string> };
}

const H = '/proba/ecrane?sectiune=';

const SCREENS: Screen[] = [
  {
    name: '/cereri',
    path: '/cereri',
    withAdvanced: '/cereri?oras-plecare=Cluj-Napoca&tara-plecare=DE&serviciu=expres&ordine=incarcare',
    count: 2,
    chips: [/Expres/, /Germania/],
    remove: {
      chip: /Germania/,
      key: 'tara-plecare',
      keeps: { 'oras-plecare': 'Cluj-Napoca', serviciu: 'expres', ordine: 'incarcare' },
    },
  },
  {
    name: '/trasee',
    path: '/trasee',
    withAdvanced: '/trasee?judet-plecare=Cluj&tara-plecare=DE&locuri=2&ordine=locuri',
    count: 2,
    chips: [/Locuri libere, minimum 2/, /Germania/],
    remove: {
      chip: /Germania/,
      key: 'tara-plecare',
      keeps: { 'judet-plecare': 'Cluj', locuri: '2', ordine: 'locuri' },
    },
  },
  {
    name: '/firme',
    path: '/firme',
    withAdvanced: '/firme?q=Trans&acoperire=international',
    count: 1,
    chips: [/Acoperire: Internațional/],
    remove: { chip: /Internațional/, key: 'acoperire', keeps: { q: 'Trans' } },
  },
  {
    name: '/admin/oferte',
    path: `${H}admin-oferte`,
    withAdvanced: `${H}admin-oferte&stare=pending&de-la=2026-09-01&pana-la=2026-09-30`,
    count: 2,
    chips: [/De la: 01\.09\.2026/, /Până la: 30\.09\.2026/],
    remove: {
      chip: /De la/,
      key: 'de-la',
      keeps: { sectiune: 'admin-oferte', stare: 'pending', 'pana-la': '2026-09-30' },
    },
  },
  {
    name: '/admin/transporturi',
    path: `${H}admin-transporturi`,
    withAdvanced: `${H}admin-transporturi&dispute=da&pana-la=2026-09-30`,
    count: 1,
    chips: [/Până la: 30\.09\.2026/],
    remove: {
      chip: /Până la/,
      key: 'pana-la',
      keeps: { sectiune: 'admin-transporturi', dispute: 'da' },
    },
  },
  {
    name: '/admin/anunturi',
    path: `${H}admin-anunturi`,
    withAdvanced: `${H}admin-anunturi&fel=trasee&sesizate=da&ascunse=da&de-la=2026-09-01`,
    count: 2,
    chips: [/De la: 01\.09\.2026/, /Doar ascunse/],
    remove: {
      chip: /Doar ascunse/,
      key: 'ascunse',
      // The „cereri / trasee" view is not a filter, and survives.
      keeps: { sectiune: 'admin-anunturi', fel: 'trasee', sesizate: 'da', 'de-la': '2026-09-01' },
    },
  },
  {
    name: '/admin/evaluari',
    path: `${H}admin-evaluari`,
    withAdvanced: `${H}admin-evaluari&nota=1&ascunse=da`,
    count: 1,
    chips: [/Doar ascunse/],
    remove: { chip: /Doar ascunse/, key: 'ascunse', keeps: { sectiune: 'admin-evaluari', nota: '1' } },
  },
  {
    name: '/admin/jurnal',
    path: `${H}admin-jurnal`,
    withAdvanced: `${H}admin-jurnal&actiune=offer.accept&de-la=2026-09-01`,
    count: 1,
    chips: [/De la: 01\.09\.2026/],
    remove: {
      chip: /De la/,
      key: 'de-la',
      keeps: { sectiune: 'admin-jurnal', actiune: 'offer.accept' },
    },
  },
];

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await settled(page);
}

function focusInsidePanel(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('[data-advanced-panel]') != null);
}

for (const screen of SCREENS) {
  test.describe(`„Mai multe filtre" on ${screen.name}`, () => {
    test('closed on first load, with its button saying so', async ({ page }) => {
      await visit(page, screen.path);
      const { button, panel } = moreFilters(page);

      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();

      // aria-controls names the panel it opens.
      const controls = await button.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(await panel.getAttribute('id')).toBe(controls);

      // Nothing applied: no count on the button, no chips.
      await expect(page.locator('[data-filter-chips]')).toHaveCount(0);
      await expect(button).toHaveText(/^\s*Mai multe filtre\s*$/);
    });

    test('still closed with advanced filters in the address; count and chips say what is on', async ({
      page,
    }) => {
      await visit(page, screen.withAdvanced);
      const { button, panel } = moreFilters(page);

      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
      await expect(button).toContainText(String(screen.count));

      const chips = page.locator('[data-filter-chips] [data-chip]');
      await expect(chips).toHaveCount(screen.count);
      for (const [index, label] of screen.chips.entries()) {
        await expect(chips.nth(index)).toContainText(label);
      }

      // One way to clear: at the end of the chips, not a second link below.
      await expect(page.locator('[data-chip-clear]')).toBeVisible();
      await expect(page.locator('[data-filter-reset]')).toHaveCount(0);
    });

    test('opens and closes with the mouse, and moves focus into the panel', async ({ page }) => {
      await visit(page, screen.path);
      const { button, panel } = moreFilters(page);

      await openMoreFilters(page);
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();
      await expect.poll(() => focusInsidePanel(page)).toBe(true);

      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
    });

    test('opens with Enter and closes with Space', async ({ page }) => {
      await visit(page, screen.path);
      const { button, panel } = moreFilters(page);

      // Repeated until React has attached, as a person would press again.
      await expect(async () => {
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(button).toHaveAttribute('aria-expanded', 'true', { timeout: 500 });
      }).toPass();
      await expect(panel).toBeVisible();
      await expect.poll(() => focusInsidePanel(page)).toBe(true);

      await button.focus();
      await page.keyboard.press('Space');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
    });

    test('removing a chip takes out that filter and keeps the rest', async ({ page }) => {
      await visit(page, screen.withAdvanced);
      const chip = page.locator('[data-filter-chips] [data-chip]', { hasText: screen.remove.chip });
      await chip.click();

      await expect.poll(() => new URL(page.url()).searchParams.has(screen.remove.key)).toBe(false);
      const params = new URL(page.url()).searchParams;
      for (const [key, value] of Object.entries(screen.remove.keeps)) {
        expect(params.get(key), key).toBe(value);
      }

      // The page followed the address: one chip fewer, the count with it,
      // the field inside the panel emptied — and the panel still shut.
      await expect(page.locator('[data-filter-chips] [data-chip]')).toHaveCount(screen.count - 1);
      const field = page.locator(`[data-advanced-panel] [name="${screen.remove.key}"]`).first();
      if ((await field.getAttribute('type')) === 'checkbox') await expect(field).not.toBeChecked();
      else await expect(field).toHaveValue('');
      await expect(moreFilters(page).panel).toBeHidden();

      // „Șterge filtrele" takes the rest.
      if (screen.count > 1) {
        await page.locator('[data-chip-clear]').click();
        await expect(page.locator('[data-filter-chips]')).toHaveCount(0);
      }
    });

    test('remembered in this tab, forgotten in a new one', async ({ page, context }) => {
      await visit(page, screen.path);
      await openMoreFilters(page);

      // Same tab: a search or a reload finds it the way it was left.
      await page.reload();
      await settled(page);
      await expect(moreFilters(page).button).toHaveAttribute('aria-expanded', 'true');

      // A new tab is a new visit, and a new visit starts closed.
      const other = await context.newPage();
      await visit(other, screen.path);
      await expect(moreFilters(other).panel).toBeHidden();
      // Nothing carried over for it to open from, so it stays closed after hydration too.
      const key = `coridor:mai-multe-filtre:${await moreFilters(other).root.getAttribute('data-advanced-filters')}`;
      expect(await other.evaluate((k) => sessionStorage.getItem(k), key)).toBeNull();
      expect(await page.evaluate((k) => sessionStorage.getItem(k), key)).toBe('deschis');
      await expect(moreFilters(other).button).toHaveAttribute('aria-expanded', 'false');
      await other.close();

      // Closed by the person, it stays closed on the next load.
      await moreFilters(page).button.click();
      await expect(moreFilters(page).button).toHaveAttribute('aria-expanded', 'false');
      await page.reload();
      await settled(page);
      await expect(moreFilters(page).panel).toBeHidden();
    });

    test('a new browser session starts closed, even after it was left open', async ({ page, browser }) => {
      await visit(page, screen.path);
      await openMoreFilters(page);

      const fresh = await browser.newContext();
      const visitor = await fresh.newPage();
      await visit(visitor, screen.path);
      await expect(moreFilters(visitor).button).toHaveAttribute('aria-expanded', 'false');
      await expect(moreFilters(visitor).panel).toBeHidden();
      await fresh.close();
    });
  });
}

test.describe('the boards keep their sort outside the panel', () => {
  for (const path of ['/cereri', '/trasee']) {
    test(`${path}: the sort is on screen with the panel closed`, async ({ page }) => {
      await visit(page, path);
      const sort = page.locator('[data-sort]');
      await expect(sort).toBeVisible();
      await expect(moreFilters(page).panel).toBeHidden();
      expect(await sort.evaluate((n) => n.closest('[data-advanced-panel]') === null)).toBe(true);
    });
  }
});

test.describe('on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'phone width only');

  for (const screen of SCREENS) {
    test(`${screen.name}: a full-width button, chips that wrap, nothing sideways`, async ({ page }) => {
      await visit(page, screen.withAdvanced);
      const { button } = moreFilters(page);
      const box = await button.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      const chipsBox = await page.locator('[data-filter-chips]').boundingBox();
      expect((chipsBox?.x ?? 0) + (chipsBox?.width ?? 0)).toBeLessThanOrEqual(390);

      await openMoreFilters(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test('without JavaScript the panel is simply shown', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/cereri?tara-plecare=DE');
  await expect(page.locator('[data-advanced-panel] select').first()).toBeVisible();
  await context.close();
});
