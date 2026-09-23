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
