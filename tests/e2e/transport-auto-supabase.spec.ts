import { expect, test } from '@playwright/test';

/**
 * The half of the landing pages that needs rows: a published page
 * rendering its live blocks, the call to action carrying the route into
 * the request form, and the sitemap listing what is published and nothing
 * else.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Publishing needs a staff account, passed as E2E_STAFF_EMAIL and
 * E2E_STAFF_PASSWORD. Without them these skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the
 * network policy blocks it and `supabase start` cannot pull its images.
 * Treat every expectation here as unverified until somebody runs it with
 * the stack up. What each one asserts about the rules is covered without a
 * browser by the SEO block in `supabase/tests/rls_test.sql`, and the URL
 * shapes and prefills by `tests/unit/seo-pages.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
const HAS_STAFF = ENABLED && EMAIL !== '' && PASSWORD !== '';

async function signInAsStaff(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Parolă').fill(PASSWORD);
  await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
  await expect(page).toHaveURL(/\/cont/);
}

async function publish(page: import('@playwright/test').Page, slug: string): Promise<void> {
  await page.goto(`/admin/pagini/${slug}`);
  await page.goto('/admin/pagini');
  const row = page.locator('li').filter({ hasText: `/transport-auto` }).filter({ hasText: slug });
  const button = row.getByRole('button', { name: 'Publică' }).first();
  if (await button.count()) await button.click();
}

test.describe('publishing a page from admin', () => {
  test.skip(!HAS_STAFF, 'needs E2E_SUPABASE=1 and a staff account');

  test('a draft is a 404 before, and a page after', async ({ page }) => {
    await signInAsStaff(page);

    const before = await page.goto('/transport-auto/germania-romania');
    expect(before?.status()).toBe(404);

    await publish(page, 'germania-romania');

    const after = await page.goto('/transport-auto/germania-romania');
    expect(after?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Transport auto Germania',
    );
  });

  test('staff preview a draft without publishing it', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/pagini/bucuresti-cluj-napoca/previzualizare');
    await expect(page.getByText('Previzualizare a unei ciorne')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a bulk publish states how many, not "gata"', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/pagini');
    const section = page.locator('section').filter({ hasText: 'Județe' }).first();
    await section.getByRole('button', { name: /Publică toate/ }).click();
    await expect(section.getByText(/\d+ pagini publicate/)).toBeVisible();
  });
});

test.describe('a published corridor page', () => {
  test.skip(!HAS_STAFF, 'needs E2E_SUPABASE=1 and a staff account');

  test('renders every live block, with its empty state when empty', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'germania-romania');
    await page.goto('/transport-auto/germania-romania');

    for (const heading of [
      'Preț orientativ',
      'Cereri publicate acum',
      'Trasee disponibile',
      'Firme verificate care acoperă ruta',
      'Ce acte îți trebuie',
      'Cum verificăm firmele',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  test('says an empty board is empty rather than hiding the block', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'germania-romania');
    await page.goto('/transport-auto/germania-romania');
    await expect(
      page.getByText('Nicio cerere publicată acum pe această rută.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Publică prima cerere' })).toBeVisible();
  });

  test('carries breadcrumbs and both JSON-LD blocks', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'germania-romania');
    await page.goto('/transport-auto/germania-romania');

    await expect(page.getByRole('navigation', { name: 'Navigare' })).toBeVisible();

    const types = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => JSON.parse(n.textContent ?? '{}')['@type'] as string),
      );
    expect(types).toContain('BreadcrumbList');
    expect(types).toContain('FAQPage');
  });

  test('the call to action carries the corridor into the request form', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'germania-romania');
    await page.goto('/transport-auto/germania-romania');

    await page.getByRole('link', { name: 'Publică o cerere' }).first().click();
    await expect(page).toHaveURL(/tara-plecare=DE/);
    // The country is filled in; the town is the visitor's to type.
    await expect(page.getByLabel('Țara de plecare')).toHaveValue('DE');
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('');
  });
});

test.describe('a published route page prefills both towns', () => {
  test.skip(!HAS_STAFF, 'needs E2E_SUPABASE=1 and a staff account');

  test('and the form opens with them in the boxes', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'bucuresti-cluj-napoca');
    await page.goto('/transport-auto/bucuresti-cluj-napoca');

    await page.getByRole('link', { name: 'Publică o cerere' }).first().click();
    await expect(page.getByLabel('Oraș de plecare')).toHaveValue('București');
    await expect(page.getByLabel('Oraș de destinație')).toHaveValue('Cluj-Napoca');
  });
});

test.describe('the sitemap once pages are published', () => {
  test.skip(
    !HAS_STAFF || process.env.NEXT_PUBLIC_SEO_INDEXABLE !== '1',
    'needs a staff account and NEXT_PUBLIC_SEO_INDEXABLE=1',
  );

  test('lists the published page and not the drafts', async ({ page }) => {
    await signInAsStaff(page);
    await publish(page, 'germania-romania');

    const response = await page.goto('/sitemap.xml');
    const body = await response!.text();
    expect(body).toContain('/transport-auto/germania-romania');
    // Published one at a time, so a second corridor must still be absent.
    expect(body).not.toContain('/transport-auto/italia-romania');
  });

  test('robots.txt points at it once indexing is on', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    const body = await response!.text();
    expect(body).toMatch(/Sitemap:.*sitemap\.xml/i);
    expect(body).toMatch(/Disallow:\s*\/cont\//);
  });
});
