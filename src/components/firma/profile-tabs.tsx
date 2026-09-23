import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import { onboardingCopy } from '@/content/onboarding';
import { stepPosition, type CompanyFileStep } from '@/lib/carrier-onboarding';
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
 *
 * Under it: which step this is, out of how many, and one line saying why
 * the questions on it are asked. Five named tabs with no numbers are a
 * menu, not a path — nothing on screen said how much was left, and a
 * dispatcher filling in a form wants to know that before the second
 * field. The total counts the tabs this firm actually has: a forwarder
 * sees four, and telling it five is a small lie that makes the last step
 * look broken.
 */
export function ProfileTabs({
  tabs,
  active,
}: {
  tabs: readonly ProfileTab[];
  active: ProfileTab;
}) {
  const position = stepPosition(active as CompanyFileStep, tabs as readonly CompanyFileStep[]);

  return (
    <div className="flex flex-col gap-3">
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
                  href={
                    tab === 'identitate'
                      ? ROUTES.accountCompany
                      : `${ROUTES.accountCompany}?sectiune=${tab}`
                  }
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex whitespace-nowrap px-3 py-2.5 text-body',
                    'border-b-2 -mb-px',
                    current
                      ? 'border-accent font-medium text-accent'
                      : 'border-transparent text-muted hover:border-accent-border hover:text-foreground',
                  )}
                >
                  {firmaCopy.tabs[tab]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {position === null ? null : (
        <p className="text-small text-muted">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-foreground">
            {firmaCopy.stepOf(position.current, position.total)}
          </span>{' '}
          · {onboardingCopy.why[active]}
        </p>
      )}
    </div>
  );
}
