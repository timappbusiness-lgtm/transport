'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import type { ActionState } from '@/lib/action-state';
import { safeNext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { ok: false, message: 'Completează e-mailul și parola.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      ok: false,
      message:
        error.code === 'email_not_confirmed'
          ? 'Confirmă adresa de e-mail din mesajul primit, apoi autentifică-te.'
          : 'E-mail sau parolă greșite.',
    };
  }
  redirect(safeNext(formData.get('next')));
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const accountType = formData.get('account_type') === 'individual' ? 'individual' : 'company';

  const errors: Record<string, string> = {};
  if (fullName.length < 3) errors.full_name = 'Scrie numele complet.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Adresă de e-mail invalidă.';
  if (password.length < 10) errors.password = 'Parola trebuie să aibă cel puțin 10 caractere.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, account_type: accountType },
      emailRedirectTo: `${await origin()}${ROUTES.authConfirm}?next=${encodeURIComponent(ROUTES.account)}`,
    },
  });
  if (error) {
    return {
      ok: false,
      message: error.code === 'weak_password' ? 'Parola este prea slabă.' : 'Contul nu a putut fi creat. Încearcă din nou.',
    };
  }
  return {
    ok: true,
    message: `Ți-am trimis un e-mail la ${email}. Deschide linkul din el ca să confirmi adresa, apoi autentifică-te.`,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.home);
}
