import { expect, test } from '@playwright/test';

/**
 * The pricing page, without a database.
 *
 * With no plans to read the page must state no price at all — which is the
 * state a fresh deployment is in, and the one where a hardcoded figure
 * would show itself. The rest is the copy rules: a pricing page is where a
 * marketplace is most tempted to invent a discount, and the reference site
 * we were shown invents several.
 *
 * The half that needs rows is in `abonamente-supabase.spec.ts`.
 */

const FORBIDDEN = [
  /cel mai popular/i,
  /insign(ă|a) premium/i,
  /\bgarant(ăm|ez|ie|ii|at|ată)\b/i,
  /100\s*%/,
  /reducere\s*\d/i,
  // A percentage anywhere near a price is the thing this page does not do.
  /-\s*\d+\s*%/,
];

test.describe('with no prices to read, none are stated', () => {
  test('the page still explains what is paid for', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Plătești pentru contacte');
    await expect(page.getByText(/se consultă gratuit/)).toBeVisible();
  });

  test('no card invents a price', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.getByText(/lei pe lună/)).toHaveCount(0);
  });

  test('the sections that need no data are still there', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.getByRole('heading', { name: 'Ce nu plătești niciodată' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Întrebări despre facturare' })).toBeVisible();
  });

  test('it says verification is never sold', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.getByText(/nu se cumpără/)).toBeVisible();
  });
});

test.describe('the controls live in the URL', () => {
  test('the audience is a link, so a price can be shared', async ({ page }) => {
    await page.goto('/abonamente');
    const control = page.getByRole('navigation', { name: 'Pentru cine' });
    await control.getByRole('link', { name: 'Case de expediții' }).click();
    await expect(page).toHaveURL(/pentru=expeditii/);
    await expect(
      page.getByRole('navigation', { name: 'Pentru cine' }).getByRole('link', {
        name: 'Case de expediții',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('so is the billing period', async ({ page }) => {
    await page.goto('/abonamente');
    await page
      .getByRole('navigation', { name: 'Perioadă de facturare' })
      .getByRole('link', { name: '12 luni' })
      .click();
    await expect(page).toHaveURL(/perioada=12/);
  });

  test('the two are kept together', async ({ page }) => {
    await page.goto('/abonamente?pentru=expeditii');
    await page
      .getByRole('navigation', { name: 'Perioadă de facturare' })
      .getByRole('link', { name: '6 luni' })
      .click();
    await expect(page).toHaveURL(/pentru=expeditii/);
    await expect(page).toHaveURL(/perioada=6/);
  });

  test('a stale link opens the page rather than an error', async ({ page }) => {
    const response = await page.goto('/abonamente?pentru=altceva&perioada=3');
    expect(response?.status()).toBe(200);
    await expect(
      page
        .getByRole('navigation', { name: 'Pentru cine' })
        .getByRole('link', { name: 'Transportatori', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('navigation', { name: 'Perioadă de facturare' }).getByRole('link', {
        name: 'Lunar',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('the billing questions', () => {
  test('open from the keyboard', async ({ page }) => {
    await page.goto('/abonamente');
    const question = page.getByRole('button', { name: /Pot anula/ });
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await question.focus();
    await page.keyboard.press('Enter');
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/fără perioadă minimă/)).toBeVisible();
  });

  test('say the account and the history are kept', async ({ page }) => {
    await page.goto('/abonamente');
    await page.getByRole('button', { name: /Ce se întâmplă la finalul abonamentului/ }).click();
    await expect(page.getByText(/istoricul se păstrează/)).toBeVisible();
  });
});

test.describe('getting there and back', () => {
  // The floating bar has no room for links on a phone, so there they live
  // in the footer instead — which this checks rather than skipping.
  test('the header carries a link on every page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The bar hides its links below 900px.');
    await page.goto('/firme');
    await page
      .getByRole('navigation', { name: 'Navigare' })
      .getByRole('link', { name: 'Abonamente' })
      .click();
    await expect(page).toHaveURL(/\/abonamente$/);
  });

  test('so does the footer, which is where a phone finds it', async ({ page }) => {
    await page.goto('/firme');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Abonamente' }).click();
    await expect(page).toHaveURL(/\/abonamente$/);
  });

  test('the account page is closed to an anonymous visitor', async ({ page }) => {
    await page.goto('/cont/abonament');
    await expect(page).toHaveURL(/autentificare/);
  });

  test('the staff queue is a 404, not a 403', async ({ page }) => {
    const response = await page.goto('/admin/abonamente');
    expect(response?.status()).toBe(404);
  });
});

test.describe('nothing here is indexed yet', () => {
  test('/abonamente says noindex', async ({ page }) => {
    await page.goto('/abonamente');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('on a phone', () => {
  test('the page does not scroll sideways', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone layout only.');
    await page.goto('/abonamente');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('the words we do not use', () => {
  test('/abonamente carries none of them', async ({ page }) => {
    await page.goto('/abonamente');
    // Open every answer: a forbidden word inside a collapsed panel is still
    // a forbidden word.
    const toggles = page.locator('h3 > button[aria-expanded]');
    for (let i = 0; i < (await toggles.count()); i += 1) {
      const button = toggles.nth(i);
      if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
    }
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const pattern of FORBIDDEN) {
      expect(text, `matched ${pattern}`).not.toMatch(pattern);
    }
  });
});
