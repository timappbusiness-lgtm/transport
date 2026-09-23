import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
const C = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'];
const executablePath = C.find((p) => existsSync(p));
const dir = process.argv[2];
const port = process.argv[3] ?? 3000;
mkdirSync(dir, { recursive: true });
const SHOTS = JSON.parse(process.argv[4]);
const b = await chromium.launch(executablePath ? { executablePath } : {});
for (const [w, h, tag] of [[1440, 900, '1440'], [390, 844, '390']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  for (const [name, route, clip] of SHOTS) {
    await p.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
    await p.waitForTimeout(700);
    const path = `${dir}/${name}-${tag}.png`;
    if (clip) { const el = p.locator(clip).first(); if (await el.count()) await el.screenshot({ path }); else await p.screenshot({ path }); }
    else await p.screenshot({ path, fullPage: true });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${tag.padEnd(5)} ${route.padEnd(16)} overflow=${overflow}`);
  }
  await p.close();
}
await b.close();
