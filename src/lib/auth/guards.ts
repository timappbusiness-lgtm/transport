import { notFound, redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { requireAccountContext, type AccountContext, type Company } from './account';
import { driverPaths, isManagerRole } from '@/lib/navigation';

/**
 * The server side of what the menu hides.
 *
 * Navigation leaving an item out is a courtesy, never a protection: a
 * dispatcher who types /cont/abonament must be refused, not merely
 * un-linked. These guards are that refusal, and the database refuses a
 * third time — the RPCs behind billing and team management check the
 * caller themselves.
 *
 * A refusal is a 404 rather than a 403, the same as the staff area: a 403
 * confirms the page exists and that there is something behind it worth
 * finding.
 */

export interface CompanyContext extends AccountContext {
  activeCompany: Company;
}

/**
 * A page that needs a company, whatever the role.
 *
 * Somebody with no company is sent to create one rather than refused:
 * they are not forbidden, they are early.
 */
export async function requireCompanyContext(next: string): Promise<CompanyContext> {
  const context = await requireAccountContext(next);
  if (!context.activeCompany) redirect(ROUTES.accountCompanyCreate);
  return context as CompanyContext;
}

/**
 * A page only the owner and the administrators may open: billing, the team,
 * and the company's own profile. A dispatcher runs the day-to-day and does
 * not commit the firm to anything.
 */
export async function requireManagerContext(next: string): Promise<CompanyContext> {
  const context = await requireCompanyContext(next);
  if (!isManagerRole(context.activeRole)) notFound();
  return context;
}

/**
 * What a driver may open.
 *
 * A driver is not a dispatcher with fewer buttons: the only thing they do
 * here is look at what they were assigned. Rather than adding a guard to
 * every page they must not reach, the shell refuses anything outside the
 * menu `buildNav` draws for them — which is the whole of their
 * application.
 *
 * Two bugs paid for the shape of this. The list used to be written out
 * beside the builder, as `[ROUTES.account, ROUTES.accountProfile]`, and
 * drifted from it the moment orders and messaging shipped: the menu
 * offered five pages the list did not name. And because `/cont` was in the
 * list and every entry was matched as a prefix, `/cont/oricare`.startsWith
 * (`/cont/`) was true — so the guard refused nothing at all, and a driver
 * could open the firm's fleet, its documents and its published routes.
 * A dead guard reads exactly like a live one.
 *
 * So the list is the builder's, and `/cont` matches only itself: it is the
 * dashboard, not the parent of the account area. The same reasoning as
 * `activeHref`, for the same reason.
 */
export function isDriverAllowed(pathname: string): boolean {
  return driverPaths().some((allowed) => {
    if (pathname === allowed) return true;
    if (allowed === ROUTES.account) return false;
    return pathname.startsWith(`${allowed}/`);
  });
}

/**
 * What stays open to somebody who has not accepted the current terms.
 *
 * The gate is a real gate — the terms are the contract, and an account
 * carrying on under a version nobody accepted is an account we cannot
 * point at anything for. But refusing to agree has to remain possible,
 * and „you may leave" is worth nothing if the page that lets you leave is
 * behind the thing you are refusing.
 *
 * So: the personal-data page, where the export and the deletion live.
 * Nothing else. Everything on it either takes data away from us or gives
 * it back, and neither needs a contract.
 */
const OPEN_WITHOUT_TERMS: readonly string[] = [ROUTES.accountPersonalData];

export function isOpenWithoutTerms(pathname: string): boolean {
  return OPEN_WITHOUT_TERMS.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
}
