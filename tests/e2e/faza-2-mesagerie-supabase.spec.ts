import { expect, test } from '@playwright/test';

/**
 * Povestea întreagă a unei conversații, cu baza de date pornită.
 *
 * În ordine: un transportator scrie unui client de pe o cerere, i se
 * spune înainte că se consumă un contact, și a doua oară nu se mai
 * consumă; clientul răspunde cu un număr de telefon, care se maschează;
 * oferta se acceptă, comanda își face singură firul, legat de discuția
 * de dinainte; în firul comenzii numărul se vede; șoferul vede numai
 * firul comenzii lui; o imagine urcă; un mesaj se sesizează și echipa îl
 * rezolvă; o blocare oprește conversațiile noi de pe anunțuri; echipa
 * ascunde un anunț și proprietarul citește motivul.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_CLIENT_EMAIL=…     E2E_CLIENT_PASSWORD=… \
 *   E2E_CARRIER_EMAIL=…    E2E_CARRIER_PASSWORD=… \
 *   E2E_DRIVER_EMAIL=…     E2E_DRIVER_PASSWORD=… \
 *   E2E_STAFF_EMAIL=…      E2E_STAFF_PASSWORD=… \
 *   pnpm test:e2e
 *
 * Conturile au nevoie de context: clientul cu cel puțin o cerere pe
 * panou, transportatorul cu abonament care mai are contacte, șoferul
 * repartizat pe o comandă. Unde lipsește, testul **sare**, nu cade — un
 * test roșu din lipsă de date este un test pe care nimeni nu îl mai
 * citește.
 *
 * NU A FOST RULAT: checkout-ul ăsta nu ajunge la un Supabase — politica
 * de rețea blochează, iar `supabase start` nu își poate trage imaginile.
 * Fiecare așteptare de aici este neverificată până o rulează cineva cu
 * stiva pornită. Regulile pe care le verifică sunt însă acoperite fără
 * browser: blocul MSG din `supabase/tests/rls_test.sql` (45 de
 * verificări, rulate) și `tests/unit/messages.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const CLIENT = account('CLIENT');
const CARRIER = account('CARRIER');
const DRIVER = account('DRIVER');
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

/** Prima cerere de pe panou, sau sărim: nu avem cui scrie. */
async function openFirstRequest(page: Page) {
  await page.goto('/cereri');
  const first = page.getByRole('link', { name: /Vezi cererea|Detalii/ }).first();
  test.skip((await first.count()) === 0, 'Panoul nu are nicio cerere.');
  await first.click();
  await page.waitForURL(/\/cereri\//);
}

/** Scrie în fir și așteaptă să apară. */
async function say(page: Page, text: string) {
  await page.getByPlaceholder('Scrie un mesaj…').fill(text);
  await page.getByRole('button', { name: 'Trimite', exact: true }).click();
}

test.describe('transportatorul deschide o conversație', () => {
  test('i se spune că se consumă un contact, înainte să apese', async ({ page }) => {
    await signIn(page, CARRIER);
    await openFirstRequest(page);

    await page.getByRole('button', { name: 'Trimite mesaj' }).click();

    // Poarta, scrisă înainte de apăsare. Asta este tot rostul pasului.
    await expect(page.getByText(/consumă un contact din abonament/)).toBeVisible();
    await expect(page.getByText(/o singură dată pe cerere sau traseu/)).toBeVisible();

    await page.getByRole('button', { name: 'Trimite mesaj' }).click();
    await page.waitForURL(/\/cont\/mesaje\//);
    await expect(page.getByRole('link', { name: /Înapoi la mesaje/ })).toBeVisible();
  });

  test('și a doua oară pe același anunț nu se mai numără', async ({ page }) => {
    await signIn(page, CARRIER);
    await openFirstRequest(page);

    await page.getByRole('button', { name: 'Trimite mesaj' }).click();
    await expect(page.getByText(/Ai deschis deja contactul aici/)).toBeVisible();
  });

  test('firul apare în inbox, cu eticheta contextului', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cont/mesaje');
    await expect(page.getByRole('heading', { name: 'Mesaje', level: 1 })).toBeVisible();
    await expect(page.getByText('Cerere').first()).toBeVisible();
  });
});

test.describe('masca', () => {
  test('un număr de telefon scris înainte de comandă nu se vede', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();
    await page.waitForURL(/\/cont\/mesaje\//);

    await say(page, 'Sunați-mă la 0722123456, vă rog.');

    // Numărul nu apare nicăieri în fir, iar linia explică de ce.
    await expect(page.getByText('0722123456')).toHaveCount(0);
    await expect(page.getByText(/se afișează după confirmarea comenzii/)).toBeVisible();
  });
});

test.describe('comanda își face firul', () => {
  test('firul comenzii trimite la discuția de dinainte', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje?cutie=comenzi');

    const order = page.getByRole('link', { name: /Comandă|SRL|—/ }).first();
    test.skip((await order.count()) === 0, 'Nicio comandă cu fir.');
    await order.click();

    await expect(page.getByText('Comandă')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Discuția de dinainte de comandă' })).toBeVisible();
  });

  test('și în el numărul de telefon se vede', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje?cutie=comenzi');

    const order = page.getByRole('link', { name: /Comandă|SRL|—/ }).first();
    test.skip((await order.count()) === 0, 'Nicio comandă cu fir.');
    await order.click();

    await say(page, 'Vă sun la 0722123456 când ajung.');
    await expect(page.getByText('0722123456')).toBeVisible();
    // Nicio mască pe firul comenzii: contactele sunt deja schimbate.
    await expect(page.getByText(/se afișează după confirmarea comenzii/)).toHaveCount(0);
  });

  test('istoria dinainte rămâne mascată, și după comandă', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje?cutie=comenzi');

    const order = page.getByRole('link', { name: /Comandă|SRL|—/ }).first();
    test.skip((await order.count()) === 0, 'Nicio comandă cu fir.');
    await order.click();

    const before = page.getByRole('link', { name: 'Discuția de dinainte de comandă' });
    test.skip((await before.count()) === 0, 'Comanda nu are discuție dinainte.');
    await before.click();

    await expect(page.getByText(/se afișează după confirmarea comenzii/)).toBeVisible();
  });
});

test.describe('șoferul', () => {
  test('vede firul comenzii lui și nimic altceva', async ({ page }) => {
    await signIn(page, DRIVER);
    await page.goto('/cont/mesaje');

    const rows = page.getByRole('listitem');
    const count = await rows.count();
    test.skip(count === 0, 'Șoferul nu are nicio comandă repartizată.');

    // Numai comenzi: nicio cerere, niciun traseu, nicio ofertă.
    await expect(page.getByText('Cerere')).toHaveCount(0);
    await expect(page.getByText('Traseu')).toHaveCount(0);
    await expect(page.getByText('Ofertă')).toHaveCount(0);
  });

  test('și poate scrie în el', async ({ page }) => {
    await signIn(page, DRIVER);
    await page.goto('/cont/mesaje');

    const first = page.getByRole('link', { name: /Comandă|SRL|—/ }).first();
    test.skip((await first.count()) === 0, 'Șoferul nu are nicio comandă repartizată.');
    await first.click();

    await say(page, 'Am plecat, ajung în două ore.');
    await expect(page.getByText('Am plecat, ajung în două ore.')).toBeVisible();
  });
});

test.describe('o imagine', () => {
  test('urcă, și un PDF nu', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    // Un PNG de un pixel, scris direct în input.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.setInputFiles('input[name="attachments"]', {
      name: 'poza.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(page.getByText('poza.png')).toBeVisible();

    await say(page, 'Uitați cum arată mașina.');
    await expect(page.getByText('Uitați cum arată mașina.')).toBeVisible();
    await expect(page.locator('article img').first()).toBeVisible();
  });

  test('iar un PDF este refuzat pe loc, cu o propoziție', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    await page.setInputFiles('input[name="attachments"]', {
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.getByText(/JPG, PNG, WebP sau HEIC|doar imagini/i).first()).toBeVisible();
  });
});

test.describe('sesizarea', () => {
  test('o parte sesizează un mesaj', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    const report = page.getByRole('button', { name: 'Sesizează mesajul' });
    test.skip((await report.count()) === 0, 'Firul nu are niciun mesaj de la celălalt.');
    await report.click();

    await expect(page.getByText(/singurul motiv pentru care o citim/)).toBeVisible();
    await page.getByRole('textbox').last().fill('Limbaj nepotrivit în mesaj.');
    await page.getByRole('button', { name: 'Trimite sesizarea' }).click();
    await expect(page.getByText('Am primit sesizarea. Ne uităm peste ea.')).toBeVisible();
  });

  test('și abia atunci echipa o poate deschide', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/conversatii');

    await expect(page.getByText(/Doar conversațiile sesizate/)).toBeVisible();

    const open = page.getByRole('link', { name: 'Deschide' }).first();
    test.skip((await open.count()) === 0, 'Nicio conversație sesizată.');
    await open.click();

    await page.getByRole('button', { name: 'Ascunde mesajul' }).first().click();
    await page.getByRole('textbox').last().fill('Limbaj injurios');
    await page.getByRole('button', { name: 'Ascunde mesajul' }).click();
    await expect(page.getByText('Mesajul a fost ascuns.')).toBeVisible();
  });

  test('sesizarea apare în /admin/sesizari, cu tipul „mesaj"', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/sesizari');
    await expect(page.getByText('Mesaj').first()).toBeVisible();
  });
});

test.describe('blocarea', () => {
  test('oprește conversațiile noi de pe anunțuri', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    await page.getByRole('button', { name: 'Blochează expeditorul' }).click();
    // Spune și ce **nu** oprește: firele comenzilor rămân deschise.
    await expect(page.getByText(/Firele comenzilor în curs rămân deschise/)).toBeVisible();

    await page.getByRole('button', { name: 'Blochează', exact: true }).click();
    await expect(page.getByText('Contul a fost blocat.')).toBeVisible();
  });

  test('și transportatorul blocat nu mai poate deschide una nouă', async ({ page }) => {
    await signIn(page, CARRIER);
    await page.goto('/cereri');

    const other = page.getByRole('link', { name: /Vezi cererea|Detalii/ }).nth(1);
    test.skip((await other.count()) === 0, 'Panoul nu are o a doua cerere.');
    await other.click();

    const send = page.getByRole('button', { name: 'Trimite mesaj' });
    test.skip((await send.count()) === 0, 'Cererea nu oferă „Trimite mesaj".');
    await send.click();
    await page.getByRole('button', { name: 'Trimite mesaj' }).click();

    // Refuzul vine din `guard_conversation_insert()`, cu propoziția lui.
    await expect(page.getByText('Nu poți trimite mesaje acestui cont')).toBeVisible();
  });

  test('deblocarea se face din același loc', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    const unblock = page.getByRole('button', { name: 'Deblochează' });
    test.skip((await unblock.count()) === 0, 'Nicio blocare pe firul ăsta.');
    await unblock.click();
    await expect(page.getByText('Blocarea a fost ridicată.')).toBeVisible();
  });
});

test.describe('moderarea anunțurilor', () => {
  test('echipa ascunde un anunț, cu motiv', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/anunturi');

    await expect(page.getByRole('heading', { name: 'Cereri și trasee' })).toBeVisible();

    const hide = page.getByRole('button', { name: 'Ascunde de pe panou' }).first();
    test.skip((await hide.count()) === 0, 'Niciun anunț vizibil de ascuns.');
    await hide.click();

    // Indicația care schimbă felul în care se scrie motivul.
    await expect(page.getByText(/Motivul îl vede și proprietarul/)).toBeVisible();
    await page.getByRole('textbox').last().fill('Fotografiile nu par ale vehiculului din anunț.');
    await page.getByRole('button', { name: 'Ascunde', exact: true }).click();
    await expect(page.getByText('Gata: nu mai apare pe panoul public.')).toBeVisible();
  });

  test('anunțul iese de pe panoul public', async ({ page }) => {
    await page.goto('/cereri');
    await expect(page.getByText('Fotografiile nu par ale vehiculului din anunț.')).toHaveCount(0);
  });

  test('dar proprietarul îl vede în cont, cu motivul', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/cereri');

    const notice = page.getByText('Scos de pe panou de echipa platformei');
    test.skip((await notice.count()) === 0, 'Clientul nu are niciun anunț ascuns.');

    await expect(notice.first()).toBeVisible();
    await expect(page.getByText('Fotografiile nu par ale vehiculului din anunț.')).toBeVisible();
    await expect(page.getByText(/Corectează ce este de corectat/)).toBeVisible();
  });

  test('și echipa îl repune', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/anunturi?ascunse=da');

    const restore = page.getByRole('button', { name: 'Repune pe panou' }).first();
    test.skip((await restore.count()) === 0, 'Niciun anunț ascuns.');
    await restore.click();
    await page.getByRole('textbox').last().fill('Fotografiile au fost înlocuite.');
    await page.getByRole('button', { name: 'Repune', exact: true }).click();
    await expect(page.getByText('Gata: apare din nou pe panoul public.')).toBeVisible();
  });

  test('exportul cere un interval și dă un CSV', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/anunturi');

    const submit = page.getByRole('button', { name: 'Descarcă CSV' });
    test.skip((await submit.count()) === 0, 'Ecranul nu oferă export.');

    const download = page.waitForEvent('download');
    await submit.click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });
});

test.describe('pe telefon', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('inboxul și firul încap, iar caseta rămâne jos', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/mesaje');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const open = page.getByRole('link', { name: /Transport|SRL|—/ }).first();
    test.skip((await open.count()) === 0, 'Clientul nu are nicio conversație.');
    await open.click();

    const threadOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(threadOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByPlaceholder('Scrie un mesaj…')).toBeVisible();
  });
});
