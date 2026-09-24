import { ResendConfirmationForm } from '@/components/auth/forms';
import { inscriereCopy } from '@/content/inscriere';
import { validateEmail } from '@/lib/validation/auth';

const c = inscriereCopy.confirmEmail;

/**
 * Right after a firm's sign-up, on the board rather than on a page of its
 * own.
 *
 * Supabase still asks for the e-mail to be confirmed before the first
 * sign-in — that is a rule, and it stays. What changed is where the
 * person waits for it: on real requests, readable, instead of on a page
 * that says only „check your e-mail". The resend is folded away: most
 * people never need it, and the ones who do find it under one tap.
 *
 * The address comes from the address bar, so it is checked before it is
 * shown and never trusted for anything else.
 */
export function ConfirmEmailBanner({ email, next }: { email: string; next: string }) {
  if (validateEmail(email) !== undefined) return null;
  return (
    <div data-confirm-email className="rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
      <p className="font-medium">{c.title}</p>
      <p className="mt-1 text-small text-muted">{c.body(email)}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-small link-accent">{c.resend}</summary>
        <div className="mt-3 max-w-[28rem]">
          <ResendConfirmationForm email={email} next={next} />
        </div>
      </details>
    </div>
  );
}
