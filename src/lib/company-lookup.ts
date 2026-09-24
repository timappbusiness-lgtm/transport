import { countyCodeFor, countyName } from './counties';

/**
 * The CUI autofill: when to ask ANAF, and what its answer means for the form.
 *
 * `verify-cui-anaf` does the asking (supabase/functions/verify-cui-anaf);
 * this reads the answer. Every outcome is a state the form can say
 * something about — found, not found, a typo, ANAF down — because a lookup
 * that fails silently looks exactly like a CUI nobody has.
 */

/** Digits only: „RO 14 399 840" → „14399840". */
export function cuiDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/**
 * The CUI's last digit is a control digit: the others, right-aligned under
 * the key 7 5 3 2 1 7 5 3 2, summed, times ten, modulo eleven (ten reads as
 * zero). The same rule as the function's `hasValidControlDigit`.
 */
export function cuiControlDigitOk(raw: string): boolean {
  const digits = cuiDigits(raw);
  if (digits.length < 2 || digits.length > 10) return false;
  const body = digits.slice(0, -1).padStart(9, '0');
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(body[i]) * key[i]!;
  return ((sum * 10) % 11) % 10 === Number(digits[digits.length - 1]);
}

export type CuiInputState = 'empty' | 'incomplete' | 'typo' | 'ready';

/**
 * Whether what has been typed so far is worth a lookup. „ready" as soon as
 * the control digit agrees — no button to press; „typo" when it has the
 * length of a CUI and the digit does not agree.
 */
export function cuiInputState(raw: string): CuiInputState {
  const digits = cuiDigits(raw);
  if (digits === '') return 'empty';
  if (digits.length < 2) return 'incomplete';
  if (cuiControlDigitOk(digits)) return 'ready';
  // Most CUIs are 6 to 8 digits: a shorter one is probably still being typed.
  return digits.length >= 6 ? 'typo' : 'incomplete';
}

/** The fields ANAF can fill, as the form names them. */
export interface AnafCompany {
  cui: string;
  legalName: string;
  address: string | null;
  county: string | null;
  city: string | null;
  regCom: string | null;
  vatPayer: boolean;
  isInactive: boolean;
  isStruckOff: boolean;
  checkedAt: string | null;
}

export type LookupResult =
  | { status: 'found'; cui: string; company: AnafCompany }
  | { status: 'not_found'; cui: string }
  | { status: 'invalid'; cui: string }
  | { status: 'unavailable'; cui: string };

interface FunctionBody {
  found?: boolean;
  reason?: string;
  legal_name?: string | null;
  address?: string | null;
  county?: string | null;
  city?: string | null;
  reg_com?: string | null;
  vat_payer?: boolean;
  is_inactive?: boolean;
  is_struck_off?: boolean;
  checked_at?: string | null;
}

/**
 * The function's answer — a body and an HTTP status — as a result.
 *
 * `status` is null when the call itself failed (no network, the function
 * not deployed, a gateway error with no body): that is „unavailable", the
 * same as ANAF being down, because for the person the remedy is the same —
 * type the details in, we check them at approval.
 */
export function readLookupResponse(cui: string, status: number | null, body: unknown): LookupResult {
  const data = (body && typeof body === 'object' ? body : {}) as FunctionBody;

  if (status === 200 && data.found === true) {
    const county = data.county ? (countyNameFor(data.county) ?? data.county) : null;
    return {
      status: 'found',
      cui,
      company: {
        cui,
        legalName: data.legal_name ?? '',
        address: data.address ?? null,
        county,
        city: data.city ?? null,
        regCom: data.reg_com ?? null,
        vatPayer: data.vat_payer === true,
        isInactive: data.is_inactive === true,
        isStruckOff: data.is_struck_off === true,
        checkedAt: data.checked_at ?? null,
      },
    };
  }
  // Only the function's own words count. The Supabase gateway answers 404
  // too when the function is not deployed — read as „not found at ANAF",
  // that is exactly the silent failure this file exists to prevent.
  if (data.reason === 'not_found' || data.found === false) return { status: 'not_found', cui };
  if (data.reason === 'invalid') return { status: 'invalid', cui };
  return { status: 'unavailable', cui };
}

/** ANAF's „Cluj" or „București" as the app's own spelling, when it is one of ours. */
function countyNameFor(name: string): string | null {
  const code = countyCodeFor(name);
  return code ? countyName(code) : null;
}

/** Which fields a found company fills, for the „Date preluate de la ANAF" marks. */
export const ANAF_FILLED_FIELDS = ['legalName', 'county', 'city'] as const;
export type AnafFilledField = (typeof ANAF_FILLED_FIELDS)[number];

/** What the form shows about a company ANAF knows but that cannot be verified as it stands. */
export function anafWarning(company: AnafCompany): 'struck_off' | 'inactive' | null {
  if (company.isStruckOff) return 'struck_off';
  if (company.isInactive) return 'inactive';
  return null;
}
