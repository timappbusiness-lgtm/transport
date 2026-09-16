'use client';

import { useActionState } from 'react';
import type { AuthActionState } from '@/app/auth-actions';
import {
  signInAction,
  signUpCompanyAction,
  signUpIndividualAction,
  requestPasswordResetAction,
  resendConfirmationAction,
  updatePasswordAction,
} from '@/app/auth-actions';
import { authCopy } from '@/content/auth';
import { ROUTES } from '@/config/routes';
import { Field, FormError, FormNotice, SubmitButton, TextLink } from './form';

const EMPTY: AuthActionState = {};

/** Terms checkbox, identical on both sign-up forms. */
function TermsCheckbox({ label, error }: { label: string; error?: string | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          name="terms"
          value="yes"
          className="mt-0.5 size-4 flex-none accent-accent"
        />
        <span>
          {label} <TextLink href={ROUTES.terms}>{authCopy.individualSignUp.termsLink}</TextLink>{' '}
          {authCopy.individualSignUp.and}{' '}
          <TextLink href={ROUTES.privacy}>{authCopy.individualSignUp.privacyLink}</TextLink>.
        </span>
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, EMPTY);
  const c = authCopy.signIn;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError>{state.error}</FormError>
      <Field
        label={c.email}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label={c.password}
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <div className="-mt-1 text-right text-sm">
        <TextLink href={ROUTES.resetPassword}>{c.forgot}</TextLink>
      </div>
      <SubmitButton>{c.submit}</SubmitButton>
    </form>
  );
}

function SignUpForm({
  action,
  copy,
}: {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  copy: typeof authCopy.individualSignUp | typeof authCopy.companySignUp;
}) {
  const [state, formAction] = useActionState(action, EMPTY);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <Field
        label={copy.fullName}
        name="fullName"
        autoComplete="name"
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
      />
      <Field
        label={copy.email}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label={copy.password}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={copy.passwordHint}
        error={state.fieldErrors?.password}
      />
      <TermsCheckbox label={copy.terms} error={state.fieldErrors?.terms} />
      <SubmitButton>{copy.submit}</SubmitButton>
    </form>
  );
}

export function IndividualSignUpForm() {
  return <SignUpForm action={signUpIndividualAction} copy={authCopy.individualSignUp} />;
}

export function CompanySignUpForm() {
  return <SignUpForm action={signUpCompanyAction} copy={authCopy.companySignUp} />;
}

export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmationAction, EMPTY);
  const c = authCopy.confirmEmail;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <Field
        label={c.emailLabel}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton>{c.resend}</SubmitButton>
    </form>
  );
}

export function RequestPasswordResetForm() {
  const [state, action] = useActionState(requestPasswordResetAction, EMPTY);
  const c = authCopy.resetPassword;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <Field
        label={c.email}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton>{c.submit}</SubmitButton>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState(updatePasswordAction, EMPTY);
  const c = authCopy.newPassword;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <Field
        label={c.password}
        name="password"
        type="password"
        autoComplete="new-password"
        hint={c.passwordHint}
        error={state.fieldErrors?.password}
      />
      <SubmitButton>{c.submit}</SubmitButton>
    </form>
  );
}
