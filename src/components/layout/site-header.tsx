import Link from 'next/link';
import { BrandMark } from '@/components/icons';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { Container } from './container';
import { HeaderNav, type HeaderUser } from './header-menu';

/**
 * Site header. Reads the session on the server so the first paint already
 * knows whether somebody is signed in — no flash of the wrong menu.
 */
export async function SiteHeader() {
  const context = await getAccountContext();

  const user: HeaderUser | null = context
    ? {
        name: context.profile?.full_name ?? context.user.email ?? 'Cont',
        hasCompany: context.memberships.length > 0,
        isStaff: context.isStaff,
      }
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <Container className="relative flex h-[60px] items-center gap-4">
        <Link
          href={ROUTES.home}
          className="mr-auto flex items-center gap-2.5 font-display text-[1.0625rem] font-extrabold tracking-[-0.02em]"
        >
          <BrandMark className="flex-none" />
          {BRAND_NAME}
        </Link>
        <HeaderNav user={user} />
      </Container>
    </header>
  );
}
