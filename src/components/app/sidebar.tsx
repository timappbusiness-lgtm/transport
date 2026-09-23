import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForAction, iconForRoute } from '@/lib/icons';
import { CompanySwitcher } from '@/components/app/company-switcher';
import { BRAND_NAME } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { appCopy } from '@/content/app';
import type { AccountContext } from '@/lib/auth/account';
import {
  GROUP_LABELS,
  NO_NAV_COUNTS,
  activeHref,
  badgeFor,
  buildNav,
  groupNav,
  type NavCounts,
} from '@/lib/navigation';
import { navContextOf } from '@/components/app/nav-context';
import { cn } from '@/lib/utils';
import { SubscriptionChip } from '@/components/app/subscription-chip';
import type { CompanySubscription } from '@/lib/subscription-source';

const c = appCopy.shell;

/**
 * The left-hand navigation, on a wide screen.
 *
 * A server component on purpose: the current item is worked out from the
 * path the middleware forwards, so the menu needs no JavaScript to know
 * where you are. The items themselves come from `buildNav`, which is where
 * the rules about roles and unbuilt features live.
 */
export function Sidebar({
  context,
  pathname,
  subscription,
  counts = NO_NAV_COUNTS,
}: {
  context: AccountContext;
  pathname: string;
  subscription: CompanySubscription | null;
  counts?: NavCounts;
}) {
  const items = buildNav(navContextOf(context));
  const current = activeHref(items, pathname);
  const groups = groupNav(items);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* The dashboard, not the marketing homepage. Somebody inside their
          own application who clicks the brand means „take me to the top of
          this", and being thrown out to the public site is the oldest way
          to lose them. */}
      <Link href={ROUTES.account} className="font-display text-body-lg font-medium">
        {BRAND_NAME}
      </Link>

      <CompanySwitcher context={context} />
      <SubscriptionChip context={context} subscription={subscription} />

      <nav aria-label={c.navLabel} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.group}>
            {/* One group needs no heading: a lone "Principal" above three
                links is furniture, not information. */}
            {groups.length > 1 ? (
              <p className="mb-1.5 px-3 font-mono text-label uppercase tracking-[0.12em] text-muted">
                {GROUP_LABELS[group.group]}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const badge = badgeFor(item.href, counts);
                const glyph = iconForRoute(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current === item.href ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-input px-3 py-2 text-sm',
                        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
                        current === item.href
                          ? 'bg-surface font-medium text-foreground'
                          : 'text-muted hover:bg-surface/60 hover:text-foreground',
                      )}
                    >
                      <span className={cn('flex min-w-0 items-center', ICON_GAP)}>
                        {/* The icon is what a returning dispatcher scans
                            for: they know the shape of „Trasee" before
                            they have read the word. It follows the link's
                            own colour, so the current item's icon goes
                            ink with its label. */}
                        {glyph ? <Icon as={glyph} size="sm" /> : null}
                        <span className="truncate">{item.label}</span>
                      </span>
                      {/* The same number as the header's, from the same
                          call: two counts of one thing is how a badge
                          stops being believed. */}
                      {badge > 0 ? (
                        <span className="inline-flex min-w-5 flex-none items-center justify-center rounded-pill bg-foreground px-1.5 py-0.5 font-mono text-label leading-none text-surface">
                          {badge > 9 ? '9+' : badge}
                          <span className="sr-only"> {accountCopy.nav.waiting}</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <p className="text-small">
        <Link
          href={ROUTES.accountHelp}
          className="inline-flex items-center gap-2 text-muted hover:text-foreground"
        >
          <Icon as={iconForAction('help')} size="sm" />
          {c.help}
        </Link>
      </p>
    </div>
  );
}
