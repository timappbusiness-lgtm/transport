import { expect, test, type Page } from '@playwright/test';
import { openMenu, settled } from './settled';

/**
 * The visual quality pass, checked in a browser.
 *
 * Header: no overflow, no clipping, no wrapping and no duplicate entry at
 * any width from 360 to 1920, signed out on the real page and signed in
 * with a long name through the real components. Accent: visible on the
 * dark surfaces, by computed style.
 */

const LONG_NAME = 'Constantin-Alexandru Popescu-Ionescu';
const NAMED_WIDTHS = [360, 390, 768, 1280, 1440, 1920];
/** Every 40px between the two ends, plus the widths the brief names. */
const SWEEP = [...new Set([...NAMED_WIDTHS, ...Array.from({ length: 40 }, (_, i) => 360 + i * 40)])]
  .filter((w) => w <= 1920)
  .sort((a, b) => a - b);

interface HeaderProblems {
  overflow: number;
  /** Pixels of the link row scrolled out of sight inside itself. */
  hiddenInNav: number;
  escaped: string[];
  wrapped: string[];
  clipped: string[];
  labels: string[];
}

/** Everything that can go wrong with the bar, measured in one pass. */
async function inspectHeader(page: Page, selector = 'header'): Promise<HeaderProblems> {
  return page.evaluate((selector) => {
    const header = document.querySelector(selector);
    if (!header) throw new Error('no header');
    const box = header.getBoundingClientRect();
    const escaped: string[] = [];
    const wrapped: string[] = [];
    const clipped: string[] = [];
    const nav = header.querySelector('nav');
    for (const el of Array.from(header.querySelectorAll<HTMLElement>('a, button, [data-account-name]'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || el.classList.contains('sr-only')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // Inside the bar, every one of them. The link row used to be
      // allowed to scroll, and hid three of its five links on a phone.
      if (r.left < box.left - 1 || r.right > box.right + 1) {
        escaped.push(el.textContent?.trim() || el.getAttribute('aria-label') || el.tagName);
      }
      // One line of text: a label that wraps grows the pill past the bar.
      if (el.getClientRects().length > 1 || r.height > 44) {
        wrapped.push(el.textContent?.trim() ?? el.tagName);
      }
      // Cut off without an ellipsis: only the name is allowed to give.
      if (!el.hasAttribute('data-account-name') && el.scrollWidth > el.clientWidth + 1 && style.overflow !== 'visible') {
        clipped.push(el.textContent?.trim() ?? el.tagName);
      }
    }
    return {
      overflow: header.scrollWidth - header.clientWidth,
      hiddenInNav: nav ? nav.scrollWidth - nav.clientWidth : 0,
      escaped,
      wrapped,
      clipped,
      // The label without its badge: the count is a child of the link.
      labels: Array.from(nav?.querySelectorAll('a') ?? []).map(
        (a) => a.firstChild?.textContent?.trim() ?? '',
      ),
    };
  }, selector);
}

const PUBLIC_LABELS = ['Cereri', 'Trasee', 'Firme', 'Abonamente', 'Cum funcționează'];

function expectClean(problems: HeaderProblems, where: string, labels: string[] = PUBLIC_LABELS) {
  expect(problems.overflow, `${where}: the bar scrolls`).toBeLessThanOrEqual(1);
  expect(problems.hiddenInNav, `${where}: links hidden inside the row`).toBeLessThanOrEqual(1);
  expect(problems.escaped, `${where}: outside the bar`).toEqual([]);
  expect(problems.wrapped, `${where}: wraps`).toEqual([]);
  expect(problems.clipped, `${where}: clipped`).toEqual([]);
  expect(problems.labels, `${where}: the entries`).toEqual(labels);
}

test.describe('the header, signed out, on the real page', () => {
  for (const path of ['/', '/cereri']) {
    test(`${path} from 360 to 1920`, async ({ page }) => {
      for (const width of SWEEP) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        await settled(page);
        expectClean(await inspectHeader(page), `${path} at ${width}`);
        const pageOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(pageOverflow, `${path} at ${width} scrolls sideways`).toBeLessThanOrEqual(1);
      }
    });
  }
});

/**
 * The same bar with a session, for every kind of account: the real
 * components, drawn by the harness from a context written out there
 * (`src/components/proba/header-sections.tsx`), with the site's own
 * stylesheet. A carrier's bar carries a new-requests badge, which is the
 * widest the bar gets.
 */
const SIGNED_IN: { role: string; labels: string[] }[] = [
  {
    role: 'transportator',
    labels: ['Cereri de transport', 'Traseele mele', 'Oferte trimise', 'Transporturi', 'Mesaje'],
  },
  {
    role: 'expeditor',
    labels: ['Cursele mele', 'Oferte primite', 'Trasee disponibile', 'Transporturi', 'Mesaje'],
  },
  { role: 'persoana', labels: ['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile'] },
  { role: 'sofer', labels: ['Transporturile mele'] },
  { role: 'staff', labels: ['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile'] },
];

const HARNESS_HEADER = '[data-proba-antet] header';

async function mountSignedIn(page: Page, role: string) {
  await page.goto(`/proba/ecrane?sectiune=antet&rol=${role}&noi=12`);
  await settled(page);
  await page.evaluate(() => document.fonts.ready);
}

test.describe('the header, signed in with a long name', () => {
  for (const width of NAMED_WIDTHS) {
    test(`at ${width}: the name gives, nothing else does`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mountSignedIn(page, 'transportator');
      expectClean(await inspectHeader(page, HARNESS_HEADER), `signed in at ${width}`, SIGNED_IN[0]!.labels);

      const header = page.locator(HARNESS_HEADER);
      // The avatar and the chevron are always there, and whole.
      for (const part of ['[data-account-avatar]', '[data-account-chevron]']) {
        const box = await header.locator(part).boundingBox();
        expect(box?.width ?? 0, `${part} at ${width}`).toBeGreaterThanOrEqual(24);
      }

      const name = header.locator('[data-account-name]');
      if (width >= 640) {
        // Drawn, cut with an ellipsis, and whole in the title.
        await expect(name).toBeVisible();
        await expect(name).toHaveCSS('text-overflow', 'ellipsis');
        expect(await name.evaluate((n) => n.scrollWidth > n.clientWidth)).toBe(true);
        await expect(header.locator('a[title]')).toHaveAttribute('title', LONG_NAME);
      } else {
        // Read, not drawn: the phone bar is the mark, „Meniu", the button and the pill.
        await expect(name).toHaveClass(/sr-only/);
      }
    });
  }

  for (const { role, labels } of SIGNED_IN) {
    test(`${role}, from 360 to 1920 in 40px steps`, async ({ page }) => {
      for (const width of SWEEP) {
        await page.setViewportSize({ width, height: 800 });
        await mountSignedIn(page, role);
        expectClean(await inspectHeader(page, HARNESS_HEADER), `${role} at ${width}`, labels);
        const pageOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(pageOverflow, `${role} at ${width} scrolls sideways`).toBeLessThanOrEqual(1);
      }
    });
  }
});

test.describe('the public links on a phone', () => {
  for (const width of [360, 390, 768]) {
    test(`at ${width} they are behind „Meniu", whole, and close again`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/cereri');
      await settled(page);
      const toggle = page.locator('header [data-nav-toggle]');
      const nav = page.getByRole('navigation', { name: 'Navigare' });
      await expect(toggle).toHaveText('Meniu');
      await expect(nav).toBeHidden();

      await openMenu(page);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(nav).toBeVisible();
      const links = nav.getByRole('link');
      await expect(links).toHaveText(['Cereri', 'Trasee', 'Firme', 'Abonamente', 'Cum funcționează']);
      for (const link of await links.all()) {
        const box = await link.boundingBox();
        if (!box) throw new Error('no box');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await expect(nav.locator('a[aria-current="page"]')).toHaveText('Cereri');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      ).toBeLessThanOrEqual(1);

      await page.keyboard.press('Escape');
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();

      await openMenu(page);
      await nav.getByRole('link', { name: 'Firme' }).click();
      await expect(page).toHaveURL(/\/firme$/);
      await expect(nav).toBeHidden();
    });
  }

  test('from lg the row is in the bar and there is no „Meniu"', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/');
    await expect(page.locator('header [data-nav-toggle]')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Navigare' }).getByRole('link')).toHaveCount(5);
  });
});

test.describe('the accent on dark surfaces', () => {
  const BRIGHT = 'rgb(79, 209, 216)';
  const ON_BRIGHT = 'rgb(19, 35, 41)';

  test('the primary action in the bar is the bright step', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const cta = page.locator('header').getByRole('link', { name: 'Publică o cerere' });
    await expect(cta).toHaveCSS('background-color', BRIGHT);
    await expect(cta).toHaveCSS('color', ON_BRIGHT);
  });

  test('the current page in the bar is the bright step, underlined', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/cereri');
    const current = page.locator('header a[aria-current="page"]');
    await expect(current).toHaveCSS('color', BRIGHT);
    await expect(current).toHaveCSS('text-decoration-line', 'underline');
  });

  test('the hero’s primary action and its soft emphasis stand off the dark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const hero = page.locator('[data-surface="dark"]').filter({ has: page.locator('h1') }).first();
    const cta = hero.getByRole('link', { name: 'Publică o cerere' });
    await expect(cta).toHaveCSS('background-color', BRIGHT);
    const soft = hero.locator('h1 [data-soft]');
    await expect(soft).toHaveCSS('color', 'rgb(163, 220, 227)');
  });

  test('a focus ring on the bar is the bright step, not ink on ink', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/cereri');
    await settled(page);
    const link = page.locator('header').getByRole('link', { name: 'Trasee' });
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('outline-color', BRIGHT);
  });
});
