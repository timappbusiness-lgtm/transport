import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/config/routes';

/**
 * The three legal pages.
 *
 * They are public, static and the last thing between the platform and a
 * launch, so what is checked here is what a reader would notice: that
 * they answer, that they carry a version and a date, that the links
 * between them work, and that they say the two sentences everything else
 * depends on.
 */

const PAGES = [
  { href: ROUTES.terms, heading: 'Termeni și condiții' },
  { href: ROUTES.privacy, heading: 'Politica de confidențialitate' },
  { href: ROUTES.cookies, heading: 'Cookie-uri' },
] as const;

test.describe('the legal pages', () => {
  for (const page_ of PAGES) {
    test(`${page_.href} answers and names itself`, async ({ page }) => {
      const response = await page.goto(page_.href);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(page_.heading);
    });

    test(`${page_.href} says which version it is`, async ({ page }) => {
      // A legal page without a version is a page nobody can be held to.
      await page.goto(page_.href);
      await expect(page.getByText(/Versiunea \d+\.\d+, în vigoare din/)).toBeVisible();
    });

    test(`${page_.href} admits it is a draft`, async ({ page }) => {
      await page.goto(page_.href);
      await expect(page.getByText('Document în lucru')).toBeVisible();
    });

    test(`${page_.href} links to the other two`, async ({ page }) => {
      await page.goto(page_.href);
      const others = PAGES.filter((other) => other.href !== page_.href);
      for (const other of others) {
        await expect(page.locator(`a[href="${other.href}"]`).first()).toBeVisible();
      }
    });

    test(`${page_.href} fits a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(page_.href);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('what the documents have to say', () => {
  test('the terms say we are not a party to the transport', async ({ page }) => {
    await page.goto(ROUTES.terms);
    await expect(page.getByText(/Nu suntem parte în contractul de transport/)).toBeVisible();
  });

  test('the privacy notice points at the page that deletes', async ({ page }) => {
    await page.goto(ROUTES.privacy);
    await expect(
      page.locator(`a[href="${ROUTES.accountPersonalData}"]`).first(),
    ).toBeVisible();
  });

  test('the cookie page explains why there is no banner', async ({ page }) => {
    await page.goto(ROUTES.cookies);
    await expect(page.getByText(/nu am avea ce să îți cerem/)).toBeVisible();
  });

  test('and no banner appears', async ({ page }) => {
    // A consent banner is a dialog with a button that accepts something.
    // Asserted as those two things rather than as a string match: the
    // footer link says „Cookie-uri" and a loose regex over the page text
    // matches every ancestor that contains it.
    await page.goto('/');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /cookie/i })).toHaveCount(0);
  });
});

test.describe('the site links to them', () => {
  test('the footer carries all three', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    for (const { href } of PAGES) {
      await expect(footer.locator(`a[href="${href}"]`)).toBeVisible();
    }
  });

  for (const signUp of [ROUTES.signUpIndividual, ROUTES.signUpCompany]) {
    test(`${signUp} links to all three and says which version`, async ({ page }) => {
      // The cookie policy was missing from both forms until 25 September.
      await page.goto(signUp);
      const form = page.locator('form').filter({ has: page.locator('input[name="terms"]') });
      for (const { href } of PAGES) {
        await expect(form.locator(`a[href="${href}"]`).first()).toBeVisible();
      }
      await expect(page.getByText(/\(versiunea \d+\.\d+\)/)).toBeVisible();
    });
  }

  test('the verification page links to them too', async ({ page }) => {
    // „Verificat" is explained there, and that is where somebody should
    // be able to read the sentence that limits it.
    await page.goto(ROUTES.verification);
    for (const { href } of PAGES) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
  });

  test('none of them is still a placeholder', async ({ page }) => {
    for (const { href } of PAGES) {
      await page.goto(href);
      await expect(page.getByText('Pagină în lucru')).toHaveCount(0);
    }
  });
});
