import { expect, test, type Page } from '@playwright/test';
import { BRAND_NAME } from '../../src/config/brand';
import { MARK } from '../../src/config/brand-mark';
import {
  CONSUMER_REDRESS,
  REDRESS_LABEL,
  redressName,
  type RedressEntry,
} from '../../src/config/consumer-redress';
import { ROUTES } from '../../src/config/routes';

/**
 * The footer's ANPC badges and the logo, where people see them.
 *
 * The account and staff areas need a session and a database the sandbox
 * does not have, so they are the harness screens: the same account shell
 * with the real sidebar (`/proba/ecrane?sectiune=cereri-mele`) and the
 * staff shell (`?sectiune=admin-acte`). The footer comes from the root
 * layout on every one of them, exactly as on the real pages.
 */

const PAGES = [
  { name: 'the homepage', path: ROUTES.home },
  { name: 'a public board', path: ROUTES.requests },
  { name: 'a legal page', path: ROUTES.terms },
  { name: 'the account area', path: '/proba/ecrane?sectiune=cereri-mele' },
  { name: 'the staff area', path: '/proba/ecrane?sectiune=admin-acte' },
] as const;

async function redressRow(page: Page) {
  const row = page.getByRole('contentinfo').getByRole('region', { name: REDRESS_LABEL });
  await row.scrollIntoViewIfNeeded();
  return row;
}

function badge(page: Page, entry: RedressEntry) {
  return page
    .getByRole('contentinfo')
    .getByRole('link', { name: `${redressName(entry)} (se deschide într-o filă nouă)`, exact: true });
}

test.describe('the ANPC badges in the footer', () => {
  for (const where of PAGES) {
    test(`are on ${where.name}, both, in a row of their own`, async ({ page }) => {
      await page.goto(where.path);
      const row = await redressRow(page);
      await expect(row).toBeVisible();

      const heights: number[] = [];
      for (const entry of CONSUMER_REDRESS) {
        const link = badge(page, entry);
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', entry.href);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(link).toContainText(entry.label, { ignoreCase: true });
        await expect(link).toContainText('Detalii', { ignoreCase: true });
        heights.push(await link.evaluate((el) => el.getBoundingClientRect().height));
      }
      // Same height, whatever the wording does.
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

      // Not mixed in with the navigation: nothing in the footer's nav
      // points outside the site, and the row holds nothing but the badges.
      const nav = page.getByRole('contentinfo').getByRole('navigation', { name: 'Secundar' });
      await expect(nav.locator('a[target="_blank"]')).toHaveCount(0);
      await expect(row.getByRole('link')).toHaveCount(CONSUMER_REDRESS.length);
    });
  }

  for (const width of [360, 390] as const) {
    test(`nothing overflows at ${width}px, and the badges stack`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const where of PAGES) {
        await page.goto(where.path);
        await redressRow(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, where.path).toBeLessThanOrEqual(0);
        const boxes = [];
        for (const entry of CONSUMER_REDRESS) {
          const box = await badge(page, entry).boundingBox();
          expect(box, `${entry.key} on ${where.path}`).not.toBeNull();
          // Inside the viewport, not clipped at either edge.
          expect(box!.x, where.path).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width, where.path).toBeLessThanOrEqual(width);
          // Its own content fits inside it.
          const clipped = await badge(page, entry).evaluate((el) =>
            [...el.querySelectorAll('span')].some((s) => s.scrollWidth > s.clientWidth + 1),
          );
          expect(clipped, `${entry.key} clips its text on ${where.path}`).toBe(false);
          boxes.push(box!);
        }
        expect(boxes[1]!.y, where.path).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
      }
    });
  }

  test('side by side from a tablet up', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(ROUTES.home);
    await redressRow(page);
    const [sol, sal] = await Promise.all(CONSUMER_REDRESS.map((e) => badge(page, e).boundingBox()));
    expect(Math.abs(sol!.y - sal!.y)).toBeLessThanOrEqual(1);
    expect(sal!.x).toBeGreaterThan(sol!.x + sol!.width);
  });

  test('each shows a focus ring when reached with the keyboard', async ({ page }) => {
    await page.goto(ROUTES.home);
    // The link before the badges, then Tab: a keyboard move, so the ring
    // the browser draws is the :focus-visible one people actually see.
    await page.getByRole('contentinfo').getByRole('navigation', { name: 'Secundar' }).getByRole('link').last().focus();
    for (const entry of CONSUMER_REDRESS) {
      await page.keyboard.press('Tab');
      const link = badge(page, entry);
      await expect(link).toBeFocused();
      const ring = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect(ring.visible).toBe(true);
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);
    }
  });

  test('open the official pages in a new tab and leave this one where it was', async ({ page, context }) => {
    // The real sites are not reachable from the test machine; what is
    // under test is where the links go and how, not the servers.
    for (const entry of CONSUMER_REDRESS) {
      await context.route(`${entry.href}**`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ANPC</title>' }),
      );
    }
    await page.goto(ROUTES.home);
    await redressRow(page);
    for (const entry of CONSUMER_REDRESS) {
      const [popup] = await Promise.all([page.waitForEvent('popup'), badge(page, entry).click()]);
      await popup.waitForLoadState();
      expect(popup.url()).toBe(entry.href);
      // `noopener`: the new tab cannot reach back into ours.
      expect(await popup.evaluate(() => window.opener)).toBeNull();
      // `noreferrer`: and it is not told which page sent it.
      expect(await popup.evaluate(() => document.referrer)).toBe('');
      await popup.close();
    }
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('the logo', () => {
  for (const width of [1440, 390] as const) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: width > 400 ? 900 : 844 } });

      test('the header shows the mark, and the name from the constant', async ({ page }) => {
        await page.goto(ROUTES.home);
        const header = page.locator('header').first();
        const mark = header.locator('svg[data-logo-mark]').first();
        await expect(mark).toBeVisible();
        await expect(mark.locator(`path[d="${MARK.car}"]`)).toHaveCount(1);
        // Polled: the header's session half replaces the signed-out one a
        // moment after load, and a box read across the swap is null.
        await expect.poll(async () => (await mark.boundingBox())?.width).toBe(24);

        const brand = header.getByRole('link', { name: BRAND_NAME }).first();
        await expect(brand).toBeVisible();
        const word = header.locator('[data-logo-word]').first();
        // Drawn from `sm` up; below it the word is read, not drawn.
        if (width >= 640) await expect(word).toBeVisible();
        else await expect(word).toHaveClass(/sr-only/);
      });

      test('the footer shows the whole lockup', async ({ page }) => {
        await page.goto(ROUTES.home);
        const logo = page.getByRole('contentinfo').locator('[data-logo="horizontal"]');
        await logo.scrollIntoViewIfNeeded();
        await expect(logo.locator('svg[data-logo-mark]')).toBeVisible();
        await expect(logo.locator('[data-logo-word]')).toHaveText(BRAND_NAME);
        await expect(logo.locator('[data-logo-word]')).toBeVisible();
      });

      test('the account sidebar shows it on a wide screen; a phone has the bottom bar instead', async ({ page }) => {
        await page.goto('/proba/ecrane?sectiune=cereri-mele');
        const sidebarLogo = page.locator('aside [data-logo="horizontal"]');
        if (width >= 1024) {
          await expect(sidebarLogo.locator('svg[data-logo-mark]')).toBeVisible();
          await expect(sidebarLogo.locator('[data-logo-word]')).toHaveText(BRAND_NAME);
          await expect(sidebarLogo.locator('[data-logo-word]')).toBeVisible();
        } else {
          // The sidebar is `lg` and up by design; the header still carries
          // the mark on a phone.
          await expect(sidebarLogo).toBeHidden();
          await expect(page.locator('header svg[data-logo-mark]').first()).toBeVisible();
        }
      });
    });
  }
});

test.describe('the files drawn from the mark', () => {
  test('the favicon, the iOS icon and the social image are linked and served', async ({ page, request }) => {
    await page.goto(ROUTES.home);
    const icons = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
      links.map((l) => (l as HTMLLinkElement).getAttribute('href') ?? ''),
    );
    expect(icons.some((href) => href.startsWith('/icon.svg'))).toBe(true);
    expect(icons).toContain('/icons/apple-touch-icon.png');

    const og = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(og).toMatch(/\/brand\/og\.png$/);

    for (const path of ['/icon.svg', '/icons/favicon-32.png', '/icons/apple-touch-icon.png', '/brand/og.png', '/brand/mark-email.png']) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });

  test('the web manifest carries the name and serves every icon it lists', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as { short_name: string; icons: { src: string; purpose: string }[] };
    expect(manifest.short_name).toBe(BRAND_NAME);
    expect(manifest.icons.map((i) => i.purpose).sort()).toEqual(['any', 'any', 'maskable', 'maskable']);
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.status(), icon.src).toBe(200);
      expect(file.headers()['content-type']).toContain('image/png');
    }
  });
});
