import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Some sandboxes ship a preinstalled Chromium whose build number does not
 * match the one this Playwright version downloads. Point at it when it is
 * there; everywhere else (CI, a dev laptop) this resolves to undefined and
 * Playwright uses its own browser from `playwright install`.
 *
 * Override explicitly with PLAYWRIGHT_CHROMIUM_PATH.
 */
function preinstalledChromium(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ];
  return candidates.find((p) => existsSync(p));
}

const executablePath = preinstalledChromium();
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    // Turns on the two harness pages: /proba/incarcari, the upload queue
    // on its own (tests/e2e/incarcari.spec.ts), and /proba/ecrane, the
    // account and admin screens with sample data for the layout sweeps
    // (tests/e2e/aspect-*.spec.ts). Nothing else reads it.
    env: { E2E_HARNESS: '1' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
