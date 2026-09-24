import { expect, test, type Page } from '@playwright/test';

/**
 * Long content, on the screens where it appears, at 1440 and at 390.
 *
 * The samples on `/proba/ecrane` (`src/components/proba/fixtures.ts`) are
 * the longest a real record can be: a 93-character firm name with a
 * 30-letter run and no spaces, localities of 49 characters, a person's
 * double-barrelled name, a 120-character reference with no break at all,
 * a 159-character link, 1.250.000 lei, 40.000 kg. Each one was, on at
 * least one of these screens, pushing a phone sideways or standing out of
 * its card before the fixes this file guards. The strings are repeated
 * here rather than imported: Playwright cannot load the fixtures' app
 * imports.
 */

const LONG = {
  company: 'SC EUROTRANSAUTOLOGISTICCARPATICA',
  hyphenCompany: 'SC-TRANSPORTURI-INTERNATIONALE',
  cooperative: 'SOCIETATEA COOPERATIVĂ',
  from: 'Sânmartinu de Câmpie',
  to: 'Glodeanu-Siliștea',
  person: 'Maria-Alexandra Constantinescu-Dumitrescu',
  token: 'CMRSANMARTINU',
  url: 'exemplu.ro/dosare',
  price: '1.250.000',
  weight: '40.000 kg',
  distance: '4.850 km',
  document: 'Licență comunitară',
  reason: 'Motivul:',
};

/** What each screen carries, and so what it has to hold. */
const SCREENS: { section: string; what: string; texts: string[] }[] = [
  { section: 'cereri', what: 'long localities, large numbers', texts: [LONG.from, LONG.to, LONG.weight, LONG.distance] },
  { section: 'cereri-mele', what: 'a long hidden reason, long localities', texts: [LONG.from, LONG.to, LONG.token, LONG.reason] },
  { section: 'trasee', what: 'long localities, a large price', texts: [LONG.from, LONG.to, LONG.price] },
  {
    section: 'firme',
    what: 'long company names, long document names',
    texts: [LONG.company, LONG.hyphenCompany, LONG.person, LONG.document],
  },
  {
    section: 'oferte',
    what: 'long company names, a long message, a large price',
    texts: [LONG.company, LONG.hyphenCompany, LONG.person, LONG.token, LONG.url, LONG.price],
  },
  { section: 'mesaje', what: 'a long company name, long messages', texts: [LONG.company, LONG.person, LONG.token, LONG.url] },
  { section: 'acte', what: 'long document names, a long rejection', texts: [LONG.document, LONG.reason] },
  { section: 'comanda', what: 'long names and an unbroken reference', texts: [LONG.company, LONG.person, LONG.token] },
  { section: 'admin-acte', what: 'long company names', texts: [LONG.company, LONG.hyphenCompany, LONG.cooperative] },
  { section: 'evaluari', what: 'a long reviewer name, a long review', texts: [LONG.hyphenCompany, LONG.person, LONG.token] },
  { section: 'dashboard', what: 'long localities', texts: [LONG.from, LONG.to, LONG.distance] },
];

/** Every element that holds the text itself, and where it sits. */
async function placesOf(page: Page, text: string) {
  return page.locator('[data-proba-sectiune]').evaluate((root, wanted) => {
    const vw = document.documentElement.clientWidth;
    const out: { tag: string; left: number; right: number; overflow: number }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? '').includes(wanted)) continue;
      const el = node.parentElement!;
      if (el.closest('.sr-only, [hidden], details:not([open]) > :not(summary)')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (lines.length === 0) continue;
      // Scrolled inside a box on purpose (a table's own scroller) is fine.
      let scroller: Element | null = el;
      while (scroller && scroller !== document.body) {
        const ox = getComputedStyle(scroller).overflowX;
        if (ox === 'auto' || ox === 'scroll') break;
        scroller = scroller.parentElement;
      }
      if (scroller && scroller !== document.body) continue;
      out.push({
        tag: `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}`,
        left: Math.min(...lines.map((r) => r.left)),
        right: Math.max(...lines.map((r) => r.right)),
        // Wider than its own box, without an ellipsis to say so.
        overflow: style.textOverflow === 'ellipsis' ? 0 : el.scrollWidth - el.clientWidth,
      });
    }
    return { vw, places: out };
  }, text);
}

for (const { section, what, texts } of SCREENS) {
  test(`${section}: ${what} stay on the screen and inside their box`, async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/proba/ecrane?sectiune=${section}`);
    await page.evaluate(() => document.fonts.ready);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, `${section}: the page scrolls sideways`).toBeLessThanOrEqual(1);

    for (const text of texts) {
      const { vw, places } = await placesOf(page, text);
      expect(places.length, `${section}: „${text}" is on the screen`).toBeGreaterThan(0);
      for (const place of places) {
        expect(place.left, `${section}: „${text}" in ${place.tag} starts off screen`).toBeGreaterThanOrEqual(-1);
        expect(place.right, `${section}: „${text}" in ${place.tag} runs off screen`).toBeLessThanOrEqual(vw + 1);
        expect(place.overflow, `${section}: „${text}" stands out of ${place.tag}`).toBeLessThanOrEqual(2);
      }
    }
  });
}
