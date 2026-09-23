import Link from 'next/link';
import { ReportRow } from '@/components/admin/report-row';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { reportsCopy } from '@/content/sesizari';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  openCount,
  type ReportStatus,
} from '@/lib/reports';
import { loadReports } from '@/lib/reports-source';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const c = reportsCopy;

function parseStatus(value: string | string[] | undefined): ReportStatus | null {
  const text = Array.isArray(value) ? value[0] : value;
  return (REPORT_STATUS_ORDER as readonly string[]).includes(text ?? '')
    ? (text as ReportStatus)
    : null;
}

/**
 * Sesizări.
 *
 * The queue somebody actually works: what nobody has looked at first,
 * every action carrying the reason it was taken, and the text that
 * closes a report written where its author can see that it is the same
 * text the reporter will read.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.stare);
  const rows = await loadReports({ status });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.hero.lede}</p>
      </div>

      <nav aria-label={c.filters.label} className="flex flex-wrap gap-1.5">
        <Tab href={ROUTES.adminReports} label={c.filters.all} active={status === null} />
        {REPORT_STATUS_ORDER.map((value) => (
          <Tab
            key={value}
            href={`${ROUTES.adminReports}?stare=${value}`}
            label={REPORT_STATUS_LABELS[value]}
            active={status === value}
          />
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface p-6 sm:p-8">
          <h2 className="text-h3">{status === null ? c.empty.title : c.empty.filtered}</h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.empty.body}</p>
          {status !== null ? (
            <p className="mt-5 text-sm">
              <Link href={ROUTES.adminReports} className="underline underline-offset-4">
                {c.empty.action}
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {rows.length} în listă · {openCount(rows)} încă deschise
          </p>
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <ReportRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-pill border px-3.5 py-1.5 text-sm',
        active
          ? 'border-foreground bg-foreground text-white'
          : 'border-border text-muted hover:border-border-strong',
      )}
    >
      {label}
    </Link>
  );
}
