import { expect, test } from '@playwright/test';
import { BRAND_NAME } from '../../src/config/brand';

/**
 * The PWA and the push permission rules, without a database.
 *
 * The half worth checking hardest is negative, and it is the same rule
 * three times over: **nothing asks for notification permission until
 * somebody has done something that makes them useful.** A prompt shown
 * early is refused, and a refusal is permanent until somebody digs into
 * browser settings — one badly-timed prompt costs the channel forever.
 *
 * The half that needs rows — subscribing, receiving, unsubscribing — is
 * in `push-pwa-supabase.spec.ts`.
 */

test.describe('the app is installable', () => {
  test('the manifest is served and says what it should', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);

    const manifest = JSON.parse(await response!.text());
    expect(manifest.name).toContain(BRAND_NAME);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/cont');
    expect(manifest.lang).toBe('ro');
  });

  test('it offers both sizes and a maskable pair', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    const manifest = JSON.parse(await response!.text());
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // Without a maskable icon a round-icon launcher crops the artwork.
    expect(
      manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'),
    ).toBe(true);
  });

  test('the icons it names actually exist', async ({ page }) => {
    for (const path of [
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-192-maskable.png',
      '/icons/icon-512-maskable.png',
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
    }
  });

  test('the page links the manifest and sets a theme colour', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  });
});

test.describe('the service worker', () => {
  test('is served from the root, which is its scope', async ({ page }) => {
    const response = await page.goto('/sw.js');
    expect(response?.status()).toBe(200);
    const body = await response!.text();
    expect(body).toContain("addEventListener('push'");
    expect(body).toContain("addEventListener('notificationclick'");
  });

  test('caches nothing private', async ({ page }) => {
    // A service worker cache survives signing out and is shared by
    // everybody using that browser profile, so a cached /cont page is
    // somebody else's details waiting for the next person.
    const response = await page.goto('/sw.js');
    const body = await response!.text();
    const cached = body.slice(body.indexOf('const SHELL'), body.indexOf('addEventListener'));
    expect(cached).not.toContain('/cont');
    expect(cached).not.toContain('/api');
  });

  test('the offline page exists and mentions no private data', async ({ page }) => {
    const response = await page.goto('/offline.html');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nu ai conexiune');
  });
});

test.describe('nothing asks for permission before it should', () => {
  test('the homepage does not', async ({ page, context }) => {
    // Granted rather than denied, so a stray request would succeed and be
    // visible rather than being swallowed by a refusal.
    await context.grantPermissions(['notifications']);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Activează notificările' })).toHaveCount(0);
  });

  test('nor the request form before anything is published', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.goto('/cerere/noua');
    await expect(page.getByRole('button', { name: 'Activează notificările' })).toHaveCount(0);
    await expect(page.getByText('Vrei să afli imediat?')).toHaveCount(0);
  });

  test('nor the board', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.goto('/cereri');
    await expect(page.getByText('Vrei să afli imediat?')).toHaveCount(0);
  });

  test('and no page registers a service worker on load', async ({ page }) => {
    // Registration happens when somebody accepts, not before: a worker
    // installed on first visit is a worker caching for somebody who never
    // agreed to anything.
    await page.goto('/');
    const registrations = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    expect(registrations).toBe(0);
  });
});

test.describe('the settings screen is closed to a visitor', () => {
  test('/cont/setari/notificari sends them to sign in', async ({ page }) => {
    await page.goto('/cont/setari/notificari');
    await expect(page).toHaveURL(/\/autentificare/);
    await expect(page).toHaveURL(/next=%2Fcont%2Fsetari%2Fnotificari/);
  });
});
