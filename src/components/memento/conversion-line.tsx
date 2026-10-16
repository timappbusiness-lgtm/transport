import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';

/**
 * The one calm line a memento screen may carry: a person asked whether
 * they need a car moved, a firm with vans or car transporters told that
 * requests come in here. A sentence at the bottom of the page, never a
 * pop-up, never a banner, never twice.
 */
export function ConversionLine({ kind }: { kind: 'cerere' | 'transport' | null }) {
  if (kind === null) return null;
  const copy = mementoCopy.conversion[kind];
  return (
    <p className="text-small text-muted" data-memento-conversion={kind}>
      {copy.text}{' '}
      <Link
        href={kind === 'cerere' ? ROUTES.newRequest : ROUTES.requests}
        className="text-foreground underline underline-offset-4"
      >
        {copy.link}
      </Link>
    </p>
  );
}
