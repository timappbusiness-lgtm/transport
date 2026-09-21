import { expect, test } from '@playwright/test';

/**
 * Evaluările, dintr-un browser fără nimic în spate.
 *
 * Povestea întreagă — două firme, o comandă dusă la capăt, o notă, un
 * răspuns — este în `faza-2-evaluari-supabase.spec.ts`, care are nevoie
 * de o bază de date. Ce se verifică aici merge pe o compilare fără
 * Supabase, ceea ce o face utilă la fiecare commit: ușile sunt închise,
 * ecranul echipei nu există pentru nimeni altcineva, nimic nu se scurge
 * în paginile publice, și nicio pagină nu iese din 390px.
 */

const MOBILE = { width: 390, height: 844 };

test.describe('evaluările sunt în spatele unei sesiuni', () => {
  for (const path of [
    '/cont/evaluari',
    '/cont/evaluari?cutie=date',
    '/cont/evaluari?cutie=primite',
  ]) {
    test(`${path} trimite un vizitator la autentificare`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/autentificare/);
    });
  }

  test('și duce destinația mai departe', async ({ page }) => {
    await page.goto('/cont/evaluari');
    await expect(page).toHaveURL(/next=%2Fcont%2Fevaluari/);
  });
});

test.describe('ecranul echipei nu există pentru altcineva', () => {
  // 404, nu 403: un 403 confirmă că ruta există și că e ceva de găsit.
  test('/admin/evaluari este 404 pentru un vizitator', async ({ page, request }) => {
    const response = await request.get('/admin/evaluari');
    expect(response.status()).toBe(404);
    await page.goto('/admin/evaluari');
    await expect(page.getByText(/404|nu există|Pagina/i).first()).toBeVisible();
  });
});

test.describe('nimic nu se scurge în paginile publice', () => {
  test('panoul de cereri nu vorbește despre evaluări', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Evaluează' })).toHaveCount(0);
  });

  test('directorul de firme nu arată o medie inventată', async ({ page }) => {
    // Fără bază de date nu există nicio firmă, deci nici vreun număr.
    // Ce se verifică este că pagina nu scrie „0,0" în lipsa lor.
    await page.goto('/firme');
    await expect(page.getByText('0,0')).toHaveCount(0);
  });
});

test.describe('la 390px', () => {
  test.use({ viewport: MOBILE });

  test('pagina de autentificare pe care ajunge cineva de pe un e-mail încape', async ({ page }) => {
    // Drumul întreg al unei evaluări: un link din e-mail, o autentificare,
    // și formularul. Primul pas trebuie să meargă pe telefon.
    await page.goto('/cont/evaluari');
    await expect(page).toHaveURL(/autentificare/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('/firme nu derapează lateral', async ({ page }) => {
    await page.goto('/firme');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('fără erori în consolă', () => {
  test('/firme se încarcă curat', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/firme');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
