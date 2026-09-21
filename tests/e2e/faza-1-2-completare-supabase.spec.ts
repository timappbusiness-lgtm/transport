import { expect, test } from '@playwright/test';

/**
 * Povestea întreagă a celor cinci lucruri, cu baza de date pornită.
 *
 * În ordine: un transportator bifează „Se repetă" și își vede seria cu
 * plecările care urmează, o pune pe pauză și o repornește; de pe o
 * comandă livrată pleacă un retur, completat, pe care tot el îl
 * publică; un expeditor își adaugă un favorit, deschide o cerere numai
 * pentru el, invitatul o vede și ofertează, un neinvitat nu o vede
 * nicăieri — nici pe panou, nici pe link direct; cererea se deschide pe
 * bursă și atunci o vede și el; ajutorul se caută și răspunde la ce
 * întreabă fiecare tip de cont.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_CARRIER_EMAIL=…     E2E_CARRIER_PASSWORD=… \
 *   E2E_OTHER_CARRIER_EMAIL=…  E2E_OTHER_CARRIER_PASSWORD=… \
 *   E2E_CLIENT_EMAIL=…      E2E_CLIENT_PASSWORD=… \
 *   pnpm test:e2e
 *
 * Conturile au nevoie de context: transportatorul cu o firmă verificată
 * și cel puțin un vehicul cu actele în regulă, al doilea transportator
 * cu firmă verificată dar fără nicio legătură cu clientul, clientul cu
 * dreptul de a publica. Unde lipsește, testul **sare**, nu cade — un
 * test roșu din lipsă de date este un test pe care nimeni nu îl mai
 * citește.
 *
 * NU A FOST RULAT: checkout-ul ăsta nu ajunge la un Supabase — politica
 * de rețea blochează, iar `supabase start` nu își poate trage imaginile.
 * Fiecare așteptare de aici este neverificată până o rulează cineva cu
 * stiva pornită. Regulile pe care le verifică sunt însă acoperite fără
 * browser: blocurile SER (25 de verificări), PRV (25) și FAV (13) din
 * `supabase/tests/rls_test.sql`, toate rulate, plus
 * `tests/unit/recurrence.test.ts`, `tests/unit/return-route.test.ts` și
 * `tests/unit/help.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const CARRIER = account('CARRIER');
const OTHER = account('OTHER_CARRIER');
const CLIENT = account('CLIENT');

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

/** Ziua de azi plus atâtea zile, ca `YYYY-MM-DD`. */
function inDays(days: number): string {
  const ms = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`);
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

test.describe('seria care se repetă', () => {
  test('se publică din formularul obișnuit, cu bifa', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/trasee/nou');

    // Fără vehicul conform nu există formular, ci un îndemn spre flotă.
    const noVehicle = page.getByText(/Nu ai niciun vehicul cu documentele în regulă/);
    test.skip(await noVehicle.isVisible(), 'Transportatorul nu are vehicul cu actele în regulă.');

    await page.getByLabel('De unde pleci').fill('Cluj-Napoca');
    await page.getByLabel('Unde ajungi').fill('București');
    await page.getByLabel('Disponibil de la').fill(inDays(1));

    await page.getByLabel('Vehiculul').selectOption({ index: 1 });

    // Bifa scoate la iveală regula; până la ea nu are ce căuta pe ecran.
    await expect(page.getByLabel('În ce zile')).toHaveCount(0);
    await page.getByText('Se repetă', { exact: true }).click();

    await page.getByRole('group', { name: 'În ce zile' }).getByText('L', { exact: true }).click();
    await page.getByLabel('Până la').fill(inDays(30));

    await page.getByRole('button', { name: 'Publică seria' }).click();
    await page.waitForURL(/\/cont\/trasee/);

    await expect(page.getByRole('heading', { name: 'Plecări care se repetă' })).toBeVisible();
    await expect(page.getByText('Cluj-Napoca → București').first()).toBeVisible();
    await expect(page.getByText('În fiecare luni').first()).toBeVisible();
  });

  test('arată ce plecări urmează din ea', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/trasee');

    const series = page.getByRole('heading', { name: 'Plecări care se repetă' });
    test.skip(!(await series.isVisible()), 'Nicio serie.');

    await expect(page.getByText('Următoarele plecări').first()).toBeVisible();
    // Datele sunt afișate ca YYYY-MM-DD, monospațiat.
    await expect(page.getByText(/^\d{4}-\d{2}-\d{2}$/).first()).toBeVisible();
  });

  test('pauza oprește generarea, și o spune', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/trasee');

    const pause = page.getByRole('button', { name: 'Pune pe pauză' }).first();
    test.skip((await pause.count()) === 0, 'Nicio serie activă.');
    await pause.click();

    await expect(page.getByText('Seria este pe pauză. Plecările deja publicate rămân.')).toBeVisible();
    await expect(page.getByText('Pe pauză').first()).toBeVisible();
    // Cât e pe pauză, nu mai promitem plecări care nu vin.
    await expect(page.getByText('Următoarele plecări')).toHaveCount(0);
  });

  test('și repornirea o pune la loc', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/trasee');

    const resume = page.getByRole('button', { name: 'Repornește' }).first();
    test.skip((await resume.count()) === 0, 'Nicio serie pe pauză.');
    await resume.click();

    await expect(page.getByText('Seria a fost repornită.')).toBeVisible();
    await expect(page.getByText('Activă').first()).toBeVisible();
  });

  test('plecările generate sunt plecări obișnuite, pe bursă', async ({ page }) => {
    await page.goto('/trasee');
    // Nimic nu trădează că plecarea vine dintr-o serie: pentru client
    // este un traseu ca oricare altul.
    await expect(page.getByText(/serie|Se repetă/i)).toHaveCount(0);
  });
});

test.describe('returul, de pe comandă', () => {
  test('apare pe comanda cu livrare programată, cu datele întoarse', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/transporturi');

    const first = page.getByRole('link', { name: /Vezi comanda|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Transportatorul nu are nicio comandă.');
    await first.click();
    await page.waitForURL(/\/cont\/transporturi\//);

    const card = page.getByRole('heading', { name: 'Te întorci gol?' });
    test.skip(!(await card.isVisible()), 'Comanda nu este încă la livrare.');

    await expect(
      page.getByText(/Pregătim o plecare pe retur din localitatea de livrare/),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Publică returul' })).toBeVisible();
  });

  test('duce la formularul de plecare, completat', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/transporturi');

    const first = page.getByRole('link', { name: /Vezi comanda|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Transportatorul nu are nicio comandă.');
    await first.click();

    const action = page.getByRole('link', { name: 'Publică returul' });
    test.skip((await action.count()) === 0, 'Comanda nu are retur de publicat.');
    await action.click();

    await page.waitForURL(/\/cont\/trasee\/nou\?/);
    // Formularul obișnuit, nu altul: verificarea și apăsarea rămân ale omului.
    await expect(page.getByRole('heading', { name: 'Publică un traseu' })).toBeVisible();
    await expect(page.getByLabel('De unde pleci')).not.toHaveValue('');
    await expect(page.getByLabel('Disponibil de la')).not.toHaveValue('');
  });
});

test.describe('favoriții', () => {
  test('se adaugă de pe profilul unei firme', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/firme');

    const first = page.getByRole('link', { name: /Vezi profilul|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Niciun profil public.');
    await first.click();
    await page.waitForURL(/\/firme\//);

    const add = page.getByRole('button', { name: 'Adaugă la favoriți' });
    test.skip((await add.count()) === 0, 'Firma nu poate fi adăugată de contul ăsta.');
    await add.click();

    await expect(page.getByText('În favoriți')).toBeVisible();
  });

  test('lista spune, de două ori, că este a firmei', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/favoriti');

    await expect(page.getByRole('heading', { name: 'Transportatori favoriți' })).toBeVisible();
    await expect(
      page.getByText('Lista este a firmei, nu a ta: rămâne și după ce pleacă un coleg.'),
    ).toBeVisible();
    await expect(page.getByText('Transportatorul nu află că este pe lista ta.')).toBeVisible();
  });

  test('filtrează ofertele primite', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/oferte?cutie=primite');

    await expect(page.getByRole('link', { name: 'Doar favoriți' })).toBeVisible();
    await page.getByRole('link', { name: 'Doar favoriți' }).click();
    await page.waitForURL(/favoriti=da/);
    await expect(page.getByRole('link', { name: 'Doar favoriți' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('cererea privată', () => {
  test('se publică numai pentru cine alegi', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cerere/noua');

    // Vizibilitatea este pe ultimul pas, lângă contact.
    const privateChoice = page.getByLabel('Doar transportatorii pe care îi aleg');
    test.skip((await privateChoice.count()) === 0, 'Formularul nu a ajuns la pasul de contact.');
    await expect(
      page.getByText('Nu apare pe panoul public și nimeni altcineva nu primește alertă pentru ea.'),
    ).toBeVisible();
  });

  test('proprietarul vede cine o poate citi, și pe cine mai poate invita', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/cereri');

    const first = page.getByRole('link', { name: /Vezi cererea|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Clientul nu are nicio cerere.');
    await first.click();
    await page.waitForURL(/\/cont\/cereri\//);

    const panel = page.getByRole('heading', { name: 'Cine vede cererea' });
    test.skip(!(await panel.isVisible()), 'Cererea deschisă nu este privată.');

    await expect(
      page.getByText('Cererea este privată: o văd numai firmele invitate, și numai ele pot trimite oferte.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deschide pe bursă' })).toBeVisible();
  });

  test('nu apare pe panoul public', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByText('Privată')).toHaveCount(0);
  });

  test('un transportator neinvitat nu o vede nici pe link direct', async ({ context, page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/cereri');

    const first = page.getByRole('link', { name: /Vezi cererea|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Clientul nu are nicio cerere.');
    await first.click();
    await page.waitForURL(/\/cont\/cereri\//);

    const panel = page.getByRole('heading', { name: 'Cine vede cererea' });
    test.skip(!(await panel.isVisible()), 'Cererea deschisă nu este privată.');

    const id = page.url().split('/').pop() ?? '';

    // Întâi că linkul merge pentru cine are voie. Vederea publică
    // filtrează cererile private, deci pagina cade pe
    // `private_request_for_viewer()` — dacă ea nu ar răspunde, și
    // proprietarul ar primi 404, iar testul de dedesubt ar trece din
    // motivul greșit.
    const own = await page.goto(`/cereri/${id}`);
    expect(own?.status()).toBe(200);

    // Același link, alt cont. Politica din bază decide, nu ecranul, iar
    // răspunsul este 404 — nu 403: un „nu ai voie" ar confirma că
    // cererea există, ceea ce este exact ce ascundem.
    await context.clearCookies();
    await signIn(page, OTHER);
    const response = await page.goto(`/cereri/${id}`);
    expect(response?.status()).toBe(404);
  });

  test('deschiderea pe bursă o face publică, și nu se poate reveni', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/cereri');

    const first = page.getByRole('link', { name: /Vezi cererea|Detalii/ }).first();
    test.skip((await first.count()) === 0, 'Clientul nu are nicio cerere.');
    await first.click();

    const open = page.getByRole('button', { name: 'Deschide pe bursă' });
    test.skip((await open.count()) === 0, 'Cererea deschisă nu este privată.');

    // Avertismentul este înainte de apăsare, nu după.
    await expect(page.getByText(/Nu se poate reveni: odată publică, rămâne publică/)).toBeVisible();
    await open.click();

    await expect(page.getByRole('heading', { name: 'Cine vede cererea' })).toHaveCount(0);
  });
});

test.describe('ajutorul', () => {
  test('caută și numără ce a găsit', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/ajutor');

    await expect(page.getByRole('heading', { name: 'Cum funcționează', level: 1 })).toBeVisible();

    await page.getByPlaceholder('Caută în ajutor').fill('ofertă');
    await page.getByRole('button', { name: 'Caută' }).click();
    await page.waitForURL(/\?q=/);

    await expect(page.getByText(/răspuns(uri)?$|Un răspuns/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi tot' })).toBeVisible();
  });

  test('un cuvânt fără răspuns spune asta, nu o listă goală', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/ajutor?q=zzzqqq');

    await expect(page.getByText('Nu am găsit nimic pentru ce ai căutat.')).toBeVisible();
  });

  test('semnul de întrebare de pe un ecran deschide răspunsul lui', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/oferte');

    const hint = page.getByRole('link', { name: 'Cum funcționează' });
    test.skip((await hint.count()) === 0, 'Ecranul nu are legătură spre ajutor.');
    await hint.click();

    await page.waitForURL(/\/cont\/ajutor\?raspuns=/);
    // Răspunsul cerut este deschis, nu doar prezent în pagină.
    const open = page.locator('details[open]');
    await expect(open.first()).toBeVisible();
  });

  test('un transportator nu vede răspunsurile clientului', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/ajutor');

    await expect(page.getByText('Cum public o cerere de transport?')).toHaveCount(0);
  });

  test('blocul de sprijin nu arată un e-mail inventat', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/ajutor');

    await expect(page.getByRole('heading', { name: 'Nu ai găsit răspunsul?' })).toBeVisible();

    // Ori datele reale, ori marcajul. Niciodată un rând gol.
    const missing = page.getByText('De completat înainte de lansare');
    const mail = page.locator('a[href^="mailto:"]');
    expect((await missing.count()) + (await mail.count())).toBeGreaterThan(0);
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ajutorul și favoriții încap pe 390px', async ({ page }) => {
    await signIn(page, CLIENT);

    for (const path of ['/cont/ajutor', '/cont/favoriti', '/cont/oferte']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} iese lateral`).toBeLessThanOrEqual(1);
    }
  });
});
