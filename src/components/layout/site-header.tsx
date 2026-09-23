import { Suspense } from 'react';
import { getAccountContext } from '@/lib/auth/account';
import { navContextOf } from '@/components/app/nav-context';
import { loadNavCounts } from '@/lib/nav-counts';
import { headerMenu } from '@/lib/navigation';
import { HeaderNav, type HeaderUser } from './header-menu';
import { HeaderBrand } from './header-brand';
import { HEADER_BAR, HEADER_OUTER } from './header-shell';

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
 * It is a dark surface, and says so with `data-surface="dark"`: the focus
 * ring on it is the bright accent rather than ink on ink, and anything in
 * it that takes the accent takes the step made for a dark ground.
 */
export function SiteHeader() {
  return (
    <div className={HEADER_OUTER}>
      <header data-surface="dark" className={HEADER_BAR}>
        <Suspense fallback={<SignedOutHeader />}>
          <HeaderAuth />
        </Suspense>
      </header>
    </div>
  );
}
