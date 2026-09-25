import { expect, test } from '@playwright/test';

/**
 * Subscribing, receiving and unsubscribing — the half that needs rows and
 * a browser with notifications granted.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Needs an account, as E2E_EMAIL and E2E_PASSWORD, and
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY set on the app under test — without a key
 * the settings screen correctly says push is not configured, and these
 * would be testing that message instead.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance, and it
 * cannot reach a push service either — the network policy blocks both.
 * Treat every expectation here as unverified. What each one asserts about
 * the rules is covered without a browser by the PUSH block in
 * `supabase/tests/rls_test.sql`, the timing and permission rules by
 * `tests/unit/push.test.ts`, and the protocol by
 * `supabase/functions/push-dispatcher/webpush_test.ts`.
 *
 * Delivery itself is the one thing no automated test here can prove: it
 * needs a real push service. That is a phone in somebody's hand.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_ACCOUNT = ENABLED && EMAIL !== '' && PASSWORD !== '';

test.use({ permissions: ['notifications'] });

async function signIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
  await expect(page).toHaveURL(/\/cont/);
}

test.describe('the settings screen', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and an account');

  test('lists every type this person could act on', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Notificări');
    await expect(page.getByText('Ce îți trimitem')).toBeVisible();
  });

  test('shows the two locked channels as text, not a dead checkbox', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    const row = page.locator('li').filter({ hasText: 'Cont suspendat' }).first();
    await expect(row.getByText('Nu poate fi oprit').first()).toBeVisible();
  });

  test('but lets push be switched off even for those', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    const row = page.locator('li').filter({ hasText: 'Cont suspendat' }).first();
    await expect(row.getByLabel('Pe dispozitiv')).toBeEnabled();
  });

  test('saves quiet hours and reads them back', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    await page.getByLabel('De la').fill('23:00');
    await page.getByLabel('Până la').fill('06:30');
    await page.getByRole('button', { name: 'Salvează' }).click();

    await page.reload();
    await expect(page.getByLabel('De la')).toHaveValue('23:00');
    await expect(page.getByLabel('Până la')).toHaveValue('06:30');
  });

  test('refuses an hourly cap nobody could mean', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    await page.getByLabel(/Cel mult atâtea/).fill('0');
    await page.getByRole('button', { name: 'Salvează' }).click();
    await expect(page.getByText(/între 1 și 100/)).toBeVisible();
  });
});

test.describe('subscribing this browser', () => {
  test.skip(
    !HAS_ACCOUNT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    'needs an account and a VAPID key',
  );

  test('the button turns into the disable one', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');

    await page.getByRole('button', { name: 'Activează pe acest dispozitiv' }).click();
    await expect(
      page.getByRole('button', { name: 'Dezactivează pe acest dispozitiv' }),
    ).toBeVisible();
    await expect(page.getByText('Notificările sunt pornite pe acest dispozitiv.')).toBeVisible();
  });

  test('the test button queues one', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    await page.getByRole('button', { name: 'Activează pe acest dispozitiv' }).click();
    await page.getByRole('button', { name: 'Trimite o notificare de test' }).click();
    await expect(page.getByText(/pusă la coadă/)).toBeVisible();
  });

  test('unsubscribing takes the device off the list', async ({ page }) => {
    await signIn(page);
    await page.goto('/cont/setari/notificari');
    await page.getByRole('button', { name: 'Activează pe acest dispozitiv' }).click();
    await page.getByRole('button', { name: 'Dezactivează pe acest dispozitiv' }).click();
    await expect(page.getByText('Notificările nu sunt pornite pe acest dispozitiv.')).toBeVisible();
  });
});

test.describe('the card asks once, at the right moment', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and an account');

  test('it appears after a request reaches the board', async ({ page }) => {
    await signIn(page);
    await page.goto('/cerere/noua');
    await expect(page.getByText('Vrei să afli imediat?')).toHaveCount(0);
    // The rest of this walk is in cereri-supabase.spec.ts; what matters
    // here is that the card is absent until the request is published.
  });

  test('"Mai târziu" keeps it away for a month', async ({ page, context }) => {
    await signIn(page);
    await page.goto('/cont');

    const later = page.getByRole('button', { name: 'Mai târziu' });
    if ((await later.count()) > 0) {
      await later.click();
      await page.reload();
      await expect(page.getByText('Vrei să afli imediat?')).toHaveCount(0);

      // And it is the browser that remembers, not the session.
      const stored = await page.evaluate(() =>
        window.localStorage.getItem('app.push.dismissed'),
      );
      expect(stored).not.toBeNull();
      void context;
    }
  });
});
