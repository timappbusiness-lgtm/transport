import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { onboardingCopy } from '@/content/onboarding';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: onboardingCopy.intro.title,
  description:
    'Ce urmează dacă te înscrii ca transportator: contul, panoul de cereri și dosarul firmei, cu timpul de care ai nevoie.',
};

const c = onboardingCopy.intro;

/**
 * What a carrier reads before being asked for anything.
 *
 * This address has been on printed material since before the site had
 * this page, and it used to redirect straight into a form. A dispatcher
 * who arrives from a leaflet and meets a form does not know what the
 * form is for, how long it takes, or what happens after — and a form
 * that cannot answer those three questions is a form people close.
 *
 * Five lines, three steps and one honest duration. The duration is
 * about the typing, which we control. There is no sentence here about
 * how long a verification takes, because nothing on the platform
 * measures that and a number nobody can keep is worse than no number.
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[36rem] px-[clamp(16px,4vw,56px)] py-12 sm:py-16">
      <h1 className="text-h1">{c.title}</h1>
      <p className="mt-3 text-body-lg text-muted">{c.lede}</p>

      <ol className="mt-8 flex flex-col gap-4">
        {c.steps.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-8 flex-none items-center justify-center rounded-pill border border-border-strong font-mono text-label tabular-nums"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{step.title}</p>
              <p className="mt-0.5 text-small text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 rounded-card border border-border bg-surface p-4 text-small shadow-card">
        {c.duration}
        <span className="mt-1 block text-muted">{c.durationNote}</span>
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* The carrier type travels with the link, as it always has: this
            address is printed on material already in circulation. */}
        <Link
          href={`${ROUTES.signUpCompany}?tip=transport`}
          className={cn(buttonClasses('primary', 'md'))}
        >
          {c.cta}
        </Link>
        <Link href={ROUTES.requests} className={buttonClasses('secondary', 'md')}>
          {c.browse}
        </Link>
      </div>

      <p className="mt-6 text-small text-muted">
        {c.hasAccount}{' '}
        <Link href={ROUTES.signIn} className="text-foreground underline underline-offset-4">
          {c.signIn}
        </Link>
      </p>
    </div>
  );
}
