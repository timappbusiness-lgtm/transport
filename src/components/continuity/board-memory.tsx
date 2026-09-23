'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { boardHref, rememberBoard } from '@/lib/continuity/board-return';
import { browserStorage } from '@/lib/continuity/drafts';

/** On a board: remembers its filters and page for this tab. Draws nothing. */
export function RememberBoard({ board }: { board: string }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  useEffect(() => {
    rememberBoard(browserStorage('session'), board, query);
  }, [board, query]);
  return null;
}

function subscribeNothing() {
  return () => {};
}

/**
 * „← Înapoi la …", to the board as it was left: the same filters, the
 * same page. The plain board on the server and before hydration.
 */
export function BackToBoard({
  board,
  className,
  children,
}: {
  board: string;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  const href = useSyncExternalStore(
    subscribeNothing,
    () => boardHref(browserStorage('session'), board),
    () => board,
  );
  return (
    <Link href={href} data-back-to-board className={className}>
      {children}
    </Link>
  );
}
