import { expect, test } from '@playwright/test';
import { settled } from './settled';

/**
 * Ce se poate verifica fără o bază de date.
 *
 * Aproape tot ce este interesant aici are nevoie de conturi — o serie
 * care generează plecări, o cerere privată pe care un neinvitat nu o
 * vede. Partea care se verifică fără ele este tot partea care contează
 * cel mai mult: **nimic privat nu apare pe panoul public**, iar
 * ecranele din cont sunt închise unui vizitator.
 *
 * Povestea întreagă este în `faza-1-2-completare-supabase.spec.ts`.
 */

const ACCOUNT_PAGES = [
  '/cont/ajutor',
  '/cont/favoriti',
  '/cont/trasee',
  '/cont/oferte',
];

test.describe('ecranele din cont sunt închise unui vizitator', () => {
  for (const path of ACCOUNT_PAGES) {
    test(`${path} trimite la autentificare`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      await expect(page).toHaveURL(new RegExp('/autentificare'));
      // Și îl duce înapoi unde voia să ajungă.
      await expect(page).toHaveURL(new RegExp(`next=${encodeURIComponent(path)}`, 'i'));
    });
  }
});

test.describe('panoul public nu suflă o vorbă despre cereri private', () => {
  test('nu apare niciun cuvânt despre vizibilitate', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await expect(page.getByText(/cerere privată|doar transportatorii pe care/i)).toHaveCount(0);
    await expect(page.getByText('Privată')).toHaveCount(0);
  });

  test('nici despre favoriți', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    await expect(page.getByText(/favoriț/i)).toHaveCount(0);
  });

  test('și nici despre serii de plecări', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    await expect(page.getByText(/se repetă|serie de plecări/i)).toHaveCount(0);
  });
});

test.describe('ajutorul', () => {
  test('nu este public: un vizitator este trimis să intre în cont', async ({ page }) => {
    await page.goto('/cont/ajutor?raspuns=cum-public-o-cerere');
    await expect(page).toHaveURL(new RegExp('/autentificare'));
  });

  test('întrebările frecvente publice rămân publice', async ({ page }) => {
    // Cele două nu se confundă: /intrebari-frecvente vinde, /cont/ajutor
    // explică. Prima rămâne deschisă oricui.
    await page.goto('/intrebari-frecvente');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('panoul de cereri încape', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('și panoul de trasee', async ({ page }) => {
    await page.goto('/trasee');
    await settled(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('consola', () => {
  test('panoul de cereri se încarcă fără erori', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/cereri');
    await settled(page);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});
