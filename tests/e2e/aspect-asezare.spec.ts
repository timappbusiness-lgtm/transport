import { expect, test, type Page } from '@playwright/test';
import { coveredByBar, inspectLayout, listProblems, markBars } from './layout-probe';
import { settled } from './settled';

/**
 * Every significant screen at 1440 and at 390, swept for the layout
 * defects that make an interface look broken.
 *
 * The desktop project measures at 1440, the mobile one at 390 — the two
 * widths the design is checked at. Each screen must have:
 *
 * - no sideways page scroll, and nothing reaching past the screen unless
 *   a container on the way up scrolls it on purpose;
 * - no text standing out of its box (long names, localities, numbers);
 * - no control under the minimum touch target (WCAG 2.5.8);
 * - no image drawn at another shape, no text drawn over text;
 * - no focused control hidden under a sticky or fixed bar, and the end of
 *   the page able to come out from under the bottom ones.
 *
 * The account and admin screens need a session the sandbox and CI do not
 * have, so their components are drawn on `/proba/ecrane` with sample data
 * (E2E_HARNESS=1, set by playwright.config.ts) inside the real shells.
 * Samples carry the long content on purpose: a long company name, a long
 * locality, a long document name, a long message, large numbers.
 */

const PUBLIC_SCREENS = [
  '/',
  '/cerere/noua',
  '/cereri',
  '/trasee',
  '/preturi',
  '/verificare',
  '/firme',
  '/abonamente',
  '/transportatori/inscriere',
  '/intrebari-frecvente',
  '/transport-auto',
  '/contact',
  '/inregistrare',
  '/inregistrare/persoana-fizica',
  '/inregistrare/firma',
  '/autentificare',
  '/resetare-parola',
  '/termeni',
  '/confidentialitate',
  '/cookies',
  '/proba/incarcari',
  '/pagina-care-nu-exista',
];

/** `/proba/ecrane?sectiune=…`: the account and admin components. */
export const HARNESS_SECTIONS = [
  'cereri',
  'cereri-mele',
  'trasee',
  'firme',
  'oferte',
  'mesaje',
  'acte',
  'comanda',
  'admin-acte',
  'abonamente',
  'evaluari',
  'cont-mobil',
  'dashboard',
];

const SCREENS = [
  ...PUBLIC_SCREENS,
  ...HARNESS_SECTIONS.map((section) => `/proba/ecrane?sectiune=${section}`),
];

async function atWidth(page: Page, project: string) {
  if (project === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await settled(page);
  await page.evaluate(() => document.fonts.ready);
}

test.describe('layout sweep', () => {
  for (const path of SCREENS) {
    test(`${path} holds its shape`, async ({ page }, testInfo) => {
      await atWidth(page, testInfo.project.name);
      await open(page, path);
      await markBars(page);
      const problems = await inspectLayout(page);
      expect(listProblems(problems), `${path} at ${page.viewportSize()?.width}px`).toEqual([]);
    });

    test(`${path}: nothing focused is hidden under a bar`, async ({ page }, testInfo) => {
      await atWidth(page, testInfo.project.name);
      await open(page, path);

      const hidden = new Set<string>();
      let first: string | null = null;
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press('Tab');
        const where = await page.evaluate(() => {
          const el = document.activeElement;
          return el === document.body ? null : el?.outerHTML.slice(0, 120) ?? null;
        });
        // Back at the start: every control has been visited.
        if (where !== null && where === first) break;
        first ??= where;
        const covered = await coveredByBar(page);
        if (covered !== null) hidden.add(covered);
      }
      expect([...hidden], `${path} at ${page.viewportSize()?.width}px`).toEqual([]);

      // The last thing on the page comes out from under the bottom bars.
      const under = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const leaves = Array.from(document.querySelectorAll('main *')).filter(
          (el) =>
            el.children.length === 0 &&
            (el.textContent ?? '').trim() !== '' &&
            el.getBoundingClientRect().height > 0,
        );
        const last = leaves.at(-1);
        if (!last) return null;
        const r = last.getBoundingClientRect();
        const top = document.elementFromPoint(
          Math.min(innerWidth - 1, r.left + r.width / 2),
          Math.min(innerHeight - 1, r.top + r.height / 2),
        );
        if (!top || last.contains(top) || top.contains(last)) return null;
        for (let bar: Element | null = top; bar && bar !== document.body; bar = bar.parentElement) {
          const position = getComputedStyle(bar).position;
          if (position === 'fixed' || position === 'sticky') {
            return `${(last.textContent ?? '').trim().slice(0, 40)} under ${String(bar.className).slice(0, 60)}`;
          }
        }
        return null;
      });
      expect(under, `${path}: the end of the page`).toBeNull();
    });
  }
});
