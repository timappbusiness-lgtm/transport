import Link from 'next/link';
import { AlertTriangle, Clock, FileWarning, XCircle } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import type { Company } from '@/lib/auth/account';
import { cn } from '@/lib/utils';

type Tone = 'warn' | 'danger' | 'info';

const TONE: Record<Tone, string> = {
  info: 'border-border bg-surface',
  warn: 'border-warning/35 bg-warning/10',
  danger: 'border-danger/40 bg-danger/10',
};

const ICON_TONE: Record<Tone, string> = {
  info: 'text-muted',
  warn: 'text-warning',
  danger: 'text-danger',
};

function Banner({
  tone,
  icon,
  title,
  body,
  action,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  action?: { href: string; label: string } | undefined;
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-[8px] border p-4 sm:flex-row sm:items-start', TONE[tone])}>
      <span aria-hidden="true" className={cn('mt-0.5 flex-none', ICON_TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[0.9375rem] font-bold">{title}</p>
        <div className="mt-1 text-sm text-muted">{body}</div>
      </div>
      {action ? (
        <Link href={action.href} className={cn(buttonClasses('secondary', 'sm'), 'flex-none')}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * The state of the company, said plainly, on every page of the account area.
 *
 * A suspended customer keeps full read access and is told exactly what
 * expired and what to do — locking them out of the screen that fixes the
 * problem is how a suspension turns into a phone call.
 */
export function CompanyStatusBanner({ company }: { company: Company }) {
  const c = accountCopy.banners;

  if (company.is_suspended || company.verification_status === 'suspended') {
    const since = company.suspended_at
      ? `${c.suspended.since} ${dateFormat.format(new Date(company.suspended_at))}.`
      : '';
    return (
      <Banner
        tone="danger"
        icon={<FileWarning size={18} />}
        title={c.suspended.title}
        body={
          <>
            <p>
              {company.suspension_reason ?? c.suspended.fallback} {since}
            </p>
            <p className="mt-1">{c.suspended.stillWorks}</p>
          </>
        }
        action={{ href: ROUTES.accountCompany, label: c.suspended.action }}
      />
    );
  }

  switch (company.verification_status) {
    case 'draft':
      return (
        <Banner
          tone="warn"
          icon={<AlertTriangle size={18} />}
          title={c.draft.title}
          body={c.draft.body}
          action={{ href: ROUTES.accountCompany, label: c.draft.action }}
        />
      );
    case 'pending':
      return (
        <Banner
          tone="info"
          icon={<Clock size={18} />}
          title={c.pending.title}
          body={c.pending.body}
        />
      );
    case 'rejected':
      return (
        <Banner
          tone="danger"
          icon={<XCircle size={18} />}
          title={c.rejected.title}
          // The schema has no rejection-reason column yet, so the database
          // reason is shown when one was written into suspension_reason and
          // a plain explanation otherwise. See the PR notes.
          body={company.suspension_reason ?? c.rejected.fallback}
          action={{ href: ROUTES.contact, label: c.rejected.action }}
        />
      );
    case 'verified':
      return null;
    default:
      return null;
  }
}
