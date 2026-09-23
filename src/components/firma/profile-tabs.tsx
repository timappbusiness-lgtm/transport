import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import type { ProfileTab } from '@/lib/company-profile';
import { cn } from '@/lib/utils';

/**
 * The tab bar.
 *
 * Links rather than client state, so a tab has a URL: a manager can send
 * "completează acoperirea" with the link to the tab, a browser back button
 * goes back a tab, and the page works before the JavaScript arrives.
 *
 * On a phone the bar is a horizontal scroller that reaches both edges —
 * a five-item row wrapped onto three lines pushes the form below the fold
 * on every visit.
 */
export function ProfileTabs({
  tabs,
  active,
}: {
  tabs: readonly ProfileTab[];
  active: ProfileTab;
}) {
  return (
    <nav
      aria-label="Secțiunile profilului"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1 border-b border-border sm:min-w-0">
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={tab === 'identitate' ? ROUTES.accountCompany : `${ROUTES.accountCompany}?sectiune=${tab}`}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex whitespace-nowrap px-3 py-2.5 text-body',
                  'border-b-2 -mb-px',
                  current
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted hover:text-foreground',
                )}
              >
                {firmaCopy.tabs[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
