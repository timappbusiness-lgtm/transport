import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { CompanySwitcher } from '@/components/app/company-switcher';
import { BRAND_NAME, SUPPORT_EMAIL } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { appCopy } from '@/content/app';
import type { AccountContext } from '@/lib/auth/account';
import { GROUP_LABELS, activeHref, buildNav, groupNav } from '@/lib/navigation';
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
}: {
  context: AccountContext;
  pathname: string;
  subscription: CompanySubscription | null;
}) {
  const items = buildNav(navContextOf(context));
  const current = activeHref(items, pathname);
  const groups = groupNav(items);

  return (
    <div className="flex h-full flex-col gap-6">
      <Link href={ROUTES.home} className="font-display text-[1.0625rem] font-medium">
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
              <p className="mb-1.5 px-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">
                {GROUP_LABELS[group.group]}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current === item.href ? 'page' : undefined}
                    className={cn(
                      'block rounded-input px-3 py-2 text-sm',
                      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
                      current === item.href
                        ? 'bg-surface font-medium text-foreground'
                        : 'text-muted hover:bg-surface/60 hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <p className="text-[0.8125rem]">
        <Link
          href={SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : ROUTES.contact}
          className="inline-flex items-center gap-2 text-muted hover:text-foreground"
        >
          <LifeBuoy size={14} aria-hidden="true" />
          {c.help}
        </Link>
      </p>
    </div>
  );
}
