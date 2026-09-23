'use client';

import { claimAccountAction, type ClaimState } from '@/app/revendica/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { onboardingCopy } from '@/content/inscrieri';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: ClaimState = {};
const c = onboardingCopy.claim;
const FIELD =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-body font-normal';

/**
 * Unde își alege omul parola.
 *
 * Adresa se cere, nu se completează: previzualizarea o maschează
 * dinadins, ca un token ghicit să nu scoată din bază o adresă de
 * e-mail. Indiciul de sub câmp este exact cât trebuie ca să-ți
 * recunoști propria adresă și prea puțin ca să o afli pe a altcuiva.
 */
export function ClaimForm({
  token,
  emailHint,
  fullName,
}: {
  token: string;
  emailHint: string;
  fullName: string;
}) {
  const [state, action, pending] = useKeptActionState(claimAccountAction, EMPTY);

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  return (
    <KeepingForm action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="full_name" value={fullName} />

      <label className="flex flex-col gap-1.5 text-body font-medium">
        E-mail
        <input type="email" name="email" required autoComplete="email" className={FIELD} />
        <span className="text-small font-normal text-muted">{c.emailHint(emailHint)}</span>
      </label>
      <FormError>{state.fieldErrors?.email}</FormError>

      <label className="flex flex-col gap-1.5 text-body font-medium">
        {c.password}
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={FIELD}
        />
        <span className="text-small font-normal text-muted">{c.passwordHint}</span>
      </label>
      <FormError>{state.fieldErrors?.password}</FormError>

      <label className="flex flex-col gap-1.5 text-body font-medium">
        {c.passwordAgain}
        <input
          type="password"
          name="password_again"
          required
          minLength={8}
          autoComplete="new-password"
          className={FIELD}
        />
      </label>
      <FormError>{state.fieldErrors?.password_again}</FormError>

      <label className="flex items-start gap-2.5 text-small">
        <input type="checkbox" name="terms" className="mt-0.5" />
        <span>
          Am citit și accept{' '}
          <a href={ROUTES.terms} className="link-accent">
            Termenii
          </a>{' '}
          și{' '}
          <a href={ROUTES.privacy} className="link-accent">
            Politica de confidențialitate
          </a>
          .
        </span>
      </label>
      <FormError>{state.fieldErrors?.terms}</FormError>

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {pending ? c.working : c.submit}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
