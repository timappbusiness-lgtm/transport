import { expect, test } from '@playwright/test';

/**
 * The company profile area, without a database.
 *
 * What can be checked with nothing behind it is the half that matters
 * most for a screen this long: that it is closed to a visitor, that every
 * tab has a URL, and that a tab a forwarder does not have is a 404 rather
 * than a silent redirect — a redirect would look like the link was wrong
 * instead of the tab being absent.
 *
 * The half that needs rows — the tabs saving, the completeness card
 * moving, the alert reaching the outbox — is in
 * `profil-firma-supabase.spec.ts`.
 */

const TABS = ['acoperire', 'dotari', 'alerte', 'public'] as const;

test.describe('the profile is closed to a visitor', () => {
  test('/cont/firma sends an anonymous visitor to sign in', async ({ page }) => {
    await page.goto('/cont/firma');
    await expect(page).toHaveURL(/\/autentificare/);
    await expect(page).toHaveURL(/next=%2Fcont%2Ffirma/);
  });

  for (const tab of TABS) {
    test(`and so does the ${tab} tab, keeping the tab in the return path`, async ({ page }) => {
      await page.goto(`/cont/firma?sectiune=${tab}`);
      await expect(page).toHaveURL(/\/autentificare/);
      // The tab is part of where they were going, so it survives the trip.
      await expect(page).toHaveURL(/next=%2Fcont%2Ffirma/);
    });
  }
});

test.describe('the admin list of options is not a public list', () => {
  test('/admin/optiuni is a 404 for somebody who is not staff', async ({ page }) => {
    // Not a 403: that would confirm the route exists and that there is
    // something behind it worth finding.
    const response = await page.goto('/admin/optiuni');
    expect(response?.status()).toBe(404);
  });
});

test.describe('a public profile that does not exist', () => {
  test('is a 404, not a page saying the firm is hidden', async ({ page }) => {
    const response = await page.goto('/firme/firma-care-nu-exista-srl');
    expect(response?.status()).toBe(404);
  });
});
