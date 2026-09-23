import { setActiveCompanyAction } from '@/app/cont/actions';
import { appCopy } from '@/content/app';
import { COMPANY_TYPE_LABELS } from '@/content/account';
import { companyDisplayName, type AccountContext } from '@/lib/auth/account';

const c = appCopy.shell;

/**
 * Which company the person is acting as.
 *
 * With one company this is a label, not a control — a select with a single
 * option is a small insult. With several it is a plain form: submitting
 * writes a cookie, and every server read validates that cookie against the
 * user's memberships, so switching changes the data on the server rather
 * than filtering it in the browser.
 */
export function CompanySwitcher({ context }: { context: AccountContext }) {
  const company = context.activeCompany;
  if (!company) return null;

  if (context.memberships.length < 2) {
    return (
      <div className="min-w-0">
        <p className="truncate font-display text-body font-medium">
          {companyDisplayName(company)}
        </p>
        <p className="mt-0.5 truncate font-mono text-label text-muted">
          CUI {company.cui} · {COMPANY_TYPE_LABELS[company.company_type] ?? company.company_type}
        </p>
      </div>
    );
  }

  return (
    <form action={setActiveCompanyAction} className="flex flex-col gap-1.5">
      <label
        htmlFor="company-switcher"
        className="font-mono text-label uppercase tracking-[0.12em] text-muted"
      >
        {c.switcher}
      </label>
      <div className="flex gap-1.5">
        <select
          id="company-switcher"
          name="companyId"
          defaultValue={company.id}
          className="min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-small"
        >
          {context.memberships.map((membership) => (
            <option key={membership.company.id} value={membership.company.id}>
              {companyDisplayName(membership.company)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-input border border-border-strong px-2.5 text-small text-muted hover:text-foreground"
        >
          {c.switcherAction}
        </button>
      </div>
    </form>
  );
}
