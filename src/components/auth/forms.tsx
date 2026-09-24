'use client';

import { withNext } from '@/lib/auth/next-path';
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
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { Field, FormError, FormNotice, SubmitButton, TextLink } from './form';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: AuthActionState = {};

/** Terms checkbox, identical on both sign-up forms. */
function TermsCheckbox({ label, error }: { label: string; error?: string | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2.5 text-body text-muted">
        <input
          type="checkbox"
          name="terms"
          value="yes"
          className="mt-0.5 size-4 flex-none accent-foreground"
        />
        <span>
          {label} <TextLink href={ROUTES.terms}>{authCopy.individualSignUp.termsLink}</TextLink>{' '}
          {authCopy.individualSignUp.and}{' '}
          <TextLink href={ROUTES.privacy}>{authCopy.individualSignUp.privacyLink}</TextLink>.{' '}
          {/* The version is on the page because it is what we store. A
              consent record that says "accepted the terms" without saying
              which terms is a record of nothing. */}
          <span className="text-small">(versiunea {CURRENT_TERMS_VERSION})</span>
        </span>
      </label>
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useKeptActionState(signInAction, EMPTY);
  const c = authCopy.signIn;

  return (
    <KeepingForm action={action} className="flex flex-col gap-4" noValidate>
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
      <div className="-mt-1 text-right text-body">
        <TextLink href={withNext(ROUTES.resetPassword, next)}>{c.forgot}</TextLink>
      </div>
      <SubmitButton>{c.submit}</SubmitButton>
    </KeepingForm>
  );
}

function SignUpForm({
  action,
  copy,
  withPhone = false,
  next = '',
}: {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  copy: typeof authCopy.individualSignUp | typeof authCopy.companySignUp;
  /** Both are asked for a number now: it is the one a client or a carrier rings. */
  withPhone?: boolean;
  /** Where the confirmation link should come back to. */
  next?: string;
}) {
  const [state, formAction] = useKeptActionState(action, EMPTY);

  return (
    <KeepingForm action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
      {withPhone ? (
        <Field
          label={copy.phone}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint={copy.phoneHint}
          defaultValue={state.values?.phone}
          error={state.fieldErrors?.phone}
        />
      ) : null}
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
    </KeepingForm>
  );
}

export function IndividualSignUpForm({ next = '' }: { next?: string }) {
  return (
    <SignUpForm
      action={signUpIndividualAction}
      copy={authCopy.individualSignUp}
      withPhone
      next={next}
    />
  );
}

export function CompanySignUpForm({ next = '' }: { next?: string }) {
  return <SignUpForm action={signUpCompanyAction} copy={authCopy.companySignUp} withPhone next={next} />;
}

export function ResendConfirmationForm({ email, next = '' }: { email: string; next?: string }) {
  const [state, action] = useKeptActionState(resendConfirmationAction, EMPTY);
  const c = authCopy.confirmEmail;

  return (
    <KeepingForm action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
    </KeepingForm>
  );
}

export function RequestPasswordResetForm({ next = '' }: { next?: string }) {
  const [state, action] = useKeptActionState(requestPasswordResetAction, EMPTY);
  const c = authCopy.resetPassword;

  return (
    <KeepingForm action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
    </KeepingForm>
  );
}

export function NewPasswordForm({ next = '' }: { next?: string }) {
  const [state, action] = useKeptActionState(updatePasswordAction, EMPTY);
  const c = authCopy.newPassword;

  return (
    <KeepingForm action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
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
    </KeepingForm>
  );
}
