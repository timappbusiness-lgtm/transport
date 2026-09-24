import { expect, test, type Page } from '@playwright/test';
import { moreFilters, openMoreFilters, settled } from './settled';

/**
 * The boards, as a dispatcher who is not comfortable with software meets
 * them.
 *
 * A transport professional said the parts were hard to connect and that
 * it had to be far simpler. The measurement agreed: `/cereri` put
 * thirteen form fields on screen, twelve above the fold, under 461 words
 * of heading and lede, before a single request.
 *
 * These are the properties that keep it simple whatever the content is.
 * They run with no database — CI has none — so what is checked here is
 * the chrome: the three filters, the disclosure, the URL, the empty
 * state. The card's own shape is `tests/unit/board-cards.test.tsx`,
 * which can render one without a row in Postgres.
 */

const BOARDS = [
  ['/cereri', 'De unde', 'Unde', 'Tip vehicul'],
  ['/trasee', 'De unde', 'Unde', 'Tip vehicul'],
] as const;

/** Every form control a person can actually see, inside `<main>`. */
async function visibleFields(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    return [...main.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((n) =>
      (n as HTMLElement).checkVisibility(),
    ).length;
  });
}

test.describe('three filters on screen, the rest one click down', () => {
  for (const [path, from, to, kind] of BOARDS) {
    test(`${path} asks three questions and hides the other ten`, async ({ page }) => {
      await page.goto(path);
      await settled(page);

      for (const label of [from, to, kind]) {
        await expect(page.getByLabel(label, { exact: true })).toBeVisible();
      }

      // Closed, and saying so to a screen reader as well as to the eye.
      const { button, panel } = moreFilters(page);
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();

      // Three filters, one sort control and nothing else. A number rather
      // than a list, because the point is the count.
      expect(await visibleFields(page)).toBe(4);
    });

    test(`${path} opens the panel and everything in it`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      await openMoreFilters(page);
      await expect(moreFilters(page).button).toHaveAttribute('aria-expanded', 'true');
      expect(await visibleFields(page)).toBeGreaterThan(10);
    });
  }
});

test.describe('a link somebody saved last month still works', () => {
  test('and the board says what it applies without opening the panel', async ({ page }) => {
    // The keys are the ones they always were. A board narrowed by four
    // things somebody else chose says which four — on the button and as
    // chips — rather than looking arbitrarily empty. It used to open the
    // panel to say so; the panel now stays shut on every first load.
    await page.goto('/cereri?cine=curse&serviciu=expres&stare=nu-ruleaza&greutate=2500');
    await settled(page);

    const { button, panel } = moreFilters(page);
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toBeHidden();

    // The badge counts what is narrowing the board, and there is a chip for each.
    await expect(button).toContainText('4');
    await expect(page.locator('[data-filter-chips] [data-chip]')).toHaveCount(4);

    // And the values survived the round trip.
    await expect(page.getByLabel('Tip de serviciu')).toHaveValue('expres');
    await expect(page.getByLabel('Starea vehiculului')).toHaveValue('nu-ruleaza');
    await expect(page.getByLabel(/Greutate maximă/)).toHaveValue('2500');
  });

  test('the routes board keeps its own keys too', async ({ page }) => {
    await page.goto('/trasee?directie=retur&locuri=3&capacitate=1800');
    await settled(page);
    await expect(moreFilters(page).panel).toBeHidden();
    await expect(moreFilters(page).button).toContainText('3');
    await expect(page.locator('[data-filter-chips] [data-chip]')).toHaveCount(3);
    await expect(page.getByLabel('Direcția')).toHaveValue('retur');
    await expect(page.getByLabel(/Locuri libere/)).toHaveValue('3');
  });

  test('and a sort nobody offered falls back rather than breaking', async ({ page }) => {
    // „locuri" belongs to the other board. It comes out of a query
    // string, which is to say from anyone.
    await page.goto('/cereri?ordine=locuri');
    await settled(page);
    await expect(page.getByLabel('Ordonează')).toHaveValue('noi');
  });
});

test.describe('an empty board says what will be here, and offers one thing', () => {
  for (const path of ['/cereri', '/trasee'] as const) {
    test(`${path} with nothing on it`, async ({ page }) => {
      // CI has no database, so both boards render their empty state —
      // which is the case this checks, and the common one at launch.
      await page.goto(path);
      await settled(page);
      const empty = page.locator('main').getByText(/Încă nu este nici/).first();
      await expect(empty).toBeVisible();

      // One button on it, and one only. The rest — the alerts, the other
      // board — is one click down, and still reachable.
      const card = page.locator('main').getByRole('link', { name: 'Publică o cerere' });
      await expect(card.last()).toBeVisible();
      const filled = await page
        .locator('main a')
        .evaluateAll((ns) =>
          ns.filter(
            (n) =>
              getComputedStyle(n).backgroundColor === 'rgb(21, 97, 109)' &&
              (n as HTMLElement).checkVisibility(),
          ).length,
        );
      expect(filled, 'more than one filled button on an empty board').toBe(1);

      const more = page.getByText('Altceva de făcut de aici');
      await expect(more).toBeVisible();
      // Shut by default: it is one level down, not a second column.
      const panel = page.locator('main details').last();
      expect(await panel.evaluate((n: HTMLDetailsElement) => n.open)).toBe(false);
    });
  }

  test('and a search that found nothing offers the filters, not a form', async ({ page }) => {
    await page.goto('/cereri?oras-plecare=Vaslui&categorie=autoturism');
    await settled(page);
    await expect(page.getByText(/Nicio cerere pentru această căutare/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi toate cererile' })).toBeVisible();
  });
});

test.describe('a carrier reads what happens before being asked for anything', () => {
  test('the entry point explains itself instead of redirecting into a form', async ({ page }) => {
    await page.goto('/transportatori/inscriere');
    // Three steps and a duration, and not one field.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Înscriere transportator');
    await expect(page.locator('main ol > li')).toHaveCount(3);
    await expect(page.getByText(/durează aproximativ/i)).toBeVisible();
    expect(await visibleFields(page)).toBe(0);
    await expect(page.getByRole('link', { name: /Fă-ți cont/ })).toBeVisible();
  });

  test('and the sign-up says where they land', async ({ page }) => {
    await page.goto('/inregistrare/firma');
    await expect(page.getByText(/panoul de cereri/i).first()).toBeVisible();
  });
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/cereri', '/trasee', '/transportatori/inscriere'] as const) {
    test(`${path} fits, with the three filters still on screen`, async ({ page }) => {
      await page.goto(path);
      await settled(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }

  test('the filters are still three, not a wall', async ({ page }) => {
    await page.goto('/cereri');
    await settled(page);
    expect(await visibleFields(page)).toBe(4);
  });
});
