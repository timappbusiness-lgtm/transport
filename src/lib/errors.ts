/**
 * Turning failures into something a Romanian dispatcher can act on.
 *
 * The database already speaks Romanian: every guard and RPC in
 * `supabase/migrations` raises a written message ("Cont suspendat sau
 * neverificat…"). Those are shown as they are. Anything we do not
 * recognise gets a generic line and is logged, so a stack trace or a
 * Postgres internal never reaches a customer.
 */

export interface AppError {
  message: string;
  /** True when the message came from our own database rules. */
  fromDatabase: boolean;
}

/**
 * Whether a message is a plan running out rather than something broken.
 *
 * `consume_contact_access` and the listing guards raise 42501 with a
 * Romanian sentence about the limit. A wall with no door in it is worse
 * than the limit itself, so the form that shows one of these adds a link to
 * /abonamente — and this is the test for which messages get it.
 */
export function isQuotaError(message: string): boolean {
  return /\b(limita|limită)\b/i.test(message) && /\bplan\b/i.test(message);
}

export const GENERIC_ERROR =
  'A apărut o eroare neașteptată. Încearcă din nou în câteva momente.';

/** Postgres SQLSTATEs our migrations raise on purpose. */
const KNOWN_CODES = new Set([
  '42501', // insufficient_privilege — suspended account, wrong role, quota
  '23502', // not_null_violation — missing details row before publishing
  '23505', // unique_violation — duplicate invitation, duplicate membership
  '23514', // check_violation — platform overbooked, invalid combination
  'P0002', // no_data_found — record missing
  '22023', // invalid_parameter_value
]);

interface PostgrestLike {
  message?: unknown;
  code?: unknown;
  details?: unknown;
}

function isPostgrestLike(error: unknown): error is PostgrestLike {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Supabase Auth errors, which are English and not always self-explanatory.
 * Rate limiting matters most: the user needs to know to wait, not to retry.
 */
const AUTH_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /invalid login credentials/i,
    'E-mail sau parolă greșită.',
  ],
  [
    /email not confirmed/i,
    'Confirmă adresa de e-mail înainte de autentificare. Verifică-ți inbox-ul.',
  ],
  [
    /user already registered|already been registered/i,
    'Există deja un cont cu această adresă. Autentifică-te sau resetează parola.',
  ],
  [
    /for security purposes.*(\d+)\s*seconds?|only request this after/i,
    'Ai cerut prea multe coduri. Mai așteaptă puțin și încearcă din nou.',
  ],
  [
    /rate limit|too many requests|over_email_send_rate_limit|over_request_rate_limit/i,
    'Prea multe încercări. Așteaptă câteva minute și încearcă din nou.',
  ],
  [
    /token has expired|otp_expired|invalid.*otp|token.*invalid/i,
    'Codul a expirat sau nu este corect. Cere unul nou.',
  ],
  [
    /password should be at least/i,
    'Parola este prea scurtă.',
  ],
  [
    /same.?password|New password should be different/i,
    'Noua parolă trebuie să fie diferită de cea veche.',
  ],
  [
    /weak.?password/i,
    'Parola este prea slabă. Alege una mai lungă.',
  ],
];

/**
 * Converts any thrown value into a message safe to render.
 *
 * `context` is a short label used only for the server-side log line; it must
 * never contain personal data (no e-mail addresses, no phone numbers).
 */
export function toAppError(error: unknown, context: string): AppError {
  if (isPostgrestLike(error)) {
    const message = typeof error.message === 'string' ? error.message : '';
    const code = typeof error.code === 'string' ? error.code : '';

    if (KNOWN_CODES.has(code) && message !== '') {
      return { message, fromDatabase: true };
    }

    for (const [pattern, translated] of AUTH_MESSAGES) {
      if (pattern.test(message)) {
        return { message: translated, fromDatabase: false };
      }
    }

    console.error(`[${context}] unhandled error`, { code, message });
    return { message: GENERIC_ERROR, fromDatabase: false };
  }

  console.error(`[${context}] unknown error`, error);
  return { message: GENERIC_ERROR, fromDatabase: false };
}
