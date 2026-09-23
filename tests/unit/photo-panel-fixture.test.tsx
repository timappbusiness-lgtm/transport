import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

/**
 * The photo area with two photos in it, as a golden file for Playwright.
 *
 * Uploading needs a session and a bucket, which neither CI nor the sandbox
 * has; the real upload is walked in faza-1-deblocare-supabase.spec.ts.
 * What can be checked without them is how the area looks and behaves at
 * 1440 and 390 once it has photos: the thumbnails, a remove button on each
 * that says which photo it removes, and the drop area still there for the
 * rest. Same approach as tests/unit/header-fixture.test.tsx.
 *
 *   UPDATE_FIXTURES=1 pnpm vitest run tests/unit/photo-panel-fixture.test.tsx
 */

vi.mock('@/app/cerere/import-actions', () => ({
  uploadRequestPhotoAction: async () => ({ ok: false }),
  removeRequestPhotoAction: async () => {},
}));

const { PhotoPanel } = await import('@/components/requests/photo-panel');

const FIXTURE = 'tests/e2e/fixtures/poze-cerere.html';

/** A drawn stand-in for a photograph: a sky, a road, nothing real. */
const SAMPLE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="2" fill="#9cc5cb"/><rect y="2" width="4" height="1" fill="#5b6770"/></svg>',
)}`;

function render(): string {
  return renderToStaticMarkup(
    <PhotoPanel
      photos={[
        { path: 'u/1.jpg', preview: SAMPLE },
        { path: 'u/2.jpg', preview: SAMPLE },
        { path: 'u/3.jpg', preview: SAMPLE, fromImport: true },
      ]}
      onChange={() => {}}
    />,
  );
}

describe('the photo area fixture', () => {
  it('matches the component as it is now', () => {
    const html = `${render()}\n`;
    if (process.env.UPDATE_FIXTURES === '1' || !existsSync(FIXTURE)) writeFileSync(FIXTURE, html);
    expect(readFileSync(FIXTURE, 'utf8'), `stale: run UPDATE_FIXTURES=1 pnpm vitest run ${__filename}`).toBe(html);
  });

  it('carries three photos, a remove button for each, and the drop area', () => {
    const html = readFileSync(FIXTURE, 'utf8');
    expect(html.match(/data-photo="/g)).toHaveLength(3);
    for (const n of [1, 2, 3]) expect(html).toContain(`aria-label="Scoate poza ${n}"`);
    expect(html).toContain('data-drop');
    // The form draws the hidden fields, not the panel.
    expect(html).not.toContain('photo_paths');
  });
});
