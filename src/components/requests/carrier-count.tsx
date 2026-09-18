import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { CARRIER_COUNT_COPY, carrierCountSentence } from '@/lib/carrier-count';

export interface CarrierCountProps {
  /** Null means the question could not be asked, and nothing is shown. */
  count: number | null;
  /** The line under the number that says what it counts. */
  explain?: boolean;
  className?: string;
}

/**
 * How many verified carriers circulate on this route in these dates.
 *
 * Never a list, never a name. The one line under the number exists
 * because the sentence above it promises a period, and a person is
 * entitled to know that „in the chosen period" means „has announced a
 * route overlapping it" rather than „exists".
 *
 * A null count renders nothing at all. „We could not tell" and „nobody
 * yet" are different sentences and only one of them is safe to show by
 * mistake.
 */
export function CarrierCount({ count, explain = true, className }: CarrierCountProps) {
  if (count === null) return null;

  const none = count <= 0;

  return (
    <div
      className={[
        'rounded-input border px-4 py-3',
        none ? 'border-border bg-ground-alt' : 'border-success/40 bg-success/8',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-sm">{carrierCountSentence(count)}</p>
      {none ? (
        <Link
          href={ROUTES.routes}
          className="mt-1 inline-block text-sm underline underline-offset-2"
        >
          {CARRIER_COUNT_COPY.zeroLinkLabel}
        </Link>
      ) : null}
      {explain && !none ? (
        <p className="mt-1 text-xs text-muted">{CARRIER_COUNT_COPY.how}</p>
      ) : null}
    </div>
  );
}
