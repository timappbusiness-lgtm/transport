#!/usr/bin/env node
/**
 * Walks the sign-up paths in a browser and counts what a person meets:
 * screens, fields on each, fields they must fill, taps and characters.
 *
 *   node scripts/masoara-inscrierea.mjs http://127.0.0.1:3000 [label]
 *
 * Only what opens without a session is walked here — the request form up
 * to the account, the two sign-up forms, the board. docs/17-viteza-inscriere.md
 * says which numbers come from this walk and which were counted from the
 * screens' code, and why.
 *
 * Minutes are not timed with a person. They are computed from the walked
 * counts with the keystroke-level model at phone speeds (constants
 * below), so two versions are compared on the same yardstick.
 */
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3000';
const LABEL = process.argv[3] ?? BASE;
const executablePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) =>
  existsSync(p),
);

/** Keystroke-level model, phone: a tap, a keystroke, a moment to read a field. */
const TAP_S = 1.1;
const KEY_S = 0.35;
const THINK_S = 1.35;

const FUTURE = '2031-06-30';

/** The controls a person sees: text-like inputs, selects, textareas, checkboxes, and one per radio group. */
async function visibleFields(page, scope = 'main') {
  return page.evaluate((root) => {
    const container = document.querySelector(root) ?? document.body;
    const seenGroups = new Set();
    const out = [];
    for (const el of container.querySelectorAll('input, select, textarea')) {
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') continue;
      if (el.type === 'file') continue;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const hidden = el.closest('details:not([open])') !== null;
      const shown = !hidden && style.visibility !== 'hidden' && (box.width > 0 || box.height > 0 || el.type === 'radio' || el.type === 'checkbox');
      if (!shown) continue;
      if (el.type === 'radio') {
        if (seenGroups.has(el.name)) continue;
        seenGroups.add(el.name);
      }
      const label =
        (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) ||
        el.getAttribute('aria-label') ||
        el.closest('label')?.textContent?.trim() ||
        el.name;
      out.push({ type: el.type || el.tagName.toLowerCase(), label: (label ?? '').slice(0, 60) });
    }
    return out;
  }, scope);
}

function tally() {
  return { screens: [], taps: 0, chars: 0, fills: 0 };
}

async function screen(t, page, name, scope) {
  const fields = await visibleFields(page, scope);
  t.screens.push({ name, fields: fields.length, list: fields.map((f) => f.label) });
}

async function fill(t, page, label, value) {
  await page.getByLabel(label, { exact: true }).first().fill(value);
  t.taps += 1;
  t.chars += value.length;
  t.fills += 1;
}

async function tap(t, locator) {
  await locator.click();
  t.taps += 1;
}

function minutes(t) {
  const seconds = t.taps * TAP_S + t.chars * KEY_S + t.fills * THINK_S;
  return Math.round((seconds / 60) * 10) / 10;
}

async function client(browser) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const t = tally();
  const started = Date.now();
  await page.goto(`${BASE}/cerere/noua`);

  await screen(t, page, '1 Traseu', 'form');
  await fill(t, page, 'Oraș de plecare', 'Cluj-Napoca');
  await page.keyboard.press('Escape');
  await fill(t, page, 'Oraș de destinație', 'București');
  await page.keyboard.press('Escape');
  await fill(t, page, 'Poate fi încărcat de la', FUTURE);
  await tap(t, page.getByRole('button', { name: 'Continuă' }));

  await page.getByLabel('Marca', { exact: true }).waitFor();
  await screen(t, page, '2 Vehicul', 'form');
  await fill(t, page, 'Marca', 'Dacia');
  await fill(t, page, 'Modelul', 'Logan');
  await fill(t, page, 'Anul fabricației', '2016');
  await tap(t, page.getByRole('button', { name: 'Continuă' }));

  await page.getByRole('radio', { name: 'Standard' }).waitFor();
  await screen(t, page, '3 Serviciu', 'form');
  await tap(t, page.getByRole('button', { name: 'Continuă' }));

  await page.locator('[data-account-step="needed"]').waitFor();
  await screen(t, page, '4 Contact (fără cont)', 'form');
  // What is on the screen and required before the account: on main the
  // name and the telephone are asked here, and asked again a click later.
  const phone = page.getByLabel('Telefon', { exact: true });
  if ((await phone.count()) > 0 && (await phone.isVisible())) {
    const name = page.getByLabel('Numele tău', { exact: true });
    if ((await name.count()) > 0 && (await name.isVisible())) await fill(t, page, 'Numele tău', 'Ana Pop');
    await fill(t, page, 'Telefon', '0722 123 456');
  }
  await tap(t, page.locator('[data-account-step="needed"]').getByRole('link', { name: 'Fă-ți cont gratuit' }));

  await page.getByLabel('Nume și prenume').waitFor();
  await screen(t, page, '5 Cont nou', 'form');
  await fill(t, page, 'Nume și prenume', 'Ana Pop');
  await fill(t, page, 'Adresă de e-mail', 'ana.pop@example.com');
  await fill(t, page, 'Telefon', '0722 123 456');
  await fill(t, page, 'Parolă', 'parolaSigura1');
  await tap(t, page.getByRole('checkbox'));
  await tap(t, page.getByRole('button', { name: 'Creează contul' }));
  const walked = Date.now() - started;
  await page.context().close();
  return { ...t, walkedMs: walked };
}

async function carrierSignUp(browser) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const t = tally();
  await page.goto(`${BASE}/inregistrare/firma`);
  await screen(t, page, 'Cont de firmă', 'form');
  for (const field of t.screens[0].list) {
    if (/Nume și prenume/.test(field)) await fill(t, page, field, 'Mihai Transport');
    else if (/e-mail/i.test(field)) await fill(t, page, field, 'mihai@transport.example.com');
    else if (/^Telefon/.test(field)) await fill(t, page, field, '0722 123 456');
    else if (/^Parolă/.test(field)) await fill(t, page, field, 'parolaSigura1');
    else if (/Denumire|Numele firmei/i.test(field)) await fill(t, page, field, 'Mihai Transport SRL');
    else if (/CUI/.test(field)) await fill(t, page, field, '18547290');
  }
  await tap(t, page.getByRole('checkbox'));
  await tap(t, page.getByRole('button', { name: /Continuă|Creează contul/ }));
  await page.context().close();
  return t;
}

async function board(browser) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const response = await page.goto(`${BASE}/cereri?confirma=mihai%40transport.example.com`);
  const banner = await page.locator('[data-confirm-email]').count();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await page.context().close();
  return { status: response?.status() ?? 0, confirmBanner: banner > 0, overflow };
}

const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const result = {
    label: LABEL,
    model: { tapSeconds: TAP_S, keySeconds: KEY_S, thinkSeconds: THINK_S },
    client: await client(browser),
    carrierSignUp: await carrierSignUp(browser),
    board: await board(browser),
  };
  result.client.minutes = minutes(result.client);
  result.carrierSignUp.minutes = minutes(result.carrierSignUp);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
