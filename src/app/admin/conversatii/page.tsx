import Link from 'next/link';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, adminOrderRoute } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { kindLabel } from '@/lib/messages';
import { loadAdminConversations } from '@/lib/messages-source';
import { formatMoment } from '@/lib/orders';

export const dynamic = 'force-dynamic';

const c = messagesCopy.admin.conversations;

/**
 * Conversațiile pe care echipa le poate deschide.
 *
 * Lista nu este „toate, filtrate": este chiar mulțimea pe care
 * `staff_may_read_conversation()` o permite. Nu există un mod de
 * răsfoire, și nu pentru că butonul lipsește — politica de pe `messages`
 * nu întoarce rândurile.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.pagina) ? params.pagina[0] : params.pagina;
  const page = Math.max(1, Number(raw ?? '1') || 1);

  const { rows, error } = await loadAdminConversations(page);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[68ch] text-body text-muted">{c.lede}</p>
      </div>

      {error !== null ? (
        <p className="rounded-card border border-danger/40 bg-danger/8 p-4 text-body">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <p className="text-body-lg">{c.empty}</p>
          <p className="mt-1 text-body text-muted">{c.emptyBody}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body">{row.participants}</span>
                <StatusBadge tone="neutral">{kindLabel(row.kind)}</StatusBadge>
                {row.report_count > 0 ? (
                  <StatusBadge tone="warning">{c.reports(row.report_count)}</StatusBadge>
                ) : null}
                {row.disputed ? <StatusBadge tone="danger">{c.disputed}</StatusBadge> : null}
              </div>

              <p className="mt-1 text-small text-muted">
                {c.messages(row.message_count)} · {formatMoment(row.last_message_at)}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-small">
                <Link
                  href={`${ROUTES.adminConversations}/${row.id}`}
                  className="underline underline-offset-4"
                >
                  {c.open}
                </Link>
                {row.order_id !== null ? (
                  <Link
                    href={adminOrderRoute(row.order_id)}
                    className="text-muted underline underline-offset-4"
                  >
                    {messagesCopy.thread.context.comanda}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
