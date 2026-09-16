'use client';

import { useActionState } from 'react';
import {
  changeEmailAction,
  changePasswordAction,
  updateProfileAction,
  type ActionState,
} from '@/app/cont/actions';
import { signOutEverywhereAction } from '@/app/auth-actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { accountCopy } from '@/content/account';

const EMPTY: ActionState = {};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-4 text-[1.0625rem]">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function NameForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfileAction, EMPTY);
  const c = accountCopy.profile;

  return (
    <Card title={c.title}>
      <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>
        <Field
          label={c.name}
          name="fullName"
          autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName}
          error={state.fieldErrors?.fullName}
        />
        <SubmitButton>{c.save}</SubmitButton>
      </form>
    </Card>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action] = useActionState(changeEmailAction, EMPTY);
  const c = accountCopy.profile;

  return (
    <Card title={c.changeEmail}>
      <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>
        <p className="text-sm text-muted">
          {c.email}: <span className="font-mono text-foreground">{email}</span>
        </p>
        <Field
          label={c.newEmail}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint={c.changeEmailHint}
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <SubmitButton>{c.save}</SubmitButton>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, EMPTY);
  const c = accountCopy.profile;

  return (
    <Card title={c.changePassword}>
      <form action={action} className="flex max-w-sm flex-col gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>
        <Field
          label={c.currentPassword}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={state.fieldErrors?.currentPassword}
        />
        <Field
          label={c.newPassword}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.newPassword}
        />
        <SubmitButton>{c.save}</SubmitButton>
      </form>
    </Card>
  );
}

export function SignOutEverywhere() {
  const c = accountCopy.profile;
  return (
    <Card title={c.signOutEverywhere}>
      <form action={signOutEverywhereAction} className="flex flex-col gap-3">
        <p className="max-w-[54ch] text-sm text-muted">{c.signOutEverywhereHint}</p>
        <button type="submit" className={`${buttonClasses('secondary', 'md')} self-start`}>
          {c.signOutEverywhere}
        </button>
      </form>
    </Card>
  );
}
