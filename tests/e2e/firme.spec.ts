import { expect, test } from '@playwright/test';

/**
 * The directory, the FAQ and the carrier section, without a database.
 *
 * Most of this suite is negative, because that is where a company
 * directory goes wrong: a grid of cards nobody can click, a count that
 * cannot be produced, a price written into the page. With no Supabase to
 * read, every one of those has to be absent — which is exactly the state a
 * fresh deployment is in, and the one nobody thinks to check.
 *
 * The half that needs rows is in `firme-supabase.spec.ts`.
 */

const FORBIDDEN = [
  /cea mai mare/i,
  /\bgarant(ăm|ez|ie|ii|at|ată)\b/i,
  /100\s*%/,
  /complet sigur/i,
  /\d[\d.,]*\s*\+/,
];

test.describe('with nothing to show, nothing is claimed', () => {
  test('the homepage grid and the stats band are absent', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Vezi toate firmele' })).toHaveCount(0);
    await expect(page.getByText('firme verificate', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Date actualizate zilnic din platformă.')).toHaveCount(0);
  });

  test('the price card states no price it cannot read', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#transportatori')).toContainText('Înscrie firma');
    await expect(page.locator('#transportatori')).not.toContainText('lei pe lună');
  });

  test('the directory says it is filling up rather than showing samples', async ({ page }) => {
    await page.goto('/firme');
    await expect(
      page.getByRole('heading', { name: /Lista se completează pe măsură ce firmele sunt verificate/ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Înscrie firma' })).toBeVisible();
  });

  test('a company that is not listed is a 404, not a page about it', async ({ page }) => {
    const response = await page.goto('/firme/firma-care-nu-exista');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the directory page', () => {
  test('says what it lists and what it leaves out', async ({ page }) => {
    await page.goto('/firme');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Firme de transport');
    await expect(page.getByText(/au ales să apară în listă/)).toBeVisible();
  });

  test('keeps its filters in the URL', async ({ page }) => {
    await page.goto('/firme');
    await page.getByLabel('Tip firmă').selectOption('transport');
    await page.getByRole('button', { name: 'Filtrează' }).click();
    await expect(page).toHaveURL(/tip=transport/);
  });

  test('a stale bookmark shows the whole list rather than an error', async ({ page }) => {
    const response = await page.goto('/firme?tip=pescuit&pagina=-4&acoperire=luna');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('the FAQ', () => {
  test('answers open and close from the keyboard', async ({ page }) => {
    await page.goto('/intrebari-frecvente');
    const first = page.getByRole('button', { name: /Cât costă să public o cerere/ });
    await expect(first).toHaveAttribute('aria-expanded', 'false');

    await first.focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Publicarea cererii și primirea ofertelor sunt gratuite/)).toBeVisible();

    await page.keyboard.press('Space');
    await expect(first).toHaveAttribute('aria-expanded', 'false');
  });

  test('the panel is not in the page while it is closed', async ({ page }) => {
    await page.goto('/intrebari-frecvente');
    await expect(
      page.getByText(/Publicarea cererii și primirea ofertelor sunt gratuite/),
    ).toHaveCount(0);
  });

  test('more than one answer can be open at a time', async ({ page }) => {
    await page.goto('/intrebari-frecvente');
    const first = page.getByRole('button', { name: /Cât costă să public o cerere/ });
    const second = page.getByRole('button', { name: /Cine vede datele mele de contact/ });
    await first.click();
    await second.click();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  test('groups the questions and carries structured data for them', async ({ page }) => {
    await page.goto('/intrebari-frecvente');
    await expect(page.getByRole('heading', { name: 'Pentru clienți' })).toBeVisible();

    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(jsonLd ?? '{}');
    expect(data['@type']).toBe('FAQPage');
    expect(Array.isArray(data.mainEntity)).toBe(true);
    expect(data.mainEntity.length).toBeGreaterThan(0);
    // Every question in the markup is a question in the data, and no more:
    // structured data that promises an answer the page does not give is the
    // one thing search engines penalise here. The accordion wraps each
    // question in an h3, which is what separates them from the header's
    // own expandable button.
    const questions = await page.locator('h3 > button[aria-expanded]').count();
    expect(data.mainEntity.length).toBe(questions);
  });

  test('the homepage shows six of them and links to the rest', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#intrebari');
    await expect(section.getByRole('button')).toHaveCount(6);
    await section.getByRole('link', { name: 'Vezi toate întrebările' }).click();
    await expect(page).toHaveURL(/\/intrebari-frecvente$/);
  });
});

test.describe('nothing on these pages is indexed yet', () => {
  for (const path of ['/firme', '/intrebari-frecvente']) {
    test(`${path} says noindex`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/,
      );
    });
  }
});

test.describe('on a phone', () => {
  for (const path of ['/firme', '/intrebari-frecvente']) {
    test(`${path} does not scroll sideways`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'Phone layout only.');
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('the words we do not use', () => {
  for (const path of ['/', '/firme', '/intrebari-frecvente']) {
    test(`${path} carries none of them`, async ({ page }) => {
      await page.goto(path);
      // Open every answer first: a forbidden word inside a collapsed panel
      // is still a forbidden word. Indexing by a locator that does not
      // filter on aria-expanded, because clicking changes it and a filtered
      // list would go stale under its own feet.
      const toggles = page.locator('h3 > button[aria-expanded]');
      for (let i = 0; i < (await toggles.count()); i += 1) {
        const button = toggles.nth(i);
        if ((await button.getAttribute('aria-expanded')) === 'false') await button.click();
      }
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      for (const pattern of FORBIDDEN) {
        expect(text, `${path} matched ${pattern}`).not.toMatch(pattern);
      }
    });
  }
});
