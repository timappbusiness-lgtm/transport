import { expect, test, type Page } from '@playwright/test';

/**
 * The fast way in, the part a browser can walk without a database.
 *
 * A carrier's sign-up asks four things and nothing about the firm; the
 * board is where it lands, with a calm line about the e-mail; the client's
 * last step asks nothing the account form asks a click later; the
 * documents screen, reached signed out, sends to sign-in and back. The
 * rest of both journeys — the account, the firm, the documents, staff,
 * the offer — is in inscriere-rapida-supabase.spec.ts.
 */

const FUTURE = '2031-06-30';

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** The controls a person sees in the form: one per radio group, none inside a closed box. */
async function visibleFields(page: Page): Promise<string[]> {
  return page.locator('form').first().evaluate((form) => {
    const groups = new Set<string>();
    const out: string[] = [];
    for (const el of form.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      if (['hidden', 'submit', 'button', 'file'].includes(el.type)) continue;
      if (el.closest('details:not([open])')) continue;
      if (el.type === 'radio') {
        if (groups.has(el.name)) continue;
        groups.add(el.name);
      }
      out.push(el.name || el.id);
    }
    return out;
  });
}

test.describe('a carrier signs up', () => {
  test('four fields and the terms, nothing about the firm yet', async ({ page }) => {
    await page.goto('/inregistrare/firma');
    await expect(page.getByText('Sub un minut')).toBeVisible();
    await expect(page.getByLabel('Nume și prenume')).toBeVisible();
    await expect(page.getByLabel('Adresă de e-mail de serviciu')).toBeVisible();
    await expect(page.getByLabel('Telefon')).toBeVisible();
    await expect(page.getByLabel('Parolă')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeVisible();
    // No CUI, no firm name, no documents on this screen.
    await expect(page.getByLabel(/CUI/)).toHaveCount(0);
    await expect(page.getByText(/Intri direct pe panoul de cereri/)).toBeVisible();
    const fields = (await visibleFields(page)).filter((name) => name !== 'terms');
    expect(fields).toEqual(['fullName', 'email', 'phone', 'password']);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('lands on the board, which says where the confirmation link went', async ({ page }) => {
    await page.goto('/cereri?confirma=mihai%40transport.example.com');
    const banner = page.locator('[data-confirm-email]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('mihai@transport.example.com');
    // Browsing needs nothing: the board is there under the line.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('the documents screen, reached signed out, signs in and comes back to the same place', async ({ page }) => {
    await page.goto('/cont/firma/documente?pentru=oferta');
    await expect(page).toHaveURL(/\/autentificare\?next=/);
    const next = new URL(page.url()).searchParams.get('next');
    expect(next).toBe('/cont/firma/documente?pentru=oferta');
  });

  test('an old link to one document lands on the one screen for all of them', async ({ page }) => {
    await page.goto('/cont/firma/documente/licenta_comunitara');
    await expect(page).toHaveURL(/\/autentificare\?next=%2Fcont%2Ffirma%2Fdocumente/);
  });
});

test.describe('a client publishes', () => {
  test('only what publishing needs is on screen; nothing is asked twice', async ({ page }) => {
    await page.goto('/cerere/noua');
    const first = await visibleFields(page);
    // Countries (already România), the two towns and the day. The window
    // is one click away.
    expect(first).toHaveLength(5);
    await expect(page.locator('[data-optional="interval"]')).not.toHaveAttribute('open', '');

    await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
    await page.keyboard.press('Escape');
    await page.getByLabel('Oraș de destinație').fill('București');
    await page.keyboard.press('Escape');
    await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await page.getByRole('button', { name: 'Continuă' }).click();

    await expect(page.getByLabel('Marca')).toBeVisible();
    // The category, the import link, make, model, year and whether it runs;
    // the rest is summed up on the closed box's own line.
    expect(await visibleFields(page)).toHaveLength(6);
    await expect(page.locator('[data-optional="masina"] > summary')).toContainText('roțile se învârt, direcția merge, are cheile, fără avarii');
    await page.getByLabel('Marca').fill('Dacia');
    await page.getByLabel('Modelul').fill('Logan');
    await page.getByLabel('Anul fabricației').fill('2016');
    await page.getByRole('button', { name: 'Continuă' }).click();
    await page.getByRole('button', { name: 'Continuă' }).click();

    // The last step, signed out: the account is next, and it asks the name,
    // the number and the address — so this step does not.
    await expect(page.locator('[data-account-step="needed"]')).toBeVisible();
    await expect(page.locator('[data-contact-from-account]')).toBeVisible();
    expect(await visibleFields(page)).toEqual([]);
    await expect(page.getByLabel('Telefon')).toHaveCount(0);
    await expect(page.getByLabel('Numele tău')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('a box with something in it opens by itself, and says what it holds', async ({ page }) => {
    await page.goto('/cerere/noua');
    await page.getByLabel('Oraș de plecare').fill('Cluj-Napoca');
    await page.keyboard.press('Escape');
    await page.getByLabel('Oraș de destinație').fill('București');
    await page.keyboard.press('Escape');
    await page.getByLabel('Poate fi încărcat de la').fill(FUTURE);
    await page.getByRole('button', { name: 'Continuă' }).click();

    await page.locator('[data-optional="masina"] > summary').click();
    await page.getByLabel('Are avarii').check();
    await page.getByLabel('Ce este avariat').fill('Bara din față și farul stâng.');
    await page.reload();
    // Reloaded with an answer that is not the usual one: open, and the
    // line on it says so.
    await expect(page.getByLabel('Ce este avariat')).toBeVisible();
    await expect(page.locator('[data-optional="masina"] > summary')).toContainText('are avarii');
  });
});
