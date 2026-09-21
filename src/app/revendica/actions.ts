'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { toAppError } from '@/lib/errors';
import { matchesHint } from '@/lib/onboarding';
import { validatePassword } from '@/lib/validation/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Preluarea contului.
 *
 * Aici se vede de ce nu creează echipa niciun cont: pasul acesta este o
 * înregistrare obișnuită, cu `supabase.auth.signUp`, exact ca a oricui
 * altcuiva. Singura deosebire este că adresa **nu** vine din formular,
 * ci din tokenul din adresa paginii — deci cineva care găsește linkul nu
 * îl poate folosi decât dacă are și cutia poștală a firmei.
 *
 * Abia după ce există sesiunea se cheamă `claim_assisted_onboarding()`,
 * care compară încă o dată adresa contului cu cea pentru care a fost
 * emis linkul. Frontendul nu este graniță; funcția aceea este.
 */

export interface ClaimState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '');
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto = headerList.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

export async function claimAccountAction(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const token = text(formData, 'token').trim();
  const password = text(formData, 'password');
  const again = text(formData, 'password_again');
  const terms = formData.get('terms') !== null;

  if (token === '') return { error: 'Linkul nu mai este valabil.' };
  if (!terms) return { fieldErrors: { terms: 'Ca să continui, trebuie să accepți termenii.' } };

  const passwordError = validatePassword(password);
  if (passwordError) return { fieldErrors: { password: passwordError } };
  if (password !== again) {
    return { fieldErrors: { password_again: 'Cele două parole nu sunt la fel.' } };
  }

  const supabase = await createClient();

  // The address comes from the token, never from the form. The preview
  // is the same call the page made to render itself; asking again here
  // means a link that expired while somebody was typing is refused.
  const { data: preview, error: previewError } = await supabase.rpc(
    'assisted_onboarding_preview',
    { p_token: token },
  );
  const row = (preview as { email_hint: string }[] | null)?.[0];
  if (previewError || row === undefined) {
    return { error: 'Linkul nu mai este valabil. Cere-i echipei unul nou.' };
  }

  const email = text(formData, 'email').trim().toLowerCase();
  // Checked here rather than left to the claim, so a typed address that
  // is not the right one never reaches `signUp` and never leaves a
  // half-made account behind. It reveals nothing the hint on the page
  // was not already showing.
  if (!matchesHint(email, row.email_hint)) {
    return {
      fieldErrors: {
        email: `Adresa nu este cea pentru care am pregătit contul (${row.email_hint}).`,
      },
    };
  }

  const { data: session } = await supabase.auth.getUser();

  // Already signed in — the second half of a claim that paused for an
  // e-mail confirmation. Nothing to create.
  if (session.user === null) {
    const origin = await siteOrigin();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
          `${ROUTES.claimAccount}/${token}`,
        )}`,
        data: {
          full_name: text(formData, 'full_name').trim(),
          account_type: 'company',
          terms_version: CURRENT_TERMS_VERSION,
        },
      },
    });
    if (signUpError) {
      return { error: toAppError(signUpError, 'revendica.signUp').message };
    }

    // When confirmations are off, signUp signs the person in and this
    // succeeds; when they are on, it fails and the page says to go and
    // confirm. Either way nothing is claimed without a session.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return {
        notice:
          'Ți-am trimis un e-mail de confirmare. Deschide-l, apoi revino la linkul acesta ca să termini preluarea.',
      };
    }
  }

  const { error: claimError } = await supabase.rpc('claim_assisted_onboarding', {
    p_token: token,
  });
  if (claimError) return { error: toAppError(claimError, 'revendica.claim').message };

  await supabase.rpc('accept_terms', { p_version: CURRENT_TERMS_VERSION });

  redirect(`${ROUTES.account}?preluat=1`);
}
