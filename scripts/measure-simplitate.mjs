/**
 * Counts what a person actually faces on each journey.
 *
 * Two sources, kept apart on purpose:
 *
 *   - LIVE: screens reachable without a session, measured in a browser —
 *     fields, controls above the fold, words in <main>.
 *   - SOURCE: screens behind a login, counted from the components that
 *     build them. This sandbox has no Supabase, so a browser cannot
 *     reach them; counting the form definitions is reproducible and
 *     says so in the output.
 *
 * Run it on main and again on the branch; the two outputs are the
 * before/after table in docs/15-simplitate.md.
 */
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const C = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
const PORT = process.argv[2] ?? '3000';

/** Public screens, one per journey step we can actually open. */
const LIVE = [
  ['client publică o cerere', '/cerere/noua'],
  ['transportator se înscrie', '/transportatori/inscriere'],
  ['transportator se înscrie', '/inregistrare'],
  ['transportator se înscrie', '/inregistrare/firma'],
  ['panoul de cereri', '/cereri'],
  ['panoul de trasee', '/trasee'],
];

/** Counted from source, because a browser here cannot sign in. */
const SOURCE = [
  ['transportator trimite ofertă', 'src/components/offers/offer-form.tsx'],
  ['transportator publică un traseu', 'src/components/departures/departure-form.tsx'],
  ['dosarul firmei', 'src/components/firma/profile-tabs.tsx'],
];

function countFields(src) {
  const inputs = (src.match(/<input\b/g) ?? []).length;
  const selects = (src.match(/<select\b/g) ?? []).length;
  const areas = (src.match(/<textarea\b/g) ?? []).length;
  return inputs + selects + areas;
}

const browser = await chromium.launch({ executablePath: C.find(existsSync) });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const rows = [];
for (const [journey, route] of LIVE) {
  const res = await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => null);
  if (!res || res.status() >= 400) { rows.push({ journey, route, note: `HTTP ${res?.status() ?? 'err'}` }); continue; }
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const vis = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const fields = [...main.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(vis);
    // "Above the fold" = inside the first viewport height.
    const above = fields.filter((n) => n.getBoundingClientRect().top < window.innerHeight);
    const controls = [...main.querySelectorAll('input:not([type=hidden]), select, textarea, button, a[role=button]')]
      .filter(vis).filter((n) => n.getBoundingClientRect().top < window.innerHeight);
    const words = (main.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    return { fields: fields.length, fieldsAbove: above.length, controlsAbove: controls.length, words };
  });
  rows.push({ journey, route, ...m });
}
await browser.close();

console.log('## LIVE (measured in a browser)');
console.log('journey | route | fields | fields above fold | controls above fold | words in <main>');
for (const r of rows) {
  if (r.note) { console.log(`${r.journey} | ${r.route} | ${r.note}`); continue; }
  console.log(`${r.journey} | ${r.route} | ${r.fields} | ${r.fieldsAbove} | ${r.controlsAbove} | ${r.words}`);
}

console.log('\n## SOURCE (counted from the component)');
console.log('journey | file | fields');
for (const [journey, file] of SOURCE) {
  if (!existsSync(file)) { console.log(`${journey} | ${file} | (absent)`); continue; }
  console.log(`${journey} | ${file} | ${countFields(readFileSync(file, 'utf8'))}`);
}
