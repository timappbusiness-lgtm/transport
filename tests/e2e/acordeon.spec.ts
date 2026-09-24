import { expect, test, type Page } from '@playwright/test';

/**
 * Opening one question grows that question and nothing beside it.
 *
 * The billing FAQ on /abonamente sat in a two-column grid: open one card
 * and the card next to it grew to the same height, empty, because a grid
 * row is as tall as its tallest cell. The same component carried the
 * same bug to /intrebari-frecvente and the homepage. The columns are now
 * independent stacks; this is the check that they stay that way, on every
 * page that has one, at 1440 and at 390.
 */

const PAGES = ['/abonamente', '/intrebari-frecvente', '/'];

interface Item {
  height: number;
  y: number;
  x: number;
  column: string | null;
}

/**
 * The FAQ's items, found by what they are rather than by a data attribute:
 * a card whose heading is the question's button. The same selector finds
 * them in the grid the bug lived in, which is how this check was shown to
 * fail before the fix.
 */
const ITEMS = 'main h3:has(> button[aria-expanded]) ';

async function measure(page: Page): Promise<Item[]> {
  return page.locator('main h3:has(> button[aria-expanded])').evaluateAll((headings) =>
    headings.map((heading) => {
      const item = heading.parentElement!;
      const r = item.getBoundingClientRect();
      return {
        height: Math.round(r.height),
        y: Math.round(r.top + window.scrollY),
        x: Math.round(r.left),
        column: item.parentElement?.getAttribute('data-faq-column') ?? null,
      };
    }),
  );
}

async function toggle(page: Page, index: number) {
  const button = page.locator(`${ITEMS}> button`).nth(index);
  const was = await button.getAttribute('aria-expanded');
  // The press is repeated until React has attached to the button.
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) === was) await button.click();
    await expect(button).not.toHaveAttribute('aria-expanded', was ?? 'false', { timeout: 500 });
  }).toPass();
}

for (const path of PAGES) {
  test.describe(`the FAQ on ${path}`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
    });

    test('opening one item changes the height of that item only', async ({ page }) => {
      const before = await measure(page);
      expect(before.length).toBeGreaterThan(1);

      // The first item, then one from the second column when there is one.
      const second = before.findIndex((item) => item.column === '1');
      for (const index of [0, ...(second > 0 ? [second] : [])]) {
        const closed = await measure(page);
        await toggle(page, index);
        const open = await measure(page);

        expect(open[index]!.height, 'the opened item grows').toBeGreaterThan(closed[index]!.height);
        open.forEach((item, other) => {
          if (other === index) return;
          expect(item.height, `item ${other} keeps its own height`).toBe(closed[other]!.height);
        });

        // A column beside it does not move either: nothing there is under
        // the opened item. (At 390 the columns are one stack, and what is
        // under it moving down is the point of opening it.)
        // Items of the same FAQ block: a page with several groups has one
        // block per group, and the next group moving down is expected.
        const beside = await page.locator(ITEMS).evaluateAll((headings, opened) => {
          const block = (h: Element) => h.parentElement!.closest('section, [data-faq-accordion]');
          const home = block(headings[opened]!);
          return headings.map((h) => block(h) === home);
        }, index);
        open.forEach((item, other) => {
          if (!beside[other] || item.x === closed[index]!.x) return;
          expect(item.y, `item ${other} in the column beside it stays put`).toBe(closed[other]!.y);
        });

        await toggle(page, index);
        const again = await measure(page);
        expect(again.map((item) => item.height), 'closing it restores every height').toEqual(
          closed.map((item) => item.height),
        );
      }
    });

    test('two columns side by side at 1440, one at 390', async ({ page }, testInfo) => {
      const columns = await page.locator('[data-faq-accordion]').first().evaluate((grid) => {
        const stacks = Array.from(grid.querySelectorAll(':scope > [data-faq-column]'));
        return new Set(stacks.map((stack) => Math.round(stack.getBoundingClientRect().left))).size;
      });
      expect(columns).toBe(testInfo.project.name === 'desktop' ? 2 : 1);
    });
  });
}
