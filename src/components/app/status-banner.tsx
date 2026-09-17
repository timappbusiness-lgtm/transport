import Link from 'next/link';
import { AlertTriangle, Clock, FileWarning, XCircle } from 'lucide-react';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { appCopy } from '@/content/app';
import type { BannerState } from '@/lib/banners';
import type { Company } from '@/lib/auth/account';
import { pluralRo } from '@/lib/requests';
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

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * The one thing the account area says about the state of the company.
 *
 * Which one is decided in `src/lib/banners.ts`, where the priority is a
 * tested list rather than a chain of conditions spread through a component.
 * A blocking banner carries no dismiss control at all: it is not a message,
 * it is the state of the firm, and it goes away when the state does.
 */
export function StatusBanner({
  state,
  company,
  expiringDocuments,
  trialDaysLeft,
}: {
  state: BannerState;
  company: Company | null;
  expiringDocuments: number;
  trialDaysLeft: number | null;
}) {
  const c = accountCopy.banners;
  const a = appCopy.banners;

  switch (state.kind) {
    case 'suspended': {
      const since = company?.suspended_at
        ? `${c.suspended.since} ${dateFormat.format(new Date(company.suspended_at))}.`
        : '';
      return (
        <Banner
          tone="danger"
          icon={<AlertTriangle size={18} />}
          title={c.suspended.title}
          body={
            <>
              <p>
                {company?.suspension_reason ?? c.suspended.fallback} {since}
              </p>
              <p className="mt-1">{c.suspended.stillWorks}</p>
            </>
          }
          action={{ href: ROUTES.accountCompany, label: c.suspended.action }}
        />
      );
    }

    case 'rejected':
      return (
        <Banner
          tone="danger"
          icon={<XCircle size={18} />}
          title={c.rejected.title}
          body={<p>{company?.verification_note ?? c.rejected.fallback}</p>}
          action={{ href: ROUTES.accountDocuments, label: c.rejected.action }}
        />
      );

    case 'pending':
      return (
        <Banner
          tone="info"
          icon={<Clock size={18} />}
          title={c.pending.title}
          body={<p>{c.pending.body}</p>}
        />
      );

    case 'documents_expiring':
      return (
        <Banner
          tone="warn"
          icon={<FileWarning size={18} />}
          title={a.documentsExpiring.title}
          body={<p>{a.documentsExpiring.body(pluralRo(expiringDocuments, 'document', 'documente'))}</p>}
          action={{ href: ROUTES.accountDocuments, label: a.documentsExpiring.action }}
        />
      );

    case 'trial_ending':
      return (
        <Banner
          tone="warn"
          icon={<Clock size={18} />}
          title={a.trialEnding.title}
          body={<p>{a.trialEnding.body(pluralRo(Math.max(trialDaysLeft ?? 0, 0), 'zi', 'zile'))}</p>}
          action={{ href: ROUTES.plans, label: a.trialEnding.action }}
        />
      );

    case 'quota_reached':
      return (
        <Banner
          tone="warn"
          icon={<AlertTriangle size={18} />}
          title={a.quotaReached.title}
          body={<p>{a.quotaReached.body}</p>}
          action={{ href: ROUTES.plans, label: a.quotaReached.action }}
        />
      );
  }
}

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
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-start',
        TONE[tone],
      )}
    >
      <span aria-hidden="true" className={cn('mt-0.5 flex-none', ICON_TONE[tone])}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[0.9375rem] font-medium">{title}</p>
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
