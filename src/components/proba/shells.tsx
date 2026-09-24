import type { ReactNode } from 'react';
import { Container } from '@/components/layout/container';
import { MobileNav } from '@/components/app/mobile-nav';
import { navContextOf } from '@/components/app/nav-context';
import { Sidebar } from '@/components/app/sidebar';
import { activeHref, bottomNav, buildNav, withBadges } from '@/lib/navigation';
import { PROBA_CONTEXT, PROBA_COUNTS, PROBA_SUBSCRIPTION } from '@/components/proba/fixtures';

/**
 * The account shell from `src/app/cont/layout.tsx`, given a sample
 * session instead of reading one.
 *
 * The classes are copied from that layout on purpose, and have to be kept
 * in step with it by hand: the point of the harness is that a page in
 * here is as wide, as padded and as far from the fixed bottom bar as the
 * real one. Left out: the terms gate, the status banner and the account
 * notices, which are states of their own and not what a layout sweep
 * checks.
 */
export function ProbaAccountShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const items = buildNav(navContextOf(PROBA_CONTEXT));
  const current = activeHref(items, pathname);
  const { bar, more } = bottomNav(items);

  return (
    <>
      <Container className="py-6 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          <aside className="hidden lg:block lg:w-60 lg:flex-none">
            <div className="sticky top-24 flex max-h-[calc(100dvh-7.5rem)] flex-col">
              <Sidebar
                context={PROBA_CONTEXT}
                pathname={pathname}
                subscription={PROBA_SUBSCRIPTION}
                counts={PROBA_COUNTS}
              />
            </div>
          </aside>

          <div
            id="continut-cont"
            data-proba-continut
            className="min-w-0 flex-1 [--bottom-bar:calc(3.5rem+env(safe-area-inset-bottom))] lg:[--bottom-bar:0px]"
          >
            {children}
          </div>
        </div>
      </Container>

      <MobileNav
        bar={withBadges(bar, PROBA_COUNTS)}
        more={withBadges(more, PROBA_COUNTS)}
        current={current}
      />
    </>
  );
}

/**
 * The staff shell from `src/app/admin/layout.tsx`.
 *
 * Its menu is a constant inside that layout and is not exported, so the
 * column it sits in is kept at the same width and left empty: the content
 * column is exactly as wide as on the real page, which is what matters.
 */
export function ProbaAdminShell({ children }: { children: ReactNode }) {
  return (
    <Container className="py-8 sm:py-12">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:flex-none">
          <p className="mb-3 font-mono text-label uppercase tracking-[0.15em] text-muted">
            Administrare
          </p>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Container>
  );
}
