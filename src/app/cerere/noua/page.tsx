import type { Metadata } from 'next';
import { RequestForm } from '@/components/requests/request-form';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { getAccountContext } from '@/lib/auth/account';
import { safeNextPath } from '@/lib/auth/next-path';
import { hasPrefill, parsePrefill } from '@/lib/price-prefill';
import { draftFromPrefill, emptyDraft, isoToday, type RequestDraft } from '@/lib/request-form';

export const metadata: Metadata = {
  title: requestsCopy.form.title,
  description:
    'Publică gratuit o cerere de transport auto. Ruta, vehiculul și starea lui; transportatorii verificați o văd pe panou.',
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The clock and the session, read outside the component.
 *
 * A component that calls `new Date()` while rendering is impure, and the
 * lint rule that says so is right: the same render would produce a
 * different tree a second later. The date the form needs is today's, taken
 * once here and passed down.
 */
async function loadForm(params: SearchParams): Promise<{
  initial: RequestDraft;
  prefilled: boolean;
  today: string;
  signedIn: boolean;
  returnTo: string;
}> {
  const prefill = parsePrefill(params);
  const prefilled = hasPrefill(prefill);
  const context = await getAccountContext();

  // Sign-in has to come back to the same link, prefill and all, or the
  // calculator's choices are lost exactly where they were about to be used.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string' && single !== '') query.set(key, single);
  }
  const search = query.toString();

  return {
    initial: prefilled ? draftFromPrefill(prefill) : emptyDraft(),
    prefilled,
    today: isoToday(new Date()),
    signedIn: context !== null,
    returnTo: safeNextPath(
      search === '' ? ROUTES.newRequest : `${ROUTES.newRequest}?${search}`,
      ROUTES.newRequest,
    ),
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { initial, prefilled, today, signedIn, returnTo } = await loadForm(await searchParams);
  const c = requestsCopy.form;

  return (
    <div className="mx-auto w-full max-w-[52rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.title} className="mt-5" />
        <Lede className="mt-4">{c.lede}</Lede>
        <p className="mt-3">
          <HelpLink topic="requestForm" />
        </p>
      </header>

      <section className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-7">
        <RequestForm
          initial={initial}
          hasPrefill={prefilled}
          today={today}
          signedIn={signedIn}
          returnTo={returnTo}
        />
      </section>
    </div>
  );
}
