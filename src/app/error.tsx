'use client';

import Link from 'next/link';
import { Button, buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { appCopy } from '@/content/app';

const c = appCopy.errors.failed;

/**
 * What a page shows when it throws, in Romanian rather than Next.js's
 * „Application error". Formal: no accent, no icon, no detail about what
 * failed — the digest is in the server log, not on the screen.
 */
export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <div
      data-error-screen="failed"
      className="mx-auto w-full max-w-[40rem] px-[clamp(16px,4vw,56px)] py-16 sm:py-24"
    >
      <h1 className="text-h1">{c.title}</h1>
      <p className="mt-4 text-body text-muted">{c.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="ink" onClick={() => reset()}>
          {c.action}
        </Button>
        <Link href={ROUTES.home} className={buttonClasses('secondary', 'md')}>
          {c.home}
        </Link>
      </div>
    </div>
  );
}
