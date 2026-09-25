import { expect, test } from '@playwright/test';
import {
  OPERATOR,
  TO_BE_FILLED,
  fiscalCode,
  operatorLine,
  operatorPhoneHref,
  operatorShortLine,
} from '../../src/config/company';
import { ROUTES } from '../../src/config/routes';

/**
 * The operator's real details, where a reader looks for them.
 *
 * Values come from `src/config/company.ts`, never written out here: the
 * test proves the pages read the file, and a change of address changes
 * one file, not this one too.
 */

const LEGAL = [
  { href: ROUTES.terms, names: 'Platforma' },
  { href: ROUTES.privacy, names: 'Operator de date este' },
] as const;

test.describe('the legal pages name the operator', () => {
  for (const { href, names } of LEGAL) {
    test(`${href} names the company, its codes and its office`, async ({ page }) => {
      await page.goto(href);
      const main = page.locator('main');
      await expect(main.getByText(operatorLine(), { exact: false }).first()).toBeVisible();
      await expect(main.getByText(new RegExp(`^${names}`)).first()).toContainText(OPERATOR.legalName);
      await expect(main.getByText(OPERATOR.privacyEmail).first()).toBeVisible();
      await expect(main.getByText(TO_BE_FILLED)).toHaveCount(0);
    });

    test(`${href} still says it is a draft`, async ({ page }) => {
      // The lawyer has not read it yet; real details do not change that.
      await page.goto(href);
      await expect(page.getByText('Document în lucru')).toBeVisible();
    });
  }

  test('/cookies carries the operator in its footer, and nothing to fill in', async ({ page }) => {
    await page.goto(ROUTES.cookies);
    await expect(page.getByText('Document în lucru')).toBeVisible();
    await expect(page.getByText(TO_BE_FILLED)).toHaveCount(0);
    const line = page.getByRole('contentinfo').locator('[data-operator]');
    await line.scrollIntoViewIfNeeded();
    await expect(line).toHaveText(`Operat de ${operatorShortLine()}.`);
  });
});

test.describe('/contact', () => {
  test('shows every detail, and no notice that something is missing', async ({ page }) => {
    await page.goto(ROUTES.contact);
    const details = page.locator('section[aria-labelledby="operator"] dl');
    for (const value of [OPERATOR.legalName, fiscalCode(), OPERATOR.regCom, OPERATOR.euid, OPERATOR.address]) {
      await expect(details.getByText(value, { exact: true })).toBeVisible();
    }
    await expect(details.getByText('Plătitoare de TVA', { exact: true })).toBeVisible();
    await expect(page.getByText(TO_BE_FILLED)).toHaveCount(0);
  });

  test('the addresses and the phone are links that work', async ({ page }) => {
    await page.goto(ROUTES.contact);
    const channels = page.locator('section[aria-labelledby="canale"]');
    await expect(channels.locator(`a[href="mailto:${OPERATOR.email}"]`).first()).toBeVisible();
    await expect(channels.locator(`a[href="mailto:${OPERATOR.privacyEmail}"]`).first()).toBeVisible();
    const phone = channels.locator(`a[href="${operatorPhoneHref()}"]`);
    await expect(phone).toBeVisible();
    await expect(phone).toHaveText(OPERATOR.phone);
  });
});

test.describe('the footer', () => {
  for (const width of [1440, 390] as const) {
    test(`names the operator on every kind of page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 400 ? 900 : 844 });
      for (const path of [ROUTES.home, ROUTES.requests, ROUTES.contact, '/proba/ecrane?sectiune=cereri-mele']) {
        await page.goto(path);
        const line = page.getByRole('contentinfo').locator('[data-operator]');
        await line.scrollIntoViewIfNeeded();
        await expect(line, path).toBeVisible();
        await expect(line, path).toHaveText(`Operat de ${operatorShortLine()}.`);
        // The address wraps rather than pushing the page sideways.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    });
  }
});
