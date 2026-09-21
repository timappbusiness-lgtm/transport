import { expect, test } from '@playwright/test';

/**
 * Ce se poate verifica fără o bază de date.
 *
 * Trei lucruri, și toate trei sunt despre ce **nu** se vede: ecranele
 * echipei nu există pentru un vizitator, pagina de preluare nu spune
 * nimic despre un token inventat, și nimic din toate astea nu apare pe
 * paginile publice.
 *
 * Povestea întreagă — echipa face o firmă, o alta aprobă documentul,
 * omul își alege parola — este în `inscriere-asistata-supabase.spec.ts`,
 * care are nevoie de o bază de date.
 */

const STAFF_PAGES = ['/admin/inscrieri', '/admin/inscrieri/noua'];

test.describe('ecranele echipei', () => {
  for (const path of STAFF_PAGES) {
    test(`${path} este 404 pentru un vizitator`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test('și o înscriere anume, la fel', async ({ page }) => {
    const response = await page.goto('/admin/inscrieri/00000000-0000-4000-8000-000000000001');
    expect(response?.status()).toBe(404);
  });

  test('un 404, nu un 403: nu confirmăm că există ceva acolo', async ({ page }) => {
    await page.goto('/admin/inscrieri');
    await expect(page.getByText(/nu ai voie|acces interzis/i)).toHaveCount(0);
  });
});

test.describe('pagina de preluare', () => {
  test('un token inventat nu spune de ce nu merge', async ({ page }) => {
    await page.goto(`/revendica/${'0'.repeat(64)}`);

    await expect(page.getByRole('heading', { name: 'Linkul nu mai este valabil' })).toBeVisible();
    // Aceeași propoziție pentru „nu există", „a fost folosit" și „a
    // expirat". O distincție aici ar spune cuiva care încearcă
    // token-uri care dintre încercări au nimerit ceva real.
    await expect(page.getByText(/Fie a fost folosit deja, fie a expirat/)).toBeVisible();
    // Și nicio urmă de firmă sau de adresă.
    await expect(page.getByLabel('E-mail')).toHaveCount(0);
  });

  test('un token scurt, la fel', async ({ page }) => {
    await page.goto('/revendica/abc');
    await expect(page.getByRole('heading', { name: 'Linkul nu mai este valabil' })).toBeVisible();
  });

  test('nu este indexabilă', async ({ page }) => {
    await page.goto(`/revendica/${'0'.repeat(64)}`);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });

  test('și trimite la contact, nu într-un colț mort', async ({ page }) => {
    await page.goto(`/revendica/${'0'.repeat(64)}`);
    await expect(page.getByRole('link', { name: 'Scrie-ne' })).toBeVisible();
  });
});

test.describe('nimic nu se scurge în public', () => {
  test('panoul public nu pomenește de înscrieri asistate', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByText(/înscriere asistată/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Înscrieri asistate' })).toHaveCount(0);
  });

  test('nici pagina de înscriere obișnuită a transportatorilor', async ({ page }) => {
    await page.goto('/transportatori/inscriere');
    await expect(page.getByText(/revendica/i)).toHaveCount(0);
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pagina de preluare încape', async ({ page }) => {
    await page.goto(`/revendica/${'0'.repeat(64)}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('consola', () => {
  test('pagina de preluare se încarcă fără erori', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(`/revendica/${'0'.repeat(64)}`);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
