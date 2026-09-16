/**
 * Form validation, hand-written rather than pulling in a schema library.
 *
 * Two reasons: the rules here are few and specific, and every message is
 * Romanian copy that belongs next to the rule it explains rather than in a
 * translation map. The database remains the real validator — these checks
 * exist so the user is told what is wrong before a round trip.
 */

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export interface ValidationResult<T extends string> {
  ok: boolean;
  errors: FieldErrors<T>;
}

/** Supabase Auth's own minimum is 6; we ask for more without being silly. */
export const MIN_PASSWORD_LENGTH = 8;

// Deliberately permissive. A stricter pattern rejects valid addresses far
// more often than it catches typos, and confirmation by e-mail is the real
// check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (email === '') return 'Introdu adresa de e-mail.';
  if (!EMAIL.test(email)) return 'Adresa de e-mail nu pare validă.';
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (value === '') return 'Alege o parolă.';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
  }
  return undefined;
}

export function validateFullName(value: string): string | undefined {
  const name = value.trim();
  if (name === '') return 'Introdu numele tău.';
  if (name.length < 3) return 'Numele pare prea scurt.';
  return undefined;
}

/**
 * Romanian CUI: 2 to 10 digits, optionally prefixed with RO and any spacing.
 * The control digit is checked by ANAF, not here — a typo that passes this
 * check fails the lookup, which is the better error message anyway.
 */
export function normaliseCui(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function validateCui(value: string): string | undefined {
  const digits = normaliseCui(value);
  if (digits === '') return 'Introdu CUI-ul firmei.';
  if (digits.length < 2 || digits.length > 10) {
    return 'CUI-ul are între 2 și 10 cifre.';
  }
  return undefined;
}

/**
 * Romanian mobile numbers, to E.164. Accepts 07xx…, 407xx…, +407xx… with
 * any spaces, dots or dashes. Returns null when it is not a Romanian mobile.
 */
export function normalisePhone(value: string): string | null {
  const digits = value.replace(/[^0-9+]/g, '').replace(/^\+/, '');
  let national: string | null = null;

  if (/^07\d{8}$/.test(digits)) national = digits.slice(1);
  else if (/^407\d{8}$/.test(digits)) national = digits.slice(2);
  else if (/^7\d{8}$/.test(digits)) national = digits;

  return national ? `+40${national}` : null;
}

export function validatePhone(value: string): string | undefined {
  if (value.trim() === '') return 'Introdu numărul de telefon.';
  if (normalisePhone(value) === null) {
    return 'Numărul nu pare un număr de mobil din România.';
  }
  return undefined;
}

export function validateOtp(value: string): string | undefined {
  const code = value.replace(/\s/g, '');
  if (code === '') return 'Introdu codul primit prin SMS.';
  if (!/^\d{6}$/.test(code)) return 'Codul are 6 cifre.';
  return undefined;
}

// ---------------------------------------------------------------------
// Form-level validators
// ---------------------------------------------------------------------

export type IndividualSignUpField = 'fullName' | 'email' | 'password' | 'terms';

export function validateIndividualSignUp(input: {
  fullName: string;
  email: string;
  password: string;
  terms: boolean;
}): ValidationResult<IndividualSignUpField> {
  const errors: FieldErrors<IndividualSignUpField> = {};

  const fullName = validateFullName(input.fullName);
  if (fullName) errors.fullName = fullName;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  if (!input.terms) {
    errors.terms = 'Confirmă că ai citit termenii și politica de confidențialitate.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export type SignInField = 'email' | 'password';

export function validateSignIn(input: {
  email: string;
  password: string;
}): ValidationResult<SignInField> {
  const errors: FieldErrors<SignInField> = {};

  const email = validateEmail(input.email);
  if (email) errors.email = email;
  // No length rule on sign-in: the password was accepted at sign-up, and
  // telling someone their existing password is "too short" is nonsense.
  if (input.password === '') errors.password = 'Introdu parola.';

  return { ok: Object.keys(errors).length === 0, errors };
}

export type CompanyDetailsField = 'cui' | 'legalName' | 'companyType';

export const COMPANY_TYPES = ['transport', 'expeditie', 'both'] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export function isCompanyType(value: unknown): value is CompanyType {
  return typeof value === 'string' && (COMPANY_TYPES as readonly string[]).includes(value);
}

export function validateCompanyDetails(input: {
  cui: string;
  legalName: string;
  companyType: string;
}): ValidationResult<CompanyDetailsField> {
  const errors: FieldErrors<CompanyDetailsField> = {};

  const cui = validateCui(input.cui);
  if (cui) errors.cui = cui;
  if (input.legalName.trim() === '') errors.legalName = 'Introdu denumirea firmei.';
  if (!isCompanyType(input.companyType)) {
    errors.companyType = 'Alege tipul de activitate.';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
