import { notFound, redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { requireAccountContext, type AccountContext, type Company } from './account';
import { isManagerRole } from '@/lib/navigation';

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
 * every page they must not reach, the shell refuses anything outside this
 * list — which is the whole of their application.
 */
const DRIVER_ALLOWED: readonly string[] = [ROUTES.account, ROUTES.accountProfile];

export function isDriverAllowed(pathname: string): boolean {
  return DRIVER_ALLOWED.some(
    (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`),
  );
}
