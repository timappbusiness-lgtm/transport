import { expect, test } from '@playwright/test';

/**
 * Povestea întreagă a unei înscrieri asistate, cu baza pornită.
 *
 * În ordine: echipa declară acordul firmei și deschide o înscriere;
 * caută CUI-ul la ANAF și face firma; adaugă un vehicul și un document;
 * un al doilea om din echipă aprobă documentul, pentru că primul nu are
 * voie; se generează linkul; transportatorul îl deschide, își alege
 * parola, acceptă termenii și ajunge în tabloul de bord cu bannerul
 * care spune ce am completat noi.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_STAFF_EMAIL=…     E2E_STAFF_PASSWORD=… \
 *   E2E_STAFF2_EMAIL=…    E2E_STAFF2_PASSWORD=… \
 *   E2E_NEWCO_EMAIL=…     E2E_NEWCO_PASSWORD=… \
 *   E2E_ASSISTED_CUI=…    \
 *   pnpm test:e2e
 *
 * `E2E_NEWCO_EMAIL` trebuie să fie o adresă **fără cont**: pasul de
 * preluare este o înregistrare obișnuită, iar o adresă care are deja
 * cont este refuzată chiar la deschiderea înscrierii. `E2E_STAFF2_*`
 * este al doilea om din echipă, fără de care regula celor patru ochi nu
 * se poate verifica — testele care au nevoie de el sar, nu cad.
 *
 * NU A FOST RULAT: checkout-ul ăsta nu ajunge la un Supabase — politica
 * de rețea blochează, iar `supabase start` nu își poate trage imaginile.
 * Fiecare așteptare de aici este neverificată până o rulează cineva cu
 * stiva pornită. Regulile pe care le verifică sunt însă acoperite fără
 * browser de blocul ASI din `supabase/tests/rls_test.sql` (62 de
 * verificări, rulate) și de `tests/unit/onboarding.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF = account('STAFF');
const STAFF2 = account('STAFF2');
const NEWCO = account('NEWCO');
const CUI = process.env.E2E_ASSISTED_CUI ?? '';

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

/** Azi, cum o vrea un input de tip date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe('echipa deschide o înscriere', () => {
  test('nu poate fără bifa de acord', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri/noua');

    await page.getByLabel('Numele persoanei cu care ai vorbit').fill('Marian Popescu');
    await page.getByLabel('E-mailul ei').fill(NEWCO.email);
    await page.getByLabel('Telefonul ei').fill('0722123456');
    await page.getByLabel('Cum ai obținut acordul').selectOption('telefon');

    // Fără bifă, deci refuzul trebuie să vină înainte de orice.
    await page.getByRole('button', { name: 'Începe înscrierea' }).click();
    await expect(page.getByText(/Fără acordul firmei/)).toBeVisible();
  });

  test('și nici cu un acord datat mâine', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri/noua');

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Numele persoanei cu care ai vorbit').fill('Marian Popescu');
    await page.getByLabel('E-mailul ei').fill(NEWCO.email);
    await page.getByLabel('Telefonul ei').fill('0722123456');
    await page.getByLabel('Cum ai obținut acordul').selectOption('telefon');
    await page.getByLabel('Când').fill(tomorrow);
    await page.getByRole('checkbox').check();

    await page.getByRole('button', { name: 'Începe înscrierea' }).click();
    await expect(page.getByText(/nu poate fi în viitor/)).toBeVisible();
  });

  test('cu acordul bifat, ajunge la pasul firmei', async ({ page }) => {
    test.skip(NEWCO.email === '', 'Are nevoie de E2E_NEWCO_EMAIL.');
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri/noua');

    await page.getByLabel('Numele persoanei cu care ai vorbit').fill('Marian Popescu');
    await page.getByLabel('E-mailul ei').fill(NEWCO.email);
    await page.getByLabel('Telefonul ei').fill('0722123456');
    await page.getByLabel('Cum ai obținut acordul').selectOption('telefon');
    await page.getByLabel('Când').fill(today());
    await page.getByLabel('Notă (opțional)').fill('A confirmat la telefon, luni dimineață.');
    await page.getByRole('checkbox').check();

    await page.getByRole('button', { name: 'Începe înscrierea' }).click();
    await page.waitForURL(/\/admin\/inscrieri\/.+pas=firma/);
    await expect(page.getByRole('heading', { name: 'Date firmă' })).toBeVisible();
  });

  test('o adresă care are deja cont este refuzată', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri/noua');

    await page.getByLabel('Numele persoanei cu care ai vorbit').fill('Cineva Cunoscut');
    await page.getByLabel('E-mailul ei').fill(STAFF.email);
    await page.getByLabel('Telefonul ei').fill('0722123456');
    await page.getByLabel('Cum ai obținut acordul').selectOption('telefon');
    await page.getByLabel('Când').fill(today());
    await page.getByRole('checkbox').check();

    await page.getByRole('button', { name: 'Începe înscrierea' }).click();
    await expect(page.getByText(/Există deja un cont cu adresa aceasta/)).toBeVisible();
  });
});

test.describe('firma, cu ANAF', () => {
  test('se caută CUI-ul și se completează singur', async ({ page }) => {
    test.skip(CUI === '', 'Are nevoie de E2E_ASSISTED_CUI.');
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri');

    const open = page.getByRole('link', { name: 'Continuă' }).first();
    test.skip((await open.count()) === 0, 'Nicio înscriere în lucru.');
    await open.click();

    await page.getByLabel('CUI').first().fill(CUI);
    await page.getByRole('button', { name: 'Caută la ANAF' }).click();

    // Denumirea vine de la ANAF, nu de la noi.
    await expect(page.getByLabel('Denumire')).not.toHaveValue('');

    await page.getByLabel('Ce face firma').selectOption('transport');
    await page.getByRole('button', { name: 'Salvează firma' }).click();
    await page.waitForURL(/pas=documente/);
  });

  test('și nimeni nu o deține încă', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=in_lucru');

    const open = page.getByRole('link', { name: 'Continuă' }).first();
    test.skip((await open.count()) === 0, 'Nicio înscriere în lucru.');
    await open.click();

    await expect(page.getByText(/Nimeni nu o deține încă/)).toBeVisible();
  });
});

test.describe('vehicule și documente', () => {
  test('un vehicul se adaugă în numele firmei', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=in_lucru');

    const open = page.getByRole('link', { name: 'Continuă' }).first();
    test.skip((await open.count()) === 0, 'Nicio înscriere în lucru.');
    await open.click();

    await page.getByRole('link', { name: /3\. Vehicule/ }).click();
    const plate = `B${Math.floor(Math.random() * 900 + 100)}ASI`;
    await page.getByLabel('Număr de înmatriculare').fill(plate);
    await page.getByRole('button', { name: 'Adaugă vehiculul' }).click();

    await expect(page.getByText(`Vehiculul ${plate} a fost adăugat.`)).toBeVisible();
  });

  test('pasul documentelor spune regula celor patru ochi înainte', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=in_lucru');

    const open = page.getByRole('link', { name: 'Continuă' }).first();
    test.skip((await open.count()) === 0, 'Nicio înscriere în lucru.');
    await open.click();

    await page.getByRole('link', { name: /2\. Documente/ }).click();
    await expect(page.getByText(/le verifică altcineva din echipă/)).toBeVisible();
    await expect(page.getByText(/Dacă ești singurul, o poți face tu, dar îți cere o notă/))
      .toBeVisible();
  });
});

test.describe('patru ochi', () => {
  test('cine a încărcat documentul nu îl poate aproba', async ({ page }) => {
    test.skip(STAFF2.email === '', 'Are nevoie de un al doilea cont de echipă.');
    await signIn(page, STAFF);
    await page.goto('/admin/documente');

    const own = page.getByRole('button', { name: 'Aprobă' }).first();
    test.skip((await own.count()) === 0, 'Niciun document de verificat.');
    await own.click();

    await expect(page.getByText(/Îl verifică altcineva din echipă/)).toBeVisible();
  });

  test('dar celălalt poate', async ({ page }) => {
    test.skip(STAFF2.email === '', 'Are nevoie de un al doilea cont de echipă.');
    await signIn(page, STAFF2);
    await page.goto('/admin/documente');

    const other = page.getByRole('button', { name: 'Aprobă' }).first();
    test.skip((await other.count()) === 0, 'Niciun document de verificat.');
    await other.click();
    await expect(page.getByText(/Îl verifică altcineva din echipă/)).toHaveCount(0);
  });
});

test.describe('linkul', () => {
  test('se generează, se arată o dată, și spune că o dată', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=in_lucru');

    const open = page.getByRole('link', { name: 'Continuă' }).first();
    test.skip((await open.count()) === 0, 'Nicio înscriere în lucru.');
    await open.click();

    await page.getByRole('link', { name: /5\. Trimite linkul/ }).click();
    await expect(page.getByText(/Linkul se arată o singură dată/)).toBeVisible();

    await page.getByRole('button', { name: 'Generează linkul' }).click();
    await expect(page.getByText('Linkul a fost generat și e-mailul este în coadă.')).toBeVisible();

    // 64 de caractere hexazecimale, exact ce emite baza.
    const link = page.locator('code');
    await expect(link).toContainText(/\/revendica\/[0-9a-f]{64}/);
  });

  test('și e-mailul ajunge în coadă', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/notificari?template=assisted_claim');
    await expect(page.getByText('assisted_claim').first()).toBeVisible();
  });

  test('înscrierea trece în „trimis"', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=trimis');
    await expect(page.getByText('Trimis spre revendicare').first()).toBeVisible();
  });
});

test.describe('firma își preia contul', () => {
  /**
   * Linkul nu se poate citi din ecranul echipei — se arată o dată și se
   * păstrează doar amprenta lui. Testul are nevoie de el în
   * `E2E_CLAIM_URL`, pus de cine rulează, după ce îl copiază din pasul
   * de mai sus.
   */
  const claimUrl = process.env.E2E_CLAIM_URL ?? '';

  test('vede ce am completat, și că nu am ales nicio parolă', async ({ page }) => {
    test.skip(claimUrl === '', 'Are nevoie de E2E_CLAIM_URL, copiat din pasul anterior.');
    await page.goto(claimUrl);

    await expect(page.getByText('Ce am completat deja')).toBeVisible();
    await expect(page.getByText(/Noi nu am ales niciuna/)).toBeVisible();
    await expect(page.getByText('Nu ai cerut tu asta?')).toBeVisible();
  });

  test('o adresă greșită este refuzată înainte de înregistrare', async ({ page }) => {
    test.skip(claimUrl === '', 'Are nevoie de E2E_CLAIM_URL.');
    await page.goto(claimUrl);

    await page.getByLabel('E-mail').fill('altcineva@exemplu.ro');
    await page.getByLabel('Alege o parolă').fill('parola-buna-123');
    await page.getByLabel('Scrie parola din nou').fill('parola-buna-123');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Preiau contul' }).click();

    await expect(page.getByText(/Adresa nu este cea pentru care am pregătit contul/))
      .toBeVisible();
  });

  test('două parole diferite, la fel', async ({ page }) => {
    test.skip(claimUrl === '', 'Are nevoie de E2E_CLAIM_URL.');
    await page.goto(claimUrl);

    await page.getByLabel('E-mail').fill(NEWCO.email);
    await page.getByLabel('Alege o parolă').fill('parola-buna-123');
    await page.getByLabel('Scrie parola din nou').fill('altceva-456');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Preiau contul' }).click();

    await expect(page.getByText('Cele două parole nu sunt la fel.')).toBeVisible();
  });

  test('fără termeni, nu se poate', async ({ page }) => {
    test.skip(claimUrl === '', 'Are nevoie de E2E_CLAIM_URL.');
    await page.goto(claimUrl);

    await page.getByLabel('E-mail').fill(NEWCO.email);
    await page.getByLabel('Alege o parolă').fill('parola-buna-123');
    await page.getByLabel('Scrie parola din nou').fill('parola-buna-123');
    await page.getByRole('button', { name: 'Preiau contul' }).click();

    await expect(page.getByText(/trebuie să accepți termenii/)).toBeVisible();
  });

  test('cu totul corect, ajunge în cont cu bannerul', async ({ page }) => {
    test.skip(claimUrl === '' || NEWCO.password === '', 'Are nevoie de E2E_CLAIM_URL și _PASSWORD.');
    await page.goto(claimUrl);

    await page.getByLabel('E-mail').fill(NEWCO.email);
    await page.getByLabel('Alege o parolă').fill(NEWCO.password);
    await page.getByLabel('Scrie parola din nou').fill(NEWCO.password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Preiau contul' }).click();

    await page.waitForURL(/\/cont/);
    await expect(page.getByText('Contul a fost pregătit de echipa Coridor')).toBeVisible();
    await expect(page.getByText(/Poți schimba orice/)).toBeVisible();
  });

  test('și linkul nu mai merge a doua oară', async ({ page }) => {
    test.skip(claimUrl === '', 'Are nevoie de E2E_CLAIM_URL.');
    await page.goto(claimUrl);
    await expect(page.getByRole('heading', { name: 'Linkul nu mai este valabil' })).toBeVisible();
  });
});

test.describe('după preluare', () => {
  test('echipa nu mai poate adăuga vehicule în firmă', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri?stare=revendicat');

    // Nu mai există buton de continuare pe una revendicată: puterea în
    // plus s-a terminat odată cu înscrierea.
    const rows = page.getByRole('listitem');
    test.skip((await rows.count()) === 0, 'Nicio înscriere revendicată.');
    await expect(page.getByRole('link', { name: 'Continuă' })).toHaveCount(0);
  });

  test('și tabloul pilotului o numără', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/pilot');
    await expect(page.getByRole('heading', { name: 'Înscrieri asistate' })).toBeVisible();
    await expect(page.getByText('Preluate')).toBeVisible();
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('vrăjitorul încape', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/inscrieri/noua');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByLabel('Numele persoanei cu care ai vorbit')).toBeVisible();
  });
});
