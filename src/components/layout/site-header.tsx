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
 * fallback is the signed-out nav, which is also what an anonymous visitor
 * ends up with, so the common case never changes shape.
 */
async function HeaderAuth() {
  const context = await getAccountContext();
  if (!context) return <HeaderNav user={null} />;

  // The menu comes from the same builder the sidebar reads, so the header
  // can never offer a page the sidebar does not — or one that is not
  // built, or one this role may not open.
  const counts = await loadNavCounts();
  const user: HeaderUser = {
    name: context.profile?.full_name ?? context.user.email ?? 'Cont',
    items: headerMenu(navContextOf(context), counts),
  };

  return <HeaderNav user={user} />;
}

/**
 * Floating pill navigation.
 *
 * The bar sits inside the page rather than spanning it, so the ground shows
 * through on both sides and the page reads as a sheet the nav rests on.
 */
export function SiteHeader() {
  return (
    <div className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <header className="pointer-events-auto mx-auto flex h-14 w-full max-w-[72rem] items-center gap-3 rounded-pill border border-white/25 bg-[rgba(28,38,43,.72)] px-3 text-white backdrop-blur-xl sm:gap-4 sm:px-5">
        {/* The brand leads to /cont from inside the account and to the
            homepage everywhere else, which needs both the session and the
            path — so it streams in with the rest. The fallback is the
            public target, the same one an anonymous visitor gets. */}
        <Suspense fallback={<HeaderBrand signedIn={false} />}>
          <HeaderAuthBrand />
        </Suspense>
        <Suspense fallback={<HeaderNav user={null} />}>
          <HeaderAuth />
        </Suspense>
      </header>
    </div>
  );
}

async function HeaderAuthBrand() {
  const context = await getAccountContext();
  return <HeaderBrand signedIn={context !== null} />;
}
