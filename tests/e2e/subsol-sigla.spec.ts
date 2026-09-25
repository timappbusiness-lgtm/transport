import { expect, test, type Page } from '@playwright/test';
import { BRAND_NAME } from '../../src/config/brand';
import { MARK } from '../../src/config/brand-mark';
import { CONSUMER_REDRESS, REDRESS_LABEL, RETIRED_REDRESS } from '../../src/config/consumer-redress';
import { ROUTES } from '../../src/config/routes';

/**
 * The footer's consumer-redress row and the logo, where people see them.
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

test.describe('the consumer-redress row in the footer', () => {
  for (const where of PAGES) {
    test(`is on ${where.name}, in a row of its own`, async ({ page }) => {
      await page.goto(where.path);
      const row = await redressRow(page);
      await expect(row).toBeVisible();

      for (const entry of CONSUMER_REDRESS) {
        const link = row.getByRole('link', { name: new RegExp(entry.label) });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', entry.href);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', /\bnoopener\b/);
        // A tap target a thumb can hit.
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(24);
      }

      // Not mixed in with the navigation: nothing in the footer's nav
      // points outside the site, and the row holds nothing but redress.
      const nav = page.getByRole('contentinfo').getByRole('navigation', { name: 'Secundar' });
      await expect(nav.locator('a[target="_blank"]')).toHaveCount(0);
      await expect(row.getByRole('link')).toHaveCount(CONSUMER_REDRESS.length);
    });
  }

  test('never links to the closed European platform', async ({ page }) => {
    for (const where of PAGES) {
      await page.goto(where.path);
      await expect(page.locator(`a[href^="${RETIRED_REDRESS.sol.href}"]`)).toHaveCount(0);
      await expect(page.getByText(RETIRED_REDRESS.sol.label)).toHaveCount(0);
    }
  });

  test('opens the ANPC page in a new tab and leaves this one where it was', async ({ page, context }) => {
    // The real site is not reachable from the test machine; what is under
    // test is where the link goes and how, not ANPC's server.
    for (const entry of CONSUMER_REDRESS) {
      await context.route(`${entry.href}**`, (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ANPC</title>' }),
      );
    }
    await page.goto(ROUTES.home);
    const row = await redressRow(page);
    for (const entry of CONSUMER_REDRESS) {
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        row.getByRole('link', { name: new RegExp(entry.label) }).click(),
      ]);
      await popup.waitForLoadState();
      expect(popup.url()).toBe(entry.href);
      // `noopener`: the new tab cannot reach back into ours.
      expect(await popup.evaluate(() => window.opener)).toBeNull();
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
        await expect(mark.locator(`path[d="${MARK.ramp}"]`)).toHaveCount(1);
        expect((await mark.boundingBox())!.width).toBe(24);

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
