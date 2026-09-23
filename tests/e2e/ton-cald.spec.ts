import { expect, test, type Page } from '@playwright/test';
import { settled } from './settled';

/**
 * The warmth pass, checked in a browser: where the accent is and is not,
 * that badges say nothing when there is nothing to say, that the category
 * drawing is on screen at both widths, that a slow page shows its own
 * shape instead of a blank, and that none of it scrolls sideways.
 *
 * Without Supabase the boards are empty, so this file checks the states
 * a fresh deployment is in: no data, no badges. The same components with
 * rows are rendered in `tests/unit/badges.test.tsx` and
 * `tests/unit/category-art.test.tsx`, and on a live stack in
 * `ton-cald-supabase.spec.ts`.
 */

/** The tokens, as the stylesheet defines them. */
const ACCENT = 'rgb(21, 97, 109)';
const ACCENT_ON_DARK = 'rgb(163, 220, 227)';
/** The bright step, for interactive things on the dark surfaces only. */
const ACCENT_BRIGHT = 'rgb(79, 209, 216)';
/** Every step of the scale that could read as „accent" anywhere. */
const ACCENT_FAMILY = [
  ACCENT,
  'rgb(17, 79, 89)',
  'rgb(230, 241, 242)',
  'rgb(156, 197, 203)',
  ACCENT_ON_DARK,
  ACCENT_BRIGHT,
  'rgb(127, 223, 227)',
];

/** Elements inside `root` whose text, fill or border is in the accent family. */
async function accentedIn(page: Page, root: string): Promise<string[]> {
  return page.evaluate(
    ({ root, family }) => {
      const scope = document.querySelector(root);
      if (!scope) return ['<missing root>'];
      const hits: string[] = [];
      for (const el of Array.from(scope.querySelectorAll<HTMLElement>('*'))) {
        if (el.closest('[aria-hidden="true"]')) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const hasOwnText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '',
        );
        const border = Number.parseFloat(s.borderTopWidth) > 0 ? s.borderTopColor : '';
        const used = [hasOwnText ? s.color : '', s.backgroundColor, border];
        if (used.some((c) => family.includes(c))) {
          hits.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
        }
      }
      return hits;
    },
    { root, family: ACCENT_FAMILY },
  );
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe('the accent', () => {
  test('is on the wordmark and on the primary action', async ({ page }) => {
    await page.goto('/cerere/noua');
    // The wordmark is the header's home link; on a phone its name is
    // visually hidden, and the colour is on the link either way.
    const brand = page.locator('header a[href="/"]').first();
    await expect(brand).toHaveCSS('color', ACCENT_ON_DARK);

    // „Continuă" is the form's one primary action.
    const next = page.getByRole('button', { name: 'Continuă' });
    await expect(next).toHaveCSS('background-color', ACCENT);
    await expect(next).toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('marks the current page in the public navigation', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the public links are in the menu on a phone');
    await page.goto('/cereri');
    await settled(page);
    const current = page.locator('header a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    // The bright step, underlined: the pale one was 3:1 on the old bar
    // and read as one more grey link.
    await expect(current).toHaveCSS('color', ACCENT_BRIGHT);
  });

  test('the detector below finds it where it is', async ({ page }) => {
    // A check for „no accent" that could not see the accent would pass
    // everywhere. Here it must find the primary action.
    await page.goto('/cerere/noua');
    expect((await accentedIn(page, 'main')).length).toBeGreaterThan(0);
  });

  for (const path of ['/termeni', '/confidentialitate', '/cookies']) {
    test(`is absent from the legal page ${path}`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      expect(await accentedIn(page, 'main')).toEqual([]);
    });
  }

  test('is absent from the error screen, which is Romanian', async ({ page }) => {
    const response = await page.goto('/nu-exista-pagina-asta');
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-error-screen="not-found"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pagina nu există');
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
    expect(await accentedIn(page, 'main')).toEqual([]);
  });

  test('a staff screen refused to a visitor is the same 404, with no accent', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pagina nu există');
    expect(await accentedIn(page, 'main')).toEqual([]);
  });
});

test.describe('badges without data', () => {
  for (const path of ['/', '/cereri', '/trasee']) {
    test(`${path} shows no badge when there are no rows`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      await expect(page.locator('main [data-badge]')).toHaveCount(0);
    });
  }

  test('a visitor has no counts in the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header [data-badge="count"]')).toHaveCount(0);
  });
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test('the category drawing sits beside the category and follows it', async ({ page }) => {
      await page.goto('/cerere/noua');
      const loadingDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
      await page.getByLabel('Oraș de destinație').fill('București');
      await page.getByLabel('Poate fi încărcat de la').fill(loadingDate);
      await page.getByRole('button', { name: 'Continuă' }).click();

      // Every category is a card with its drawing; the chosen one is
      // marked, and choosing another moves the mark.
      const chosen = page.locator('[data-choice][data-checked] [data-category-tile]');
      await expect(chosen).toHaveCount(1);
      await expect(chosen).toHaveAttribute('data-category-tile', 'autoturism');
      const box = await chosen.locator('svg[data-category-art]').boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(40);

      await page.locator('[data-choice="rulota"]').click();
      await expect(chosen).toHaveAttribute('data-category-tile', 'rulota');
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });

    for (const path of ['/', '/cereri', '/trasee', '/cerere/noua', '/termeni', '/nu-exista']) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await page.goto(path);
        await settled(page);
        expect(await overflow(page), path).toBeLessThanOrEqual(1);
      });
    }
  });
}

test.describe('a slow page', () => {
  test('shows the board’s own shape while its rows are on the way', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hold the navigation's own request, not the prefetch: the loading
    // boundary comes with the prefetch, the rows with the navigation.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => url.pathname === '/cereri' && url.searchParams.has('_rsc'),
      async (route) => {
        if (route.request().headers()['next-router-prefetch'] === undefined) await held;
        await route.continue();
      },
    );

    await page.locator('a[href="/cereri"]:visible').first().click();
    const skeleton = page.locator('[data-skeleton]');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute('aria-busy', 'true');
    // A shape, not a spinner: the card outlines are there.
    expect(await skeleton.locator('li').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.animate-spin')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    release();
    await expect(page).toHaveURL(/\/cereri$/);
    await expect(skeleton).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion takes the transitions of a button to one frame', async ({ page }) => {
    await page.goto('/cerere/noua');
    const next = page.getByRole('button', { name: 'Continuă' });
    const duration = await next.evaluate((n) => getComputedStyle(n).transitionDuration);
    for (const part of duration.split(',')) expect(Number.parseFloat(part)).toBeLessThan(0.001);
  });
});
