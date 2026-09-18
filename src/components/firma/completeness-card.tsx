import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import type { Completeness } from '@/lib/company-profile';

/**
 * How much of the profile is filled in.
 *
 * A suggestion, never a gate. Nothing on this platform is withheld for an
 * empty profile — a carrier with one still publishes, still bids and still
 * appears on the board — so the card says what completing it *buys* rather
 * than what leaving it costs, and there is no red anywhere on it.
 *
 * The bar is `aria-hidden`; the same number is in the text beside it,
 * because a progress bar read out as "63 percent" of nothing in particular
 * is worse than the sentence.
 */
export function CompletenessCard({ completeness }: { completeness: Completeness }) {
  const c = firmaCopy.completeness;
  const missing = completeness.items.filter((item) => !item.done);

  return (
    <section
      aria-labelledby="completare"
      className="rounded-card border border-border bg-surface p-5"
    >
      <h2 id="completare" className="text-[1.0625rem]">
        {c.title}
      </h2>

      <p className="mt-2 text-sm text-muted">
        {c.progress(`${completeness.done} din ${completeness.total}`)}
      </p>

      <div
        aria-hidden="true"
        className="mt-3 h-1.5 overflow-hidden rounded-pill bg-ground-alt"
      >
        <div
          className="h-full rounded-pill bg-foreground"
          style={{ width: `${completeness.percent}%` }}
        />
      </div>

      <p className="mt-3 max-w-[52ch] text-[0.8125rem] text-muted">{c.lede}</p>

      {missing.length === 0 ? (
        <p className="mt-4 text-sm">{c.done}</p>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium">{c.missing}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {missing.map((item) => (
              <li key={item.label} className="text-[0.8125rem]">
                <Link
                  href={
                    item.tab === 'identitate'
                      ? ROUTES.accountCompany
                      : `${ROUTES.accountCompany}?sectiune=${item.tab}`
                  }
                  className="text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground hover:decoration-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
