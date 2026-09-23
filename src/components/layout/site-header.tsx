import { Suspense } from 'react';
import { getAccountContext } from '@/lib/auth/account';
import { navContextOf } from '@/components/app/nav-context';
import { loadNavCounts } from '@/lib/nav-counts';
import { headerMenu } from '@/lib/navigation';
import { HeaderNav, type HeaderUser } from './header-menu';
import { HeaderBrand } from './header-brand';

/**
 * The half of the header that needs the session.
 *
 * Split out and suspended so reading a cookie does not make every marketing
 * page uncacheable: the shell is static, this streams in behind it. The
 * fallback is the signed-out header, which is also what an anonymous
 * visitor ends up with, so the common case never changes shape.
 *
 * The brand is in here too rather than behind a boundary of its own —
 * where it leads depends on the session as well. One boundary, one call:
 * two of them read the same cached context but schedule as two separate
 * pieces of work, and that was enough to change the order a page and its
 * layout render in. It surfaced a real bug elsewhere rather than causing
 * one, but a header has no business deciding that ordering.
 */
async function HeaderAuth() {
  const context = await getAccountContext();
  if (!context) return <SignedOutHeader />;

  // The menu comes from the same builder the sidebar reads, so the header
  // can never offer a page the sidebar does not — or one that is not
  // built, or one this role may not open.
  const counts = await loadNavCounts();
  const user: HeaderUser = {
    name: context.profile?.full_name ?? context.user.email ?? 'Cont',
    items: headerMenu(navContextOf(context), counts),
  };

  return (
    <>
      <HeaderBrand signedIn />
      <HeaderNav user={user} />
    </>
  );
}

function SignedOutHeader() {
  return (
    <>
      <HeaderBrand signedIn={false} />
      <HeaderNav user={null} />
    </>
  );
}

/**
 * Floating pill navigation.
 *
 * The bar sits inside the page rather than spanning it, so the ground shows
 * through on both sides and the page reads as a sheet the nav rests on.
 *
 * Ink at 80%, not the 72% it was. The brand mark and wordmark carry the
 * accent's dark step now, and over a white page 72% leaves that at 4.05:1
 * — under body text. At 80% it is 5.37:1 and white rises to 8.10:1.
 * `tests/unit/accent-scale.test.ts` measures both and reads this class.
 */
export function SiteHeader() {
  return (
    <div className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <header className="pointer-events-auto mx-auto flex h-14 w-full max-w-[72rem] items-center gap-3 rounded-pill border border-white/25 bg-foreground/80 px-3 text-white backdrop-blur-xl sm:gap-4 sm:px-5">
        <Suspense fallback={<SignedOutHeader />}>
          <HeaderAuth />
        </Suspense>
      </header>
    </div>
  );
}
