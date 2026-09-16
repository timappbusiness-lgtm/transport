import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { BRAND_NAME } from '@/config/brand';

/**
 * Holding page. The real homepage is a separate, fully specified task and
 * is deliberately not started here — this exists so phase 0 has something
 * to deploy and the repo-to-Vercel pipeline can be proved end to end.
 */
export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[1120px] flex-col justify-center px-4 py-20 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
        Faza 0 · fundație tehnică
      </p>

      <h1 className="mt-4 text-4xl sm:text-6xl">{BRAND_NAME}</h1>

      <p className="mt-4 max-w-[52ch] text-base text-muted sm:text-lg">
        Bursă de transport auto pentru România și Europa. Pagina publică este
        în construcție.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/demo"
          className={buttonClasses('primary', 'md')}
        >
          Vezi macheta de design
        </Link>
      </div>

      <div className="mt-12 rounded-[8px] border border-border bg-surface p-5">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted">
          Stare
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>
            <span className="text-success">✓</span> Next.js, TypeScript strict,
            Tailwind, Vitest, Playwright
          </li>
          <li>
            <span className="text-warning">•</span> Pagina publică — task
            separat, specificat
          </li>
        </ul>
      </div>
    </main>
  );
}
