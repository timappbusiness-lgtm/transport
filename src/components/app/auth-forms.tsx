'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signIn, signUp } from '@/app/actions/auth';
import { ROUTES } from '@/config/routes';
import { initialActionState } from '@/lib/action-state';
import { Field, FormMessage, SubmitButton, inputClasses } from './forms';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initialActionState);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="E-mail" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClasses} />
      </Field>
      <Field label="Parolă" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClasses} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Se verifică…">Intră în cont</SubmitButton>
      <p className="text-sm text-muted">
        Nu ai cont?{' '}
        <Link href={ROUTES.signUp} className="font-medium text-foreground underline underline-offset-4">
          Creează unul
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ defaultType }: { defaultType: 'company' | 'individual' }) {
  const [state, action] = useActionState(signUp, initialActionState);
  if (state?.ok) {
    return <FormMessage state={state} />;
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Tip de cont</legend>
        <label className="flex items-start gap-3 rounded-[6px] border border-border bg-surface p-3 text-sm has-[:checked]:border-accent">
          <input type="radio" name="account_type" value="company" defaultChecked={defaultType === 'company'} className="mt-1" />
          <span>
            <span className="font-medium">Firmă</span>
            <span className="block text-muted">Transportator sau casă de expediții. Verificăm firma și documentele.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-[6px] border border-border bg-surface p-3 text-sm has-[:checked]:border-accent">
          <input type="radio" name="account_type" value="individual" defaultChecked={defaultType === 'individual'} className="mt-1" />
          <span>
            <span className="font-medium">Persoană fizică</span>
            <span className="block text-muted">Ai o mașină de adus acasă. Confirmi doar numărul de telefon.</span>
          </span>
        </label>
      </fieldset>
      <Field label="Nume complet" htmlFor="full_name" error={state?.errors?.full_name}>
        <input id="full_name" name="full_name" autoComplete="name" required aria-invalid={Boolean(state?.errors?.full_name)} className={inputClasses} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={state?.errors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(state?.errors?.email)} className={inputClasses} />
      </Field>
      <Field label="Parolă" htmlFor="password" hint="Cel puțin 10 caractere." error={state?.errors?.password}>
        <input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={Boolean(state?.errors?.password)} className={inputClasses} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Se creează contul…">Creează contul</SubmitButton>
      <p className="text-sm text-muted">
        Ai deja cont?{' '}
        <Link href={ROUTES.signIn} className="font-medium text-foreground underline underline-offset-4">
          Autentifică-te
        </Link>
      </p>
    </form>
  );
}
