import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The header and the request board, per kind of account.
 *
 * A carrier and a client want opposite things, so the bar shows each the
 * pages they actually use — the board first for a carrier — and the
 * primary action is what that role publishes. Signed-in states need a
 * session, which neither CI nor the sandbox has; the harness draws the
 * real header and board from a context written out in
 * `src/components/proba/header-sections.tsx`. The same checks against
 * real accounts, with sign-in and where it lands, are in
 * `antet-cont-supabase.spec.ts`.
 */

type Role = 'transportator' | 'expeditor' | 'persoana' | 'sofer' | 'staff';

const EXPECTED: Record<Role, { bar: string[]; publish: string | null }> = {
  transportator: {
    bar: ['Cereri de transport', 'Traseele mele', 'Oferte trimise', 'Transporturi', 'Mesaje'],
    publish: 'Publică un traseu',
  },
  expeditor: {
    bar: ['Cursele mele', 'Oferte primite', 'Trasee disponibile', 'Transporturi', 'Mesaje'],
    publish: 'Publică o cerere',
  },
  persoana: {
    bar: ['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile'],
    publish: 'Publică o cerere',
  },
  sofer: { bar: ['Transporturile mele'], publish: null },
  // Staff keep the bar of their own account, and /admin in the menu.
  staff: {
    bar: ['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile'],
    publish: 'Publică o cerere',
  },
};

async function mount(page: Page, role: Role, fresh = 12) {
  await page.goto(`/proba/ecrane?sectiune=antet&rol=${role}&noi=${fresh}`);
  await page.evaluate(() => document.fonts.ready);
}

function header(page: Page): Locator {
  return page.locator('[data-proba-antet] header');
}

/** The bar's entries, without their badges, in the order read. */
async function barLabels(page: Page): Promise<string[]> {
  return header(page)
    .getByRole('navigation', { name: 'Navigare' })
    .locator('a')
    .evaluateAll((links) => links.map((link) => link.firstChild?.textContent?.trim() ?? ''));
}

/**
 * Opens a menu by its button, repeating the press until it is open: a
 * press that lands before React has attached does nothing.
 */
async function open(button: Locator, menu: Locator) {
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await expect(menu).toBeVisible({ timeout: 500 });
  }).toPass();
}

async function openAccountMenu(page: Page): Promise<Locator> {
  const menu = header(page).getByRole('menu', { name: 'Meniul contului' });
  await open(header(page).locator('[data-account-chevron]'), menu);
  return menu;
}

test.describe('the bar, per kind of account, on a wide screen', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const [role, { bar, publish }] of Object.entries(EXPECTED) as [
    Role,
    (typeof EXPECTED)[Role],
  ][]) {
    test(`${role}: the entries, in order, and the primary action`, async ({ page }) => {
      await mount(page, role);
      await expect(header(page).getByRole('navigation', { name: 'Navigare' })).toBeVisible();
      expect(await barLabels(page)).toEqual(bar);

      const button = header(page).locator('[data-publish]');
      if (publish === null) {
        await expect(button).toHaveCount(0);
      } else {
        await expect(button).toBeVisible();
        await expect(button).toHaveText(new RegExp(publish));
      }

      // Signed in, the shop window is in the account menu, not the bar.
      expect(bar).not.toContain('Firme');
      const menu = await openAccountMenu(page);
      for (const name of ['Firme', 'Abonamente', 'Cum funcționează']) {
        await expect(menu.getByRole('menuitem', { name })).toHaveCount(1);
      }
      // Nothing in the bar is repeated in the menu.
      const inMenu = await menu.getByRole('menuitem').allInnerTexts();
      for (const entry of bar) {
        expect(inMenu.map((text) => text.split('\n')[0]?.trim())).not.toContain(entry);
      }
    });
  }

  test('staff: /admin is in the account menu, and only for staff', async ({ page }) => {
    await mount(page, 'staff');
    const menu = await openAccountMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Administrare' })).toHaveAttribute('href', '/admin');

    await mount(page, 'persoana');
    const theirs = await openAccountMenu(page);
    await expect(theirs.getByRole('menuitem', { name: 'Administrare' })).toHaveCount(0);
  });
});

test.describe('a carrier', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('publishes a route first, and a request second, from the button', async ({ page }) => {
    await mount(page, 'transportator');
    const button = header(page).locator('[data-publish]');
    const menu = header(page).getByRole('menu', { name: 'Ce vrei să publici' });
    await open(button, menu);

    const items = menu.getByRole('menuitem');
    await expect(items).toHaveText(['Traseu pe tur', 'Traseu pe retur', 'Publică o cerere']);
    await expect(items.nth(0)).toHaveAttribute('href', '/cont/trasee/nou?directie=tur');
    await expect(items.nth(1)).toHaveAttribute('href', '/cont/trasee/nou?directie=retur');
    // Available, not first: last, below a rule, and marked as the quiet one.
    await expect(items.nth(2)).toHaveAttribute('href', '/cerere/noua');
    await expect(items.nth(2)).toHaveAttribute('data-secondary', 'true');
    await expect(items.nth(0)).not.toHaveAttribute('data-secondary', 'true');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('reaches Firme, Abonamente and „Publică o cerere" from the account menu', async ({ page }) => {
    await mount(page, 'transportator');
    let menu = await openAccountMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Abonamente' })).toHaveAttribute('href', '/abonamente');
    await expect(menu.getByRole('menuitem', { name: 'Trasee disponibile' })).toHaveAttribute('href', '/trasee');
    await menu.getByRole('menuitem', { name: 'Publică o cerere' }).click();
    await expect(page).toHaveURL(/\/cerere\/noua/);

    await mount(page, 'transportator');
    menu = await openAccountMenu(page);
    await menu.getByRole('menuitem', { name: 'Firme' }).click();
    await expect(page).toHaveURL(/\/firme$/);
  });

  test('sees the new requests on the board entry, and nothing at zero', async ({ page }) => {
    await mount(page, 'transportator', 12);
    const board = header(page).getByRole('link', { name: /Cereri de transport/ });
    await expect(board).toHaveAttribute('href', '/cereri');
    // Capped at 9+ in the bar; the board itself says the exact number.
    // A screen reader hears „9+ noi", not „care așteaptă".
    await expect(board.locator('[data-badge]')).toHaveText('9+ noi');
    await expect(board).toHaveAccessibleName('Cereri de transport 9+ noi');

    await mount(page, 'transportator', 3);
    await expect(header(page).getByRole('link', { name: /Cereri de transport/ }).locator('[data-badge]')).toHaveText('3 noi');

    await mount(page, 'transportator', 0);
    await expect(header(page).getByRole('link', { name: /Cereri de transport/ }).locator('[data-badge]')).toHaveCount(0);
  });

  test('the board entry is the current page on the board', async ({ page }) => {
    await page.goto('/proba/ecrane?sectiune=antet&rol=transportator&noi=0&pagina=/cereri');
    await expect(header(page).locator('a[aria-current="page"]')).toHaveText('Cereri de transport');
  });
});

test.describe('the board as a carrier sees it', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('opens on their view, with „Toate cererile" one click away', async ({ page }) => {
    await page.goto('/proba/ecrane?sectiune=cereri-transportator&noi=12');
    const view = page.getByRole('navigation', { name: 'Ce cereri vezi' });
    const mine = view.getByRole('link', { name: 'Potrivite cu firma mea' });
    const all = view.getByRole('link', { name: 'Toate cererile' });
    await expect(mine).toHaveAttribute('aria-current', 'page');
    await expect(all).not.toHaveAttribute('aria-current', 'page');

    await all.click();
    await expect(page).toHaveURL(/doar=toate/);
    await expect(view.getByRole('link', { name: 'Toate cererile' })).toHaveAttribute('aria-current', 'page');
  });

  test('says how many requests are new since the last visit, and nothing at zero', async ({ page }) => {
    await page.goto('/proba/ecrane?sectiune=cereri-transportator&noi=12');
    await expect(page.locator('[data-board-news]')).toHaveText('12 cereri noi de la ultima vizită');

    await page.goto('/proba/ecrane?sectiune=cereri-transportator&noi=1');
    await expect(page.locator('[data-board-news]')).toHaveText('O cerere nouă de la ultima vizită');

    await page.goto('/proba/ecrane?sectiune=cereri-transportator&noi=0');
    await expect(page.getByRole('navigation', { name: 'Ce cereri vezi' })).toBeVisible();
    await expect(page.locator('[data-board-news]')).toHaveCount(0);
  });

  test('gives every card one primary action, „Trimite ofertă"', async ({ page }) => {
    await page.goto('/proba/ecrane?sectiune=cereri-transportator&noi=0');
    const cards = page.locator('section[aria-label="Cereri de transport"] > ul > li');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i += 1) {
      await expect(cards.nth(i).getByRole('link', { name: 'Trimite ofertă' })).toHaveCount(1);
    }
    // A verified firm goes to the offer form on the request.
    await expect(cards.nth(0).getByRole('link', { name: 'Trimite ofertă' })).toHaveAttribute(
      'href',
      /^\/cereri\/[^/?#]+#oferta$/,
    );
    // A firm whose documents are missing goes to the gate, and back.
    await expect(cards.nth(1).getByRole('link', { name: 'Trimite ofertă' })).toHaveAttribute(
      'href',
      /^\/cont\/firma\/documente\?pentru=oferta&next=%2Fcereri%2F/,
    );
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a carrier: „Traseu nou", the work behind „Meniu" with a dot for what is new', async ({ page }) => {
    await mount(page, 'transportator', 12);
    await expect(header(page).locator('[data-publish]')).toHaveText(/Traseu nou/);
    const toggle = header(page).locator('[data-nav-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle.locator('[data-nav-dot]')).toHaveCount(1);

    const nav = header(page).getByRole('navigation', { name: 'Navigare' });
    await open(toggle, nav);
    expect(await barLabels(page)).toEqual(EXPECTED.transportator.bar);
    for (const link of await nav.locator('a').all()) {
      const box = await link.boundingBox();
      if (!box) throw new Error('no box');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(1);
  });

  test('a carrier reaches Firme and „Publică o cerere" from the account menu', async ({ page }) => {
    await mount(page, 'transportator');
    const menu = await openAccountMenu(page);
    const firme = menu.getByRole('menuitem', { name: 'Firme' });
    await firme.scrollIntoViewIfNeeded();
    await expect(firme).toBeInViewport();
    await expect(menu.getByRole('menuitem', { name: 'Publică o cerere' })).toBeVisible();
  });

  test('a client: „Cerere nouă", straight to the form', async ({ page }) => {
    await mount(page, 'persoana');
    const button = header(page).locator('[data-publish]');
    await expect(button).toHaveText(/Cerere nouă/);
    await expect(button).toHaveAttribute('href', '/cerere/noua');
  });

  test('a driver: the one entry in the bar, no „Meniu" and no button', async ({ page }) => {
    await mount(page, 'sofer');
    await expect(header(page).locator('[data-nav-toggle]')).toHaveCount(0);
    await expect(header(page).getByRole('link', { name: 'Transporturile mele' })).toBeVisible();
    await expect(header(page).locator('[data-publish]')).toHaveCount(0);
  });
});

test.describe('the landing after sign-in', () => {
  test('with nobody signed in, it is the sign-in page', async ({ page }) => {
    await page.goto('/intrare');
    await expect(page).toHaveURL(/\/autentificare$/);
  });
});
