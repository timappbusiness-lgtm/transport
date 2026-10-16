import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MementoStarter } from '@/components/memento/starter';
import { EyebrowPill, Headline } from '@/components/ui/primitives';
import { mementoCopy } from '@/content/memento';
import { getAccountContext } from '@/lib/auth/account';

const c = mementoCopy.landing;

export const metadata: Metadata = {
  title: c.title,
  description: c.metaDescription,
};

/**
 * „Memento expirări auto", for anybody.
 *
 * Three lines of why, then the form: the plate, the dates, and only then
 * the account — the draft waits in the browser through sign-up, and the
 * memento is saved the moment there is somewhere to save it.
 *
 * Quiet on purpose: no accent, no badge, nothing that looks like the
 * platform vouching for a document. These are dates the person writes.
 */
export default async function Page() {
  const context = await getAccountContext();
  const signedIn = context !== null;

  return (
    <div className="mx-auto w-full max-w-[52rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14" data-memento-landing>
      <header className="max-w-[46rem]">
        <EyebrowPill tone="quiet">{c.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.title} className="mt-5" />
        <ul className="mt-5 flex flex-col gap-2 text-body-lg text-foreground" data-memento-benefits>
          {c.benefits.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="mt-[0.7em] size-1.5 flex-none rounded-full bg-border-strong" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-small text-muted">{c.note}</p>
      </header>

      <section className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-7">
        {/* Keyed on the account state: back from sign-up is the same page
            with a session, and the form starts again from the draft. */}
        <Suspense>
          <MementoStarter key={signedIn ? 'cont' : 'vizitator'} signedIn={signedIn} />
        </Suspense>
      </section>
    </div>
  );
}
