import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { BRAND_NAME } from '../../src/config/brand';

/**
 * Every public page, swept for the failures that do not announce
 * themselves.
 *
 * The suites next to this one each know one area well. This one knows
 * nothing about any of them, and asks the same six questions of all of
 * them: does it answer, does it render once, does it say it is Romanian,
 * does it stay inside a phone screen, does the browser complain, and do
 * its own links go anywhere.
 *
 * That is the class of bug nobody writes a test for — a page that throws
 * only when its data is empty, a link to a route that was renamed, a
 * table that pushes a phone sideways. They are found by walking the site,
 * so this walks the site.
 *
 * It runs against a build with no database configured, which is the
 * honest limit: every page here must render its empty state without
 * throwing. What data looks like when it arrives is the business of the
 * `*-supabase.spec.ts` suites.
 */

/** Public pages, in the order somebody would meet them. */
const PUBLIC_PAGES: { path: string; name: string }[] = [
  { path: '/', name: 'prima pagină' },
  { path: '/cerere/noua', name: 'formularul de cerere' },
  { path: '/cereri', name: 'panoul de cereri' },
  { path: '/trasee', name: 'traseele disponibile' },
  { path: '/preturi', name: 'prețurile orientative' },
  { path: '/verificare', name: 'cum verificăm' },
  { path: '/firme', name: 'lista de firme' },
  { path: '/abonamente', name: 'abonamentele' },
  { path: '/transportatori/inscriere', name: 'înscrierea transportatorilor' },
  { path: '/intrebari-frecvente', name: 'întrebări frecvente' },
  { path: '/transport-auto', name: 'indexul paginilor SEO' },
  { path: '/inregistrare', name: 'alegerea tipului de cont' },
  { path: '/inregistrare/persoana-fizica', name: 'înregistrare persoană fizică' },
  { path: '/inregistrare/firma', name: 'înregistrare firmă' },
  { path: '/autentificare', name: 'autentificare' },
  { path: '/resetare-parola', name: 'resetarea parolei' },
  // The three that are a contract rather than a page. They are swept
  // like the rest because the failure that matters on them is the same
  // one: a page that throws, or pushes a phone sideways, is a page
  // nobody finishes reading.
  { path: '/termeni', name: 'termeni și condiții' },
  { path: '/confidentialitate', name: 'politica de confidențialitate' },
  { path: '/cookies', name: 'cookie-uri' },
];

/**
 * Noise a browser makes that says nothing about the page.
 *
 * Kept as short as it can be. Every entry here is a message we have
 * decided not to read, so a long list is a sweep that stopped sweeping.
 */
const IGNORED_CONSOLE = [
  /Failed to load resource.*favicon/i,
  // No database in this environment; a page saying so is the empty state
  // working, not a fault. A page *throwing* over it still fails below.
  /supabase.*not configured/i,
  /Download the React DevTools/i,
];

function watchConsole(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  return { errors };
}

test.describe('every public page answers and renders', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path})`, async ({ page }) => {
      const console = watchConsole(page);

      const response = await page.goto(path);
      expect(response?.status(), `${path} status`).toBe(200);

      // One h1, or a screen reader has no idea what the page is about.
      await expect(page.locator('h1'), `${path} h1 count`).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ro');

      // A page that throws while rendering its empty state is a page that
      // breaks on the day the data runs out.
      expect(console.errors, `${path} console`).toEqual([]);
    });
  }
});

test.describe('every public page fits a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) does not scroll sideways at 390px`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A table or a long unbroken string is the usual culprit, and the
      // symptom is a page somebody can shove off the side of the screen.
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('every internal link on every public page resolves', () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path})`, async ({ page, request }) => {
      await page.goto(path);

      const hrefs: string[] = await page
        .locator('a[href^="/"]')
        .evaluateAll((anchors) => [
          ...new Set(anchors.map((a) => a.getAttribute('href')!.split('#')[0]!)),
        ]);

      const broken: string[] = [];
      for (const href of hrefs) {
        if (href === '') continue;
        const response = await request.get(href, { maxRedirects: 5 });
        // A page behind a session redirects rather than 404s, and that is
        // a working link.
        if (response.status() !== 200) broken.push(`${href} -> ${response.status()}`);
      }

      expect(broken, `broken links on ${path}`).toEqual([]);
    });
  }
});

test.describe('the site header is the same everywhere', () => {
  for (const { path } of PUBLIC_PAGES.slice(0, 8)) {
    test(`${path} carries the brand and a way back`, async ({ page }) => {
      await page.goto(path);

      // `getByRole('banner')`, not `locator('header')`: several pages open
      // with their own <header> for the title block, and a <header> inside
      // <main> is not a banner. Asking for the landmark finds the site bar
      // and asserts there is exactly one of it, which is the thing that
      // would actually be wrong.
      const banner = page.getByRole('banner');
      await expect(banner).toHaveCount(1);
      await expect(banner).toContainText(BRAND_NAME);
      await expect(banner.locator('a[href="/"]').first()).toBeVisible();
    });
  }
});
