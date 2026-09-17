import { Suspense } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/icons';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { HeaderNav, type HeaderUser } from './header-menu';

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

  const user: HeaderUser | null = context
    ? {
        name: context.profile?.full_name ?? context.user.email ?? 'Cont',
        hasCompany: context.memberships.length > 0,
        isStaff: context.isStaff,
      }
    : null;

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
        <Link
          href={ROUTES.home}
          className="mr-auto flex items-center gap-2.5 font-display text-[1.0625rem] font-medium tracking-[-0.02em]"
        >
          <BrandMark className="flex-none" />
          {BRAND_NAME}
        </Link>
        <Suspense fallback={<HeaderNav user={null} />}>
          <HeaderAuth />
        </Suspense>
      </header>
    </div>
  );
}
