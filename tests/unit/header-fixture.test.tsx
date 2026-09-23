import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NO_NAV_COUNTS, headerMenu } from '@/lib/navigation';

/**
 * The signed-in header with a long name, as a golden file for Playwright.
 *
 * The signed-in bar needs a session, which neither CI nor the sandbox has,
 * and Playwright cannot import the components (it loads them as native
 * ES modules, and `next/link` has no ES module entry). So this renders the
 * real view — the same component, the same shell classes — and the
 * browser test puts it on a page with the site's own stylesheet and
 * measures it at every width (`tests/e2e/aspect-modern.spec.ts`).
 *
 * The file is committed. This test fails when it is stale; to refresh it:
 *
 *   UPDATE_FIXTURES=1 pnpm vitest run tests/unit/header-fixture.test.tsx
 */

vi.mock('@/app/auth-actions', () => ({ signOutAction: async () => {} }));

const { HeaderNavView } = await import('@/components/layout/header-menu');
const { HeaderBrandView } = await import('@/components/layout/header-brand');
const { HEADER_BAR, HEADER_OUTER } = await import('@/components/layout/header-shell');

export const LONG_NAME = 'Constantin-Alexandru Popescu-Ionescu';
const FIXTURE = 'tests/e2e/fixtures/antet-nume-lung.html';

function render(): string {
  const user = {
    name: LONG_NAME,
    items: headerMenu(
      { accountType: 'company', companyType: 'transport', role: 'owner', isStaff: false },
      NO_NAV_COUNTS,
    ),
  };
  return renderToStaticMarkup(
    <div className={HEADER_OUTER}>
      <header data-surface="dark" className={HEADER_BAR}>
        <HeaderBrandView signedIn pathname="/cereri" />
        <HeaderNavView user={user} pathname="/cereri" />
      </header>
    </div>,
  );
}

describe('the signed-in header fixture', () => {
  it('matches the components as they are now', () => {
    const html = `${render()}\n`;
    if (process.env.UPDATE_FIXTURES === '1' || !existsSync(FIXTURE)) writeFileSync(FIXTURE, html);
    expect(readFileSync(FIXTURE, 'utf8'), `stale: run UPDATE_FIXTURES=1 pnpm vitest run ${__filename}`).toBe(html);
  });

  it('carries the long name, the avatar and the chevron', () => {
    const html = readFileSync(FIXTURE, 'utf8');
    expect(html).toContain(LONG_NAME);
    expect(html).toContain('data-account-avatar');
    expect(html).toContain('data-account-chevron');
  });
});
