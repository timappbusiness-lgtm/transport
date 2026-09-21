import { expect, test } from '@playwright/test';

/**
 * Mesageria și moderarea, dintr-un browser fără nimic în spate.
 *
 * Povestea întreagă — un transportator scrie unui client, numărul se
 * maschează, comanda își face firul — este în
 * `faza-2-mesagerie-supabase.spec.ts`, care are nevoie de o bază de
 * date. Ce se verifică aici merge pe o compilare fără Supabase: ușile
 * sunt închise, ecranele echipei nu există pentru nimeni altcineva,
 * nimic nu se scurge în paginile publice, și nimic nu iese din 390px.
 */

const MOBILE = { width: 390, height: 844 };
const ID = '00000000-0000-0000-0000-000000000001';

test.describe('mesajele sunt în spatele unei sesiuni', () => {
  for (const path of [
    '/cont/mesaje',
    '/cont/mesaje?cutie=necitite',
    '/cont/mesaje?cutie=comenzi',
    `/cont/mesaje/${ID}`,
  ]) {
    test(`${path} trimite un vizitator la autentificare`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/autentificare/);
    });
  }

  test('și duce destinația mai departe', async ({ page }) => {
    await page.goto('/cont/mesaje');
    await expect(page).toHaveURL(/next=%2Fcont%2Fmesaje/);
  });
});

test.describe('ecranele echipei nu există pentru altcineva', () => {
  // 404, nu 403: un 403 confirmă că ruta există și că e ceva de găsit.
  for (const path of ['/admin/anunturi', '/admin/conversatii', `/admin/conversatii/${ID}`]) {
    test(`${path} este 404 pentru un vizitator`, async ({ page, request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      await page.goto(path);
      await expect(page.getByText(/404|nu există|Pagina/i).first()).toBeVisible();
    });
  }
});

test.describe('nimic nu se scurge în paginile publice', () => {
  test('panoul de cereri nu oferă un buton de mesaj unui vizitator', async ({ page }) => {
    // „Trimite mesaj" consumă din abonament, deci nu apare pentru cineva
    // fără cont — are de trecut mai întâi prin autentificare.
    await page.goto('/cereri');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trimite mesaj' })).toHaveCount(0);
  });

  test('și nu vorbește despre conversații', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByText(/conversați/i)).toHaveCount(0);
  });
});

test.describe('pagina de confidențialitate spune regula', () => {
  test('conversațiile private nu sunt citite de echipă', async ({ page }) => {
    await page.goto('/confidentialitate');
    await expect(page.getByText(/conversațiile tale private nu sunt citite de noi/i)).toBeVisible();
  });

  test('și spune cele două excepții pe nume', async ({ page }) => {
    await page.goto('/confidentialitate');
    await expect(page.getByText(/a sesizat un mesaj din ea/i)).toBeVisible();
    await expect(page.getByText(/a intrat în dispută/i)).toBeVisible();
  });

  test('și cât trăiește o conversație fără comandă', async ({ page }) => {
    await page.goto('/confidentialitate');
    await expect(page.getByText(/24 de luni de la ultimul mesaj/i)).toBeVisible();
  });
});

test.describe('la 390px', () => {
  test.use({ viewport: MOBILE });

  test('pagina de autentificare pe care ajunge cineva de pe un e-mail încape', async ({ page }) => {
    await page.goto('/cont/mesaje');
    await expect(page).toHaveURL(/autentificare/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  for (const path of ['/cereri', '/confidentialitate']) {
    test(`${path} nu derapează lateral`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('fără erori în consolă', () => {
  test('pagina de confidențialitate se încarcă curat', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/confidentialitate');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
