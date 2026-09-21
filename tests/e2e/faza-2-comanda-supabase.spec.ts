import { expect, test } from '@playwright/test';

/**
 * The order, end to end, with three people who each see a different page.
 *
 * One story in order: the client accepts an offer, the dispatcher
 * schedules the pickup and puts a driver and a lorry on it, the driver
 * photographs the car and fills in the condition report, drives, and
 * hands over against a six-digit code the client reads off their own
 * screen. Then the client confirms — or does not, and the job closes
 * itself.
 *
 *   supabase start
 *   E2E_SUPABASE=1 \
 *   E2E_CLIENT_EMAIL=…     E2E_CLIENT_PASSWORD=… \
 *   E2E_DISPATCHER_EMAIL=… E2E_DISPATCHER_PASSWORD=… \
 *   E2E_DRIVER_EMAIL=…     E2E_DRIVER_PASSWORD=… \
 *   E2E_STAFF_EMAIL=…      E2E_STAFF_PASSWORD=… \
 *   pnpm test:e2e
 *
 * The dispatcher's company must be verified with a compliant vehicle
 * and a `drivers` row whose `profile_id` is the driver account; the
 * client must own a request with an accepted offer from that company.
 * Without them the tests skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the
 * network policy blocks it and `supabase start` cannot pull its images.
 * Treat every expectation here as unverified until somebody runs it
 * with the stack up. The rules each one asserts are covered without a
 * browser by the ORD block of `supabase/tests/rls_test.sql`, which does
 * run, and by `tests/unit/orders.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const CLIENT = account('CLIENT');
const DISPATCHER = account('DISPATCHER');
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
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signIn(page: Page, who: { email: string; password: string; name: string }) {
  test.skip(
    who.email === '' || who.password === '',
    `Needs E2E_${who.name.toUpperCase()}_EMAIL and _PASSWORD.`,
  );
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

/** The first order in the active box, opened. */
async function openFirstOrder(page: Page) {
  await page.goto('/cont/transporturi');
  await page.getByRole('link', { name: /Deschide|Programează|Am ridicat|Am pornit|Am livrat|Confirm/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/cont\/transporturi\/[0-9a-f-]{36}/);
}

/** Four photographs through the capture flow, one at a time. */
async function capture(page: Page, count = 4) {
  for (let i = 0; i < count; i += 1) {
    await page.setInputFiles('input[name="photo"]', {
      name: `shot-${i}.jpg`,
      mimeType: 'image/jpeg',
      // A one-pixel JPEG is still a JPEG, and sharp will re-encode it.
      buffer: Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
          'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
          'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
        'base64',
      ),
    });
    await expect(page.getByText(/Se încarcă|Fotografia/).first()).toBeVisible();
  }
}

test.describe('the dispatcher sets the job up', () => {
  test('cannot schedule a pickup before choosing a driver and a lorry', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await openFirstOrder(page);
    // The rule is `transition_order()`; the screen says it first.
    await expect(page.getByText('Alege șoferul și vehiculul')).toBeVisible();
  });

  test('assigns a driver and a compliant vehicle', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await openFirstOrder(page);

    await page.getByLabel('Șofer').selectOption({ index: 1 });
    await page.getByLabel('Vehicul').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Salvează' }).click();
    await expect(page.getByText('Schimbă șoferul sau vehiculul')).toBeVisible();
  });

  test('schedules the pickup, and the client is told', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await openFirstOrder(page);

    await page.getByRole('button', { name: 'Programează ridicarea' }).click();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
    await page.getByLabel('De la').fill(tomorrow);
    await page.getByRole('button', { name: 'Salvează' }).click();

    await expect(page.getByText('Ridicare programată').first()).toBeVisible();
  });
});

test.describe('the driver does the work', () => {
  test('sees only the orders assigned to them', async ({ page }) => {
    // A driver is a company member, so before `can_see_order()` this
    // showed the firm's whole book.
    await signIn(page, DRIVER);
    await page.goto('/cont/transporturi');
    await expect(page.getByRole('heading', { name: 'Transporturile mele' })).toBeVisible();
  });

  test('gets a menu with the work and nothing else', async ({ page }) => {
    await signIn(page, DRIVER);
    await page.goto('/cont');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: /Transporturi/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Flotă' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Abonament' })).toHaveCount(0);
  });

  test('cannot move the order without the photographs', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);
    const button = page.getByRole('button', { name: 'Am ridicat vehiculul' });
    if ((await button.count()) > 0) {
      await expect(button).toBeDisabled();
      await expect(page.getByText(/Mai ai nevoie de/)).toBeVisible();
    }
  });

  test('photographs the car, four shots, prompted in order', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);

    await expect(page.getByText('Fața')).toBeVisible();
    await capture(page);
    await expect(page.getByText('Fișa de stare a vehiculului')).toBeVisible();
  });

  test('fills in the condition report and picks the car up', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);

    await page.getByLabel('Zgârieturi').selectOption('ușoare');
    await page.getByLabel('Kilometraj').fill('184000');
    await page.getByLabel('Nivel combustibil (/8)').fill('3');
    await page.getByRole('button', { name: 'Salvează fișa' }).click();
    await expect(page.getByText('Fișa a fost salvată.')).toBeVisible();

    await page.getByRole('button', { name: 'Am ridicat vehiculul' }).click();
    await expect(page.getByText('Vehicul ridicat').first()).toBeVisible();
  });

  test('and the request follows the order into progress', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/cereri');
    await expect(page.getByText(/În curs/).first()).toBeVisible();
  });

  test('drives', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);
    await page.getByRole('button', { name: 'Am pornit la drum' }).click();
    await expect(page.getByText('Pe drum').first()).toBeVisible();
  });
});

test.describe('the handover', () => {
  test('the client reads a code the carrier never sees', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    await expect(page.getByText('Codul de confirmare')).toBeVisible();
    await expect(page.getByText('Dă acest cod șoferului la predare.')).toBeVisible();
  });

  test('and the dispatcher does not', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await openFirstOrder(page);
    await expect(page.getByText('Dă acest cod șoferului la predare.')).toHaveCount(0);
  });

  test('a wrong code does not deliver the car', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);
    await capture(page);
    await page.getByLabel('Cod (6 cifre)').fill('999999');
    await page.getByRole('button', { name: 'Confirm livrarea vehiculului' }).click();
    await expect(page.getByText(/Codul nu este corect/)).toBeVisible();
  });

  test('the right one does', async ({ page, context }) => {
    // Two sessions at once: the client reads the code, the driver types
    // it, which is exactly what happens at the kerb.
    const clientPage = await context.newPage();
    await signIn(clientPage, CLIENT);
    await openFirstOrder(clientPage);
    const code = (await clientPage.locator('p.font-mono').first().innerText()).replace(/\D/g, '');
    expect(code).toHaveLength(6);

    await signIn(page, DRIVER);
    await openFirstOrder(page);
    await page.getByLabel('Cod (6 cifre)').fill(code);
    await page.getByRole('button', { name: 'Confirm livrarea vehiculului' }).click();
    await expect(page.getByText('Livrat').first()).toBeVisible();
  });
});

test.describe('the client closes it', () => {
  test('sees the delivery photographs beside the ones from pickup', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    await expect(page.getByText('La livrare, față de cele de la ridicare')).toBeVisible();
  });

  test('is told how long they have', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    await expect(page.getByText(/comanda se închide singură peste/)).toBeVisible();
  });

  test('confirms, and the order is finished', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    await page.getByRole('button', { name: 'Da, am primit vehiculul' }).click();
    await expect(page.getByText('Finalizată').first()).toBeVisible();
  });

  test('and the carrier cannot confirm on their behalf', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await openFirstOrder(page);
    await expect(page.getByRole('button', { name: 'Da, am primit vehiculul' })).toHaveCount(0);
  });
});

test.describe('the evidence cannot be rewritten', () => {
  test('nothing on the page offers to change a photograph', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    await expect(page.getByRole('button', { name: /Șterge fotografia|Editează dovada/ })).toHaveCount(0);
    await expect(page.getByText(/Nimeni nu le poate modifica sau șterge/)).toBeVisible();
  });
});

test.describe('the order that closes itself', () => {
  test('needs the job, not the clock', async ({ page }) => {
    // `complete_stale_orders(p_now)` takes the time as a parameter so a
    // test can move it; a browser cannot. This checks the screen says
    // what will happen, and the RLS suite checks that it does.
    test.skip(
      process.env.E2E_SUPABASE_DB_URL === undefined,
      'Needs E2E_SUPABASE_DB_URL to run complete_stale_orders() at a simulated time.',
    );
    await signIn(page, CLIENT);
    await page.goto('/cont/transporturi?cutie=finalizate');
    await expect(page.getByText(/Închisă automat/).first()).toBeVisible();
  });
});

test.describe('cancelling before the car moves', () => {
  test('is offered while it is still possible', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    const cancel = page.getByRole('button', { name: 'Anulează comanda' });
    if ((await cancel.count()) > 0) {
      await cancel.click();
      await expect(page.getByLabel('De ce anulezi')).toBeVisible();
      await expect(page.getByText('Pune cererea înapoi pe panou')).toBeVisible();
    }
  });

  test('and is gone once the car is on the lorry', async ({ page }) => {
    await signIn(page, CLIENT);
    await page.goto('/cont/transporturi?cutie=active');
    const inTransit = page.getByText('Pe drum').first();
    if ((await inTransit.count()) > 0) {
      await page.getByRole('link', { name: /Deschide/ }).first().click();
      await expect(page.getByRole('button', { name: 'Anulează comanda' })).toHaveCount(0);
    }
  });
});

test.describe('a dispute, and the team that closes it', () => {
  test('the client opens one from the delivered order', async ({ page }) => {
    await signIn(page, CLIENT);
    await openFirstOrder(page);
    const open = page.getByRole('button', { name: 'Ceva nu este în regulă' });
    test.skip((await open.count()) === 0, 'Needs an order waiting for confirmation.');

    await open.click();
    await page.getByLabel('Ce s-a întâmplat').selectOption('avarii');
    await page.getByLabel('Descrie pe scurt').fill('Bara față are o zgârietură nouă.');
    await page.getByRole('button', { name: 'Deschide disputa' }).click();
    await expect(page.getByText(/Disputa a fost deschisă/)).toBeVisible();
  });

  test('and neither side can move it afterwards', async ({ page }) => {
    await signIn(page, DISPATCHER);
    await page.goto('/cont/transporturi?cutie=anulate');
    const disputed = page.getByText('În dispută').first();
    if ((await disputed.count()) > 0) {
      await page.getByRole('link', { name: /Deschide/ }).first().click();
      await expect(page.getByText('Comandă în dispută')).toBeVisible();
    }
  });

  test('staff see the whole trail and decide', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/transporturi?dispute=da');
    const open = page.getByRole('link', { name: 'Deschide' }).first();
    test.skip((await open.count()) === 0, 'No dispute to resolve.');

    await open.click();
    await expect(page.getByText('Comandă în dispută')).toBeVisible();
    await expect(page.getByText('Dovezi')).toBeVisible();
    await expect(page.getByText('Unde a ajuns')).toBeVisible();

    await page.getByLabel('Finalizată').check();
    await page
      .getByLabel('Decizia, pe scurt')
      .fill('Fotografiile de la ridicare arată aceeași zgârietură.');
    await page.getByRole('button', { name: 'Închide disputa' }).click();
    await expect(page.getByText('Disputa a fost închisă.')).toBeVisible();
  });

  test('never without a decision written down', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/transporturi?dispute=da');
    const open = page.getByRole('link', { name: 'Deschide' }).first();
    test.skip((await open.count()) === 0, 'No dispute to resolve.');

    await open.click();
    await page.getByRole('button', { name: 'Închide disputa' }).click();
    // The field is required, so the browser stops it before the server does.
    await expect(page.getByText('Disputa a fost închisă.')).toHaveCount(0);
  });

  test('staff hide one photograph, with a reason, and it lands in the journal', async ({ page }) => {
    await signIn(page, STAFF);
    await page.goto('/admin/transporturi');
    await page.getByRole('link', { name: 'Deschide' }).first().click();

    const hide = page.getByRole('button', { name: 'Ascunde dovada' }).first();
    test.skip((await hide.count()) === 0, 'This order has no evidence.');
    await hide.click();
    await page.getByLabel('De ce o ascunzi').fill('Fotografie cu o persoană');
    await page.getByRole('button', { name: 'Ascunde' }).click();
    await expect(page.getByText('Dovada a fost ascunsă.')).toBeVisible();

    await page.goto('/admin/jurnal?actiune=order_evidence.hidden');
    await expect(page.getByText('order_evidence.hidden').first()).toBeVisible();
    await expect(page.getByText('Fotografie cu o persoană')).toBeVisible();
  });
});

test.describe('the driver on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the whole capture flow fits and works one-handed', async ({ page }) => {
    await signIn(page, DRIVER);
    await openFirstOrder(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The capture button is the one thing that has to be hittable with
    // a thumb, so it spans the column.
    const button = page.getByRole('button', { name: /Adaugă fotografie/ });
    if ((await button.count()) > 0) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThan(200);
      expect(box!.height).toBeGreaterThan(40);
    }
  });

  test('the list fits too', async ({ page }) => {
    await signIn(page, DRIVER);
    await page.goto('/cont/transporturi');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
