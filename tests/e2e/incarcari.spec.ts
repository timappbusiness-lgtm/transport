import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * Files that survive interruptions, in a real browser.
 *
 * `/proba/incarcari` renders the upload queue every upload screen uses —
 * `useUploadQueue`, the IndexedDB store, `UploadLine` — with nothing
 * else, because every real upload screen needs a session and a bucket the
 * sandbox and CI do not have. The server is this file's: `page.route`
 * answers, fails, loses answers and hangs, and keeps a record of what it
 * stored by id, the way storage and the tables do.
 *
 * The page exists only when the server was started with E2E_HARNESS=1,
 * which playwright.config.ts sets.
 */

const URL = '**/__proba/incarcare';

function idOf(request: Request): string {
  const body = request.postDataBuffer()?.toString('latin1') ?? '';
  const match = body.match(/name="id"\r\n\r\n([0-9a-f-]{36})/);
  if (!match) throw new Error('No id in the upload');
  return match[1]!;
}

const photo = (name: string, bytes = 2048) => ({
  name,
  mimeType: 'image/jpeg',
  buffer: Buffer.alloc(bytes, 7),
});

async function choose(page: Page, files: ReturnType<typeof photo>[]) {
  await page.locator('[data-harness-input]').setInputFiles(files);
}

test.beforeEach(async ({ page }) => {
  // Each test starts from an empty device.
  await page.goto('/proba/incarcari');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('app-trimiteri');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      }),
  );
  await page.reload();
});

test('a failed upload keeps the file, says why, and „Încearcă din nou" sends the same one', async ({ page }) => {
  const received: string[] = [];
  await page.route(URL, async (route) => {
    const id = idOf(route.request());
    received.push(id);
    if (received.length === 1) return route.fulfill({ status: 500, body: '<html>Internal error</html>' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id }) });
  });

  await choose(page, [photo('licenta.jpg')]);
  const line = page.locator('[data-upload-name="licenta.jpg"]');
  await expect(line).toHaveAttribute('data-upload-status', 'failed');
  await expect(line).toContainText('eșuat');
  await expect(line).toContainText('Fișierul a rămas aici');

  await line.getByRole('button', { name: 'Încearcă din nou' }).click();
  await expect(line).toHaveAttribute('data-upload-status', 'uploaded');
  await expect(line).toContainText('încărcat');

  expect(received).toHaveLength(2);
  expect(received[1]).toBe(received[0]);
});

test('a dropped connection is a sentence beside the file, not the error page', async ({ page }) => {
  let first = true;
  await page.route(URL, async (route) => {
    const id = idOf(route.request());
    if (first) {
      first = false;
      return route.abort('internetdisconnected');
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id }) });
  });

  await choose(page, [photo('rca.jpg')]);
  const line = page.locator('[data-upload-name="rca.jpg"]');
  await expect(line).toContainText('Conexiunea s-a întrerupt');
  await line.getByRole('button', { name: 'Încearcă din nou' }).click();
  await expect(line).toHaveAttribute('data-upload-status', 'uploaded');
});

test('a reload mid-upload keeps the chosen files, and nothing is stored twice', async ({ page }) => {
  const received: string[] = [];
  const stored = new Set<string>();
  let reloaded = false;

  await page.route(URL, async (route) => {
    const id = idOf(route.request());
    received.push(id);
    if (!reloaded) {
      if (received.length === 1) {
        // The first file reached the server; only the answer was lost.
        stored.add(id);
        return route.abort('connectionreset');
      }
      // The second is still on its way when the page reloads.
      return;
    }
    stored.add(id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id }) });
  });

  await choose(page, [photo('itp.jpg'), photo('cmr.jpg')]);
  await expect(page.locator('[data-upload-name="itp.jpg"]')).toHaveAttribute('data-upload-status', 'failed');
  await expect(page.locator('[data-upload-name="cmr.jpg"]')).toHaveAttribute('data-upload-status', 'uploading');

  reloaded = true;
  await page.reload();

  // Both came back from the device and went, one of them for the second time.
  await expect(page.locator('[data-upload-status="uploaded"]')).toHaveCount(2);
  await expect(page.locator('[data-harness-summary]')).toHaveText('2 din 2 încărcate');

  const [first] = received;
  expect(received.filter((id) => id === first)).toHaveLength(2);
  expect(new Set(received).size).toBe(2);
  expect(stored.size).toBe(2);

  // And once the server has them, they are gone from the device.
  await page.reload();
  await expect(page.locator('[data-upload-status]')).toHaveCount(0);
});

test('a tab closed before the upload and opened again still has the file', async ({ page, context }) => {
  let open = true;
  await page.route(URL, async () => {
    // Nothing answers while the first tab is open.
  });
  await choose(page, [photo('onrc.jpg')]);
  await expect(page.locator('[data-upload-name="onrc.jpg"]')).toHaveAttribute('data-upload-status', 'uploading');
  open = false;
  await page.close();

  const again = await context.newPage();
  await again.route(URL, async (route) => {
    const id = idOf(route.request());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id }) });
  });
  await again.goto('/proba/incarcari');
  await expect(again.locator('[data-upload-name="onrc.jpg"]')).toHaveAttribute('data-upload-status', 'uploaded');
  expect(open).toBe(false);
});

test('a file too large to keep says so, and is still sent while the page is open', async ({ page }) => {
  await page.route(URL, async (route) => {
    const id = idOf(route.request());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id }) });
  });
  await choose(page, [photo('scan-mare.jpg', 16 * 1024 * 1024)]);
  const line = page.locator('[data-upload-name="scan-mare.jpg"]');
  await expect(line).toContainText('peste 15 MB');
  await expect(line).toHaveAttribute('data-upload-status', 'uploaded');
});

test('the rows fit a 390px phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(URL, async (route) => route.fulfill({ status: 500, body: 'x' }));
  await choose(page, [photo('o-poza-cu-un-nume-foarte-lung-de-la-telefon-IMG_20260924_101112.jpg')]);
  await expect(page.locator('[data-upload-status="failed"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
