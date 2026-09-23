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
      // The brand is the one place on the dark bar that carries the
      // accent: its pale step, 5.37:1 over the bar even with a white page
      // behind it. Everything else on the bar stays white.
      className="mr-auto flex items-center gap-2.5 font-display text-body-lg font-medium tracking-[-0.02em] text-accent-on-dark"
    >
      <BrandMark className="flex-none" />
      {/* Below `sm` the word is read but not drawn. The bar is brand,
          navigation and two pills inside 390px, and the word was taking
          the room the navigation needed — with it there, the first menu
          item rendered as „Ce". The mark still identifies the brand and
          still links home, and `sr-only` rather than `hidden` keeps the
          link's accessible name. */}
      <span className="sr-only sm:not-sr-only">{BRAND_NAME}</span>
    </Link>
  );
}
