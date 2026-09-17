import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { appCopy } from '@/content/app';
import type { AccountContext } from '@/lib/auth/account';
import { isManagerRole } from '@/lib/navigation';
import { pluralRo } from '@/lib/requests';
import type { CompanySubscription } from '@/lib/subscription-source';
import { cn } from '@/lib/utils';

const c = appCopy.shell;

/**
 * Where the company stands with its plan, in one line.
 *
 * Only for the people who can act on it: showing a dispatcher a trial
 * countdown they cannot do anything about is noise. It links to the
 * subscription page rather than the pricing page, because from inside the
 * account the question is "what do I have", not "what could I buy".
 */
export function SubscriptionChip({
  context,
  subscription,
}: {
  context: AccountContext;
  subscription: CompanySubscription | null;
}) {
  if (!context.activeCompany || !isManagerRole(context.activeRole)) return null;
  if (!subscription || subscription.status === 'none') return null;

  const trial = subscription.isTrial;
  const label = trial
    ? subscription.daysLeft > 0
      ? c.trial(pluralRo(subscription.daysLeft, 'zi', 'zile'))
      : c.trialEnded
    : c.planActive(subscription.planCode);

  return (
    <Link
      href={ROUTES.accountSubscription}
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-pill border px-3 py-1',
        'font-mono text-[0.6875rem] tracking-[0.02em]',
        trial && subscription.daysLeft <= 7
          ? 'border-warning/45 bg-warning/10 text-foreground'
          : 'border-border text-muted hover:text-foreground',
      )}
    >
      {label}
    </Link>
  );
}
