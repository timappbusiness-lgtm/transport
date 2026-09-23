import Link from 'next/link';
import { accountCopy } from '@/content/account';
import { ROUTES } from '@/config/routes';
import { COMPANY_TYPE_LABELS } from '@/content/account';
import type { AccountContext } from '@/lib/auth/account';
import { companyDisplayName } from '@/lib/auth/account';
import { setActiveCompanyAction } from '@/app/cont/actions';
import { cn } from '@/lib/utils';

/** Left-hand navigation for the account area. */
export function AccountNav({
  context,
  current,
}: {
  context: AccountContext;
  current: string;
}) {
  const items: Array<{ href: string; label: string }> = [
    { href: ROUTES.account, label: accountCopy.nav.dashboard },
    { href: ROUTES.accountProfile, label: accountCopy.nav.profile },
  ];

  if (context.activeCompany) {
    items.push({ href: ROUTES.accountCompany, label: accountCopy.nav.company });
    items.push({ href: ROUTES.accountDocuments, label: accountCopy.nav.documents });
    items.push({ href: ROUTES.accountFleet, label: accountCopy.nav.fleet });
    items.push({ href: ROUTES.accountDepartures, label: accountCopy.nav.departures });
    items.push({ href: ROUTES.accountMembers, label: accountCopy.nav.members });
    items.push({ href: ROUTES.accountSubscription, label: accountCopy.nav.subscription });
  }
  items.push({ href: ROUTES.accountInvitations, label: accountCopy.nav.invitations });
  if (context.isStaff) {
    items.push({ href: ROUTES.admin, label: accountCopy.nav.admin });
  }

  return (
    <nav aria-label="Cont" className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((item) => {
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-pill px-3 py-2 text-sm',
              active ? 'bg-surface font-medium text-accent' : 'text-muted hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Company switcher, shown only when the user belongs to more than one.
 * Submitting writes a cookie, which the server validates against the user's
 * memberships on every request.
 */
export function CompanySwitcher({ context }: { context: AccountContext }) {
  if (context.memberships.length < 2 || !context.activeCompany) return null;

  return (
    <form action={setActiveCompanyAction} className="flex flex-col gap-1.5">
      <label htmlFor="company-switcher" className="font-mono text-label uppercase tracking-[0.15em] text-muted">
        {accountCopy.switcher.label}
      </label>
      <select
        id="company-switcher"
        name="companyId"
        defaultValue={context.activeCompany.id}
        className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
      >
        {context.memberships.map((m) => (
          <option key={m.company.id} value={m.company.id}>
            {companyDisplayName(m.company)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="self-start text-xs link-accent"
      >
        Schimbă firma
      </button>
    </form>
  );
}

export function CompanySummary({ context }: { context: AccountContext }) {
  const company = context.activeCompany;
  if (!company) return null;

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="font-display text-body font-medium">{companyDisplayName(company)}</p>
      <p className="mt-0.5 font-mono text-xs text-muted">
        CUI {company.cui} · {COMPANY_TYPE_LABELS[company.company_type] ?? company.company_type}
      </p>
    </div>
  );
}
