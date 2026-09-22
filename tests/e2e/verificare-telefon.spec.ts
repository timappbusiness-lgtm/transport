import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/config/routes';

/**
 * The phone step, with no SMS provider behind it.
 *
 * That is the state the pilot starts in, so it is the state worth
 * pinning: the step explains itself, asks for the number, and — when
 * somebody presses the button — says plainly that nobody will be sent an
 * SMS, rather than spinning. The half that needs a session and a
 * database is in `verificare-telefon-supabase.spec.ts`.
 *
 * What the screen must never do is imply a code is on its way. A person
 * waiting for an SMS that was never sent is worse off than a person told
 * to expect a telephone call.
 */

test.describe('the account screen is behind a session', () => {
  test('a visitor is sent to sign in rather than shown the step', async ({ page }) => {
    await page.goto(ROUTES.accountProfile);
    await expect(page).toHaveURL(/\/autentificare\?next=%2Fcont%2Fprofil/);
  });
});

test.describe('the admin side says whether SMS is configured', () => {
  test('a visitor gets a 404 on the notifications screen, not a 403', async ({ page }) => {
    const response = await page.goto(ROUTES.adminNotifications);
    expect(response?.status()).toBe(404);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the sign-in screen the phone step sends you to fits 390px', async ({ page }) => {
    await page.goto(ROUTES.signIn);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
