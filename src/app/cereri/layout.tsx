import { Suspense } from 'react';
import { DraftDone } from '@/components/continuity/draft-done';

/**
 * The boards and their detail pages. The one thing added to them is the
 * clean-up of a finished draft (`?gata=`): a forwarder who saves the firm
 * is sent back here, not into the account area where that usually runs.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <DraftDone />
      </Suspense>
    </>
  );
}
