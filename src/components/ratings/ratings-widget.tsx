import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { ratingsCopy } from '@/content/evaluari';
import { ratingDeadline } from '@/lib/ratings';
import type { PendingRating } from '@/lib/ratings-source';

const c = ratingsCopy.widget;

/**
 * „Evaluări de dat", cu termenul cel mai apropiat.
 *
 * Nu se desenează când nu e nimic de dat. Un widget care scrie „0
 * evaluări de dat" ocupă spațiu ca să spună că nu are ce spune, iar
 * întreg tabloul de bord ajunge o listă de zerouri.
 */
export function RatingsWidget({ pending }: { pending: readonly PendingRating[] }) {
  if (pending.length === 0) return null;

  // Lista vine deja sortată după termen, deci primul este cel mai apropiat.
  const soonest = ratingDeadline(pending[0]?.deadline ?? null);

  return (
    <section aria-labelledby="evaluari-widget">
      <h2 id="evaluari-widget" className="text-h3">
        {c.title}
      </h2>

      <Card className="mt-3 p-5">
        <p className="text-sm">
          <Link href={ROUTES.accountRatings} className="underline underline-offset-4">
            {c.pending(pending.length)}
          </Link>
        </p>
        {soonest !== null && !soonest.passed ? (
          <p className="mt-1 text-sm text-muted">{c.soonest(soonest.at)}</p>
        ) : null}

        <Link href={ROUTES.accountRatings} className={`${buttonClasses('secondary', 'sm')} mt-4`}>
          {c.action}
        </Link>
      </Card>
    </section>
  );
}
