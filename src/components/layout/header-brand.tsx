'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/icons';
import { BRAND_NAME } from '@/config/brand';
import { brandHref } from './header-menu';

/**
 * The brand in the floating bar.
 *
 * A client component for one reason: where it leads depends on the path,
 * and the path is what `usePathname` knows without a round trip. Inside
 * the account it is the dashboard; everywhere else it is the homepage.
 */
export function HeaderBrand({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  return (
    <Link
      href={brandHref(signedIn, pathname)}
      className="mr-auto flex items-center gap-2.5 font-display text-body-lg font-medium tracking-[-0.02em]"
    >
      <BrandMark className="flex-none" />
      {BRAND_NAME}
    </Link>
  );
}
