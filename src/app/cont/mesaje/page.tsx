import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { ROUTES } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { requireAccountContext } from '@/lib/auth/account';
import { BOX_LABELS, kindLabel, parseBox, preview, type Box } from '@/lib/messages';
import { loadConversations } from '@/lib/messages-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: messagesCopy.list.title };
export const dynamic = 'force-dynamic';

const c = messagesCopy.list;
const BOXES: Box[] = ['toate', 'necitite', 'comenzi', 'oferte'];

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text.trim() !== '' ? text.trim() : null;
}

/**
 * Inboxul.
 *
 * Aceeași pagină pentru toate tipurile de cont: ce se vede vine din
 * `my_conversations()`, care știe deja că un șofer are doar firele
 * comenzilor lui. Diferența nu este desenată, ci întoarsă.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAccountContext(ROUTES.accountMessages);
  const params = await searchParams;

  const box = parseBox(one(params, 'cutie'));
  const term = one(params, 'q');
  const rows = await loadConversations(box, term);

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={c.title} actions={[]} />
      <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p>
      <HelpLink topic="messages" />

      <nav aria-label={c.title} className="flex flex-wrap gap-2">
        {BOXES.map((b) => (
          <Link
            key={b}
            href={b === 'toate' ? ROUTES.accountMessages : `${ROUTES.accountMessages}?cutie=${b}`}
            aria-current={b === box ? 'page' : undefined}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-small',
              b === box
                ? 'border-transparent bg-foreground text-ground'
                : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {BOX_LABELS[b]}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap gap-2">
        {box !== 'toate' ? <input type="hidden" name="cutie" value={box} /> : null}
        <label htmlFor="q" className="sr-only">
          {c.search}
        </label>
        <input
          id="q"
          name="q"
          defaultValue={term ?? ''}
          placeholder={c.search}
          className="min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-input border border-border-strong px-3 py-2 text-sm"
        >
          {c.searchAction}
        </button>
      </form>

      {rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-body-lg">{c.empty[box]}</p>
          <p className="mt-1 text-sm text-muted">{c.empty[`${box}Body`]}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`${ROUTES.accountMessages}/${row.id}`}
                className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-4 hover:border-border-strong"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-base">{row.counterparty_name ?? '—'}</span>
                  <StatusBadge tone="neutral">{kindLabel(row.kind)}</StatusBadge>
                  {row.unread > 0 ? (
                    <StatusBadge tone="warning">
                      {row.unread > 9 ? '9+' : row.unread}
                    </StatusBadge>
                  ) : null}
                </div>

                {row.from_city !== null || row.to_city !== null ? (
                  <p className="text-xs text-muted">
                    {row.from_city ?? '—'} → {row.to_city ?? '—'}
                  </p>
                ) : null}

                <p
                  className={cn(
                    'text-sm',
                    row.unread > 0 ? 'text-foreground' : 'text-muted',
                  )}
                >
                  {preview(row)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
