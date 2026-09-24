import type { Metadata } from 'next';
import { RequestForm } from '@/components/requests/request-form';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { requestsCopy } from '@/content/cereri';
import { getAccountContext } from '@/lib/auth/account';
import type { DraftEnvelope } from '@/lib/continuity/drafts';
import { readServerDraft } from '@/lib/continuity/server-drafts';
import { parseStoredRequest, type StoredRequest } from '@/lib/draft-store';
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
  serverDraft: DraftEnvelope<StoredRequest> | null;
  accountPhone: string | null;
}> {
  const prefill = parsePrefill(params);
  const prefilled = hasPrefill(prefill);
  const context = await getAccountContext();

  // Signed in: the draft may have been started on the other device. Read
  // here, it is the first thing drawn rather than something that appears.
  let serverDraft: DraftEnvelope<StoredRequest> | null = null;
  if (context !== null && !prefilled) {
    const found = await readServerDraft(context.user.id, 'cerere', '');
    const payload = found === null ? null : parseStoredRequest(found.payload);
    if (found !== null && payload !== null) serverDraft = { ...found, payload };
  }

  return {
    initial: prefilled ? draftFromPrefill(prefill) : emptyDraft(),
    prefilled,
    today: isoToday(new Date()),
    signedIn: context !== null,
    serverDraft,
    accountPhone: context?.profile?.phone ?? null,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { initial, prefilled, today, signedIn, serverDraft, accountPhone } = await loadForm(await searchParams);
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
        {/* Keyed on the account state: coming back from sign-in is the
            same page with a session, and the form has to start again
            from the draft — with the account copy and the account step
            done — rather than keep the state it had without one. */}
        <RequestForm
          key={signedIn ? 'cont' : 'vizitator'}
          initial={initial}
          hasPrefill={prefilled}
          today={today}
          signedIn={signedIn}
          serverDraft={serverDraft}
          accountPhone={accountPhone}
        />
      </section>
    </div>
  );
}
