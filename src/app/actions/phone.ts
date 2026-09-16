'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import type { ActionState } from '@/lib/action-state';
import { requireSession } from '@/lib/auth';

/** +40 7xx xxx xxx, 07xx xxx xxx -> +407xxxxxxxx. Other countries keep their prefix. */
function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s().-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^0\d{9}$/.test(s)) s = `+40${s.slice(1)}`;
  return /^\+\d{9,15}$/.test(s) ? s : null;
}

/**
 * Supabase sends the code by SMS; confirming it sets phone_confirmed_at on
 * auth.users, which a database trigger mirrors into profiles.phone_verified.
 * The app never writes phone_verified itself.
 */
export async function sendPhoneCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  if (!phone) return { ok: false, errors: { phone: 'Număr de telefon invalid.' } };

  const { error } = await supabase.auth.updateUser({ phone });
  if (error) {
    return {
      ok: false,
      message:
        error.code === 'phone_provider_disabled' || /provider|sms/i.test(error.message)
          ? 'Trimiterea SMS-urilor nu este încă activă pe platformă. Revino în curând.'
          : 'Nu am putut trimite codul. Verifică numărul și încearcă din nou.',
    };
  }
  return { ok: true, message: `Ți-am trimis un cod prin SMS la ${phone}.` };
}

export async function confirmPhoneCode(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const token = String(formData.get('code') ?? '').replace(/\s/g, '');
  if (!phone || !/^\d{6}$/.test(token)) return { ok: false, errors: { code: 'Codul are 6 cifre.' } };

  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });
  if (error) return { ok: false, message: 'Cod greșit sau expirat.' };
  revalidatePath(ROUTES.account, 'layout');
  return { ok: true, message: 'Telefonul a fost confirmat.' };
}
