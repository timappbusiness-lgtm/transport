import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UploadHarness } from '@/components/uploads/upload-harness';

export const metadata: Metadata = {
  title: 'Probă: încărcări',
  robots: { index: false, follow: false },
};

/** Read at request time: the harness exists only on a server started for the browser tests. */
export const dynamic = 'force-dynamic';

/**
 * The upload queue on its own, for `tests/e2e/incarcari.spec.ts`.
 *
 * Every real upload screen needs a session and a bucket, which the
 * sandbox and CI do not have. What the browser tests must prove — a
 * failed upload keeps its file and retries it, a reload mid-upload keeps
 * the files and stores none twice — lives in `useUploadQueue`, IndexedDB
 * and `UploadLine`, and those are what this page renders, unchanged. Only
 * the server is the test's: Playwright answers the requests.
 *
 * A 404 unless the server was started with E2E_HARNESS=1, which only
 * `playwright.config.ts` does.
 */
export default function Page() {
  if (process.env.E2E_HARNESS !== '1') notFound();
  return (
    <div className="mx-auto max-w-[40rem] px-4 py-8">
      <UploadHarness />
    </div>
  );
}
