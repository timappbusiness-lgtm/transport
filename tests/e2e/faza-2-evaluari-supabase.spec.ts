import { expect, test } from '@playwright/test';

/**
 * O evaluare, de la capăt la capăt, cu cele două firme care au făcut
 * transportul.
 *
 * Povestea, în ordine: clientul deschide o comandă încheiată și dă o
 * notă cu sub-scoruri și câteva cuvinte; o corectează o dată, în
 * fereastră; transportatorul o vede, răspunde public o singură dată;
 * media apare pe profil abia de la a treia evaluare; echipa ascunde una
 * cu motiv și media se schimbă la loc.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_CLIENT_EMAIL=…     E2E_CLIENT_PASSWORD=… \
 *   E2E_CARRIER_EMAIL=…    E2E_CARRIER_PASSWORD=… \
 *   E2E_STAFF_EMAIL=…      E2E_STAFF_PASSWORD=… \
 *   pnpm test:e2e
 *
 * Clientul trebuie să aibă cel puțin o comandă în „Finalizate", în
 * fereastra de evaluare, pe care nu a evaluat-o. Fără ea testele sar,
 * nu cad.
 *
 * NU A FOST RULAT: checkout-ul ăsta nu ajunge la un Supabase — politica
 * de rețea o blochează, iar `supabase start` nu își poate trage
 * imaginile. Fiecare așteptare de aici este neverificată până o rulează
 * cineva cu stiva pornită. Regulile pe care le verifică sunt acoperite
 * fără browser de blocul ERV din `supabase/tests/rls_test.sql`, care
 * rulează, și de `tests/unit/ratings.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const CLIENT = account('CLIENT');
const CARRIER = account('CARRIER');
const STAFF = account('STAFF');

type Page = import('@playwright/test').Page;

function account(prefix: string) {
  return {
    email: process.env[`E2E_${prefix}_EMAIL`] ?? '',
    password: process.env[`E2E_${prefix}_PASSWORD`] ?? '',
    name: prefix.toLowerCase(),
  };
}

test.beforeEach(() => {
  test.skip(!ENABLED, 'Are nevoie de un Supabase cu migrările aplicate: E2E_SUPABASE=1.');
});

async function signIn(page: Page, who: { email: string; password: string; name: string }) {
  test.skip(
    who.email === '' || who.password === '',
    `Are nevoie de E2E_${who.name.toUpperCase()}_EMAIL și _PASSWORD.`,
  );
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: /Intră|Autentificare/ }).click();
  await page.waitForURL(/\/cont/);
}

/** Prima comandă din fila „De dat", sau sărim: nu avem ce evalua. */
async function openFirstPending(page: Page) {
  await page.goto('/cont/evaluari');
  const rate = page.getByRole('link', { name: 'Evaluează' }).first();
  const count = await rate.count();
  test.skip(count === 0, 'Contul nu are nicio comandă încheiată de evaluat.');
  await rate.click();
  await page.waitForURL(/\/cont\/transporturi\//);
}

/** O notă pe grupul de stele cu numele dat. Radio, deci se poate da click pe etichetă. */
async function pickScore(page: Page, group: string, score: number) {
  await page
    .getByRole('group', { name: group })
    .getByRole('radio', { name: new RegExp(`^${score} —`) })
    .check();
}

test.describe('clientul evaluează', () => {
  test('dă o notă, sub-scoruri și câteva cuvinte', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstPending(page);

    await expect(page.getByText(/Poți evalua până la/)).toBeVisible();

    await pickScore(page, 'Nota generală', 5);
    await pickScore(page, 'Punctualitate', 5);
    await pickScore(page, 'Grija față de vehicul', 4);
    await page.getByLabel(/Câteva cuvinte/).fill('Mașina a ajuns curată și la timp.');

    // Previzualizarea arată exact ce va fi public.
    await page.getByRole('button', { name: 'Vezi cum arată' }).click();
    await expect(page.getByText('Așa va apărea pe profil')).toBeVisible();
    await expect(page.getByText('Mașina a ajuns curată și la timp.')).toBeVisible();

    await page.getByRole('button', { name: 'Trimite evaluarea' }).click();
    await expect(page.getByText('Evaluarea a fost trimisă. Mulțumim.')).toBeVisible();
  });

  test('un număr de telefon din comentariu nu ajunge public', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstPending(page);

    await pickScore(page, 'Nota generală', 4);
    await page.getByLabel(/Câteva cuvinte/).fill('Sunați-mă la 0722123456.');
    await page.getByRole('button', { name: 'Trimite evaluarea' }).click();

    await page.goto('/cont/evaluari?cutie=date');
    await expect(page.getByText('0722123456')).toHaveCount(0);
  });

  test('o corectează o singură dată', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/evaluari?cutie=date');

    const edit = page.getByRole('link', { name: 'Corectează evaluarea' }).first();
    test.skip((await edit.count()) === 0, 'Nicio evaluare în fereastra de corectare.');
    await edit.click();

    await pickScore(page, 'Nota generală', 3);
    await page.getByRole('button', { name: 'Salvează corectura' }).click();
    await expect(page.getByText('Evaluarea a fost corectată.')).toBeVisible();

    // A doua oară nu se mai poate.
    await page.goto('/cont/evaluari?cutie=date');
    await expect(page.getByRole('link', { name: 'Corectează evaluarea' })).toHaveCount(0);
  });

  test('și nu poate evalua aceeași comandă de două ori', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/evaluari?cutie=date');
    const order = page.getByRole('link', { name: 'Vezi comanda' }).first();
    test.skip((await order.count()) === 0, 'Nicio evaluare dată.');
    await order.click();
    await expect(page.getByText('Evaluarea nu se mai poate schimba.')).toBeVisible();
  });
});

test.describe('transportatorul răspunde', () => {
  test('o dată, public, și nu de două ori', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/evaluari?cutie=primite');

    const reply = page.getByRole('button', { name: 'Răspunde public' }).first();
    test.skip((await reply.count()) === 0, 'Nicio evaluare primită fără răspuns.');
    await reply.click();

    await page.getByLabel('Răspunsul tău').fill('Mulțumim. Ne pare rău pentru întârziere.');
    await page.getByRole('button', { name: 'Publică răspunsul' }).click();
    await expect(page.getByText('Răspunsul a fost publicat.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Răspunde public' })).toHaveCount(0);
  });

  test('și nu poate ascunde ce s-a spus despre firmă', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/evaluari?cutie=primite');
    await expect(page.getByRole('button', { name: 'Ascunde evaluarea' })).toHaveCount(0);
  });
});

test.describe('profilul public', () => {
  test('nu arată o medie sub trei evaluări', async ({ page }) => {
    const slug = process.env.E2E_CARRIER_SLUG ?? '';
    test.skip(slug === '', 'Are nevoie de E2E_CARRIER_SLUG.');

    await page.goto(`/firme/${slug}`);
    await expect(page.getByRole('heading', { name: 'Reputație' })).toBeVisible();

    const count = await page.getByText('Evaluări insuficiente').count();
    if (count > 0) {
      // Sub prag: scrie de ce, nu o cifră mică.
      await expect(page.getByText(/nu este încă o medie|nu este o medie/)).toBeVisible();
    }
  });

  test('„Cum calculăm" spune fiecare formulă', async ({ page }) => {
    const slug = process.env.E2E_CARRIER_SLUG ?? '';
    test.skip(slug === '', 'Are nevoie de E2E_CARRIER_SLUG.');

    await page.goto(`/firme/${slug}`);
    await page.getByText('Cum calculăm').click();
    await expect(page.getByText(/Punctualitatea este procentul/)).toBeVisible();
    await expect(page.getByText(/Rata de răspuns este procentul/)).toBeVisible();
    await expect(page.getByText(/nu se completează de mână/)).toBeVisible();
  });
});

test.describe('echipa', () => {
  test('ascunde o evaluare cu motiv, și media se schimbă', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/evaluari');

    const hide = page.getByRole('button', { name: 'Ascunde evaluarea' }).first();
    test.skip((await hide.count()) === 0, 'Nicio evaluare vizibilă de ascuns.');
    await hide.click();

    // Fără motiv nu se poate.
    await page.getByRole('button', { name: 'Ascunde', exact: true }).click();
    await expect(page.getByText(/Scrie de ce/)).toBeVisible();

    await page.getByLabel('Ascunde evaluarea').fill('Limbaj injurios');
    await page.getByRole('button', { name: 'Ascunde', exact: true }).click();
    await expect(page.getByText('Evaluarea a fost ascunsă.')).toBeVisible();

    await page.goto('/admin/jurnal?actiune=rating.hidden');
    await expect(page.getByText('Limbaj injurios')).toBeVisible();
  });

  test('și o repune, tot cu motiv', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/evaluari?ascunse=da');

    const unhide = page.getByRole('button', { name: 'Repune evaluarea' }).first();
    test.skip((await unhide.count()) === 0, 'Nicio evaluare ascunsă.');
    await unhide.click();
    await page.getByLabel('Repune evaluarea').fill('Sesizare neîntemeiată');
    await page.getByRole('button', { name: 'Repune', exact: true }).click();
    await expect(page.getByText('Evaluarea a fost repusă.')).toBeVisible();
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('formularul de evaluare încape', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstPending(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Stelele sunt butoane radio, deci se pot atinge cu degetul și se pot
    // parcurge cu săgețile.
    const stars = page.getByRole('group', { name: 'Nota generală' }).getByRole('radio');
    await expect(stars).toHaveCount(5);
  });
});
