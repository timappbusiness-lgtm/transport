// Who may write an ANAF snapshot onto a company row.
//
// The function writes with the service role, which bypasses RLS, so the
// check has to happen here, before the write:
//   1. the caller manages the company - asked with the caller's own JWT, so
//      the database decides, not this code
//   2. the CUI looked up is that company's CUI - otherwise a manager could
//      copy another firm's legal name and address onto their own company
//
// Kept free of Deno and Supabase imports so it runs under `deno test`
// without network or credentials.

/** "RO 12 345 678" -> 12345678. Returns null when it cannot be a CUI. */
export function normaliseCui(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 2 || digits.length > 10) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/**
 * The CUI's last digit is a control digit: the others, right-aligned under
 * the key 7 5 3 2 1 7 5 3 2, summed, times ten, modulo eleven (ten reads
 * as zero). A CUI that fails it is a typo, and asking ANAF about it only
 * spends the rate limit on a „negăsit".
 */
export function hasValidControlDigit(cui: number): boolean {
  const digits = String(cui);
  if (digits.length < 2 || digits.length > 10) return false;
  const body = digits.slice(0, -1).padStart(9, "0");
  const key = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(body[i]) * key[i]!;
  const control = (sum * 10) % 11 % 10;
  return control === Number(digits[digits.length - 1]);
}

export interface CompanyWriteChecks {
  /** is_company_manager(company_id), evaluated with the caller's JWT. */
  callerManages(companyId: string): Promise<boolean>;
  /** The company's stored CUI, read with the service role. null if absent. */
  storedCui(companyId: string): Promise<string | null>;
}

export type WriteDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 404 | 409; error: string };

export async function authorizeCompanyWrite(
  checks: CompanyWriteChecks,
  companyId: string,
  requestedCui: number,
): Promise<WriteDecision> {
  let manages = false;
  try {
    manages = await checks.callerManages(companyId);
  } catch {
    // No JWT, an anon key, or an RPC error: never a reason to write.
    manages = false;
  }
  if (!manages) {
    return { allowed: false, status: 403, error: "Doar administratorii firmei pot actualiza datele ANAF" };
  }

  const stored = await checks.storedCui(companyId);
  if (stored === null) {
    return { allowed: false, status: 404, error: "Firmă inexistentă" };
  }
  if (normaliseCui(stored) !== requestedCui) {
    return { allowed: false, status: 409, error: "CUI-ul nu corespunde firmei" };
  }
  return { allowed: true };
}
