import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { appCopy } from '@/content/app';

const c = appCopy.errors.notFound;

export const metadata: Metadata = { title: c.title, robots: { index: false, follow: true } };

/**
 * Every 404 on the site, in Romanian.
 *
 * Without this file Next.js drew its own page, in English, for a missing
 * request, a staff screen refused to a visitor and a mistyped address
 * alike. Formal like every error screen here: no accent, no icon, the
 * way back in ink.
 */
export default function NotFound() {
  return (
    <div
      data-error-screen="not-found"
      className="mx-auto w-full max-w-[40rem] px-[clamp(16px,4vw,56px)] py-16 sm:py-24"
    >
      <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">404</p>
      <h1 className="mt-3 text-h1">{c.title}</h1>
      <p className="mt-4 text-body text-muted">{c.body}</p>
      <Link href={ROUTES.home} className={`${buttonClasses('ink', 'md')} mt-8`}>
        {c.action}
      </Link>
    </div>
  );
}
