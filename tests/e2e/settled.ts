import { expect, type Page } from '@playwright/test';

/**
 * Waits for a streamed page to have its rows.
 *
 * The two boards stream: `loading.tsx` paints their heading and a
 * skeleton first, and the filters and cards replace it when the query
 * returns — a moment after the `load` event, sometimes. A check that
 * reads the page once (a count, an overflow, the body's text) has to
 * wait for that, or it measures the skeleton; and a check that nothing
 * leaks would pass without having looked. Anything that retries on its
 * own (`expect(locator)…`) does not need it.
 *
 * A no-op on a page without a skeleton.
 */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('[data-skeleton]')).toHaveCount(0);
}

/**
 * Opens the phone menu in the bar, when there is one to open.
 *
 * A press that lands before React has attached to the button does
 * nothing — the page is drawn on the server and the menu's state lives
 * in the browser — so the press is repeated until the panel is there,
 * which is what a person does too. Returns false at widths where the
 * links sit in the bar and there is no menu.
 */
export async function openMenu(page: Page): Promise<boolean> {
  const toggle = page.locator('header [data-nav-toggle]');
  if (!(await toggle.isVisible())) return false;
  const nav = page.getByRole('navigation', { name: 'Navigare' });
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(nav).toBeVisible({ timeout: 500 });
  }).toPass();
  return true;
}
