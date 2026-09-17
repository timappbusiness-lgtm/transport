import { expect, test } from '@playwright/test';
import { UNBUILT_ROUTES } from '../../src/config/routes';

test.describe('homepage', () => {
  test('serves one h1 and the brand in the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('cu firme verificate');
    await expect(page.locator('header')).toContainText('Coridor');
  });

  test('the document is in Romanian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await page.goto('/');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('the page does not scroll horizontally at 360px either', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('focus rings are ink, not the hairline border', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.outlineColor, width: s.outlineWidth };
    });
    // #1c262b — ink, 14.37:1 on the ground. The card hairline #e2e7e9 is
    // 1.25:1 and would be invisible as a focus indicator.
    expect(outline?.color).toBe('rgb(28, 38, 43)');
    expect(outline?.width).not.toBe('0px');
  });

  test('the first Tab reaches the skip link', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Sari la conținut');
  });

  test('every demonstration card is labelled as a sample', async ({ page }) => {
    await page.goto('/');
    // Legal requirement, not decoration: nothing on this page holds real
    // data yet, so anything shaped like data says so.
    await expect(page.getByText('Exemplu').first()).toBeVisible();
    const count = await page.getByText('Exemplu').count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('states no live counters and no social proof', async ({ page }) => {
    await page.goto('/');
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('în timp real');
    expect(body).not.toMatch(/\d[\d.,]*\+?\s*(de\s+)?(utilizatori|clienți|persoane)/);
  });

  test('labels prices as orientativ', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/orientativ/i).first()).toBeVisible();
  });

  test('the price tabs are reachable by keyboard', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('every internal link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test('an anchor jump clears the floating header', async ({ page }) => {
    await page.goto('/');
    for (const id of ['cum-functioneaza', 'transportatori', 'siguranta', 'tarife']) {
      await page.evaluate((target) => {
        location.hash = '';
        location.hash = target;
      }, id);
      const gap = await page.evaluate((target) => {
        const section = document.getElementById(target)!;
        const header = document.querySelector('header')!;
        return section.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
      }, id);
      // The header floats over the page, so without scroll-padding-top the
      // heading lands underneath it and the section looks decapitated.
      expect(gap, id).toBeGreaterThanOrEqual(0);
    }
  });

  test('the header pills stay on one line on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    const heights = await page
      .locator('header a, header button')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => Math.round(el.getBoundingClientRect().height)),
      );
    expect(heights.length).toBeGreaterThan(0);
    // A wrapped label grows the pill past the 56px bar it sits in.
    for (const height of heights) expect(height).toBeLessThanOrEqual(40);
  });

  test('every in-page anchor has a target', async ({ page }) => {
    await page.goto('/');
    const missing = await page.locator('a[href^="#"]').evaluateAll((as) =>
      as
        .map((a) => a.getAttribute('href')!.slice(1))
        .filter((id) => !document.getElementById(id)),
    );
    expect(missing).toEqual([]);
  });
});

test.describe('unbuilt routes', () => {
  for (const route of UNBUILT_ROUTES) {
    test(`${route} serves a placeholder`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.getByText('Pagină în lucru')).toBeVisible();
    });
  }
});
