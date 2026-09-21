import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { ReplyForm } from '@/components/ratings/reply-form';
import { Stars } from '@/components/ratings/star-input';
import { buttonClasses } from '@/components/ui/button';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, companyRoute, transportRoute } from '@/config/routes';
import { ratingsCopy } from '@/content/evaluari';
import { requireAccountContext } from '@/lib/auth/account';
import { formatDate, ratingDeadline } from '@/lib/ratings';
import {
  loadMyRatings,
  parseBox,
  type PendingRating,
  type RatingBox,
} from '@/lib/ratings-source';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: ratingsCopy.list.title };
export const dynamic = 'force-dynamic';

const c = ratingsCopy.list;
const BOXES: RatingBox[] = ['de-dat', 'date', 'primite'];

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text !== '' ? text : null;
}

/**
 * Trei file: ce ai de dat, ce ai dat, ce ai primit.
 *
 * „De dat" este calculată în baza de date, nu ținută într-o listă: o
 * coadă de evaluări în așteptare ar trebui golită din patru locuri și ar
 * rămâne plină din al cincilea. Aici este o interogare peste comenzile
 * încheiate, în fereastră, pe care persoana asta nu le-a evaluat.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAccountContext(ROUTES.accountRatings);
  const params = await searchParams;

  const box = parseBox(one(params, 'cutie'));
  const rows = await loadMyRatings(box);
  const pending = box === 'de-dat' ? rows.length : null;

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={c.title} actions={[]} />
      <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p>

      <nav aria-label={c.title} className="flex flex-wrap gap-2">
        {BOXES.map((b) => (
          <Link
            key={b}
            href={b === 'de-dat' ? ROUTES.accountRatings : `${ROUTES.accountRatings}?cutie=${b}`}
            aria-current={b === box ? 'page' : undefined}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-[0.8125rem]',
              b === box
                ? 'border-transparent bg-foreground text-ground'
                : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {c.boxes[b]}
            {b === 'de-dat' && pending !== null && pending > 0 ? ` (${pending})` : ''}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-[1.0625rem]">{c.empty[box]}</p>
          <p className="mt-1 text-sm text-muted">{c.empty[`${box}Body`]}</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.rating_id ?? row.order_id}>
              {box === 'de-dat' ? (
                <PendingRow row={row} />
              ) : (
                <GivenOrReceivedRow row={row} box={box} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O comandă încheiată care așteaptă o notă, cu termenul ei. */
function PendingRow({ row }: { row: PendingRating }) {
  const deadline = ratingDeadline(row.deadline);

  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[1rem]">
          {row.from_city ?? '—'} → {row.to_city ?? '—'}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {row.counterparty_name ?? '—'}
          {row.after_dispute ? ` · ${ratingsCopy.profile.afterDispute}` : ''}
        </p>
        {deadline !== null ? (
          <p className="mt-1 text-[0.8125rem] text-muted">
            {c.deadline(deadline.at)}
            {deadline.passed ? '' : ` — ${c.deadlineLeft(deadline.left)}`}
          </p>
        ) : null}
      </div>

      <Link
        href={transportRoute(row.order_id)}
        className={`${buttonClasses('primary', 'sm')} shrink-0`}
      >
        {c.rate}
      </Link>
    </Card>
  );
}

/** O evaluare dată sau primită, cu răspunsul ei dacă există. */
function GivenOrReceivedRow({ row, box }: { row: PendingRating; box: RatingBox }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {row.score !== null ? <Stars score={row.score} /> : null}
        {row.after_dispute ? (
          <StatusBadge tone="warning">{ratingsCopy.profile.afterDispute}</StatusBadge>
        ) : null}
        {row.hidden ? (
          <StatusBadge tone="danger">{ratingsCopy.admin.list.hiddenLabel}</StatusBadge>
        ) : null}
        <span className="text-xs text-muted">
          {box === 'primite' ? (row.rater_name ?? '—') : (row.counterparty_name ?? '—')} ·{' '}
          {formatDate(row.created_at)}
        </span>
      </div>

      <p className="mt-1 text-sm text-muted">
        {row.from_city ?? '—'} → {row.to_city ?? '—'}
      </p>

      {row.comment !== null ? (
        <p className="mt-2 whitespace-pre-line text-[0.9375rem]">{row.comment}</p>
      ) : null}

      {row.reply_body !== null ? (
        <div className="mt-3 border-l-2 border-border-strong pl-3">
          <p className="text-xs font-medium text-muted">{ratingsCopy.reply.label}</p>
          <p className="mt-1 whitespace-pre-line text-[0.875rem]">{row.reply_body}</p>
        </div>
      ) : null}

      {row.can_reply && row.rating_id !== null ? (
        <ReplyForm ratingId={row.rating_id} slug={row.counterparty_slug} />
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-[0.8125rem]">
        <Link href={transportRoute(row.order_id)} className="underline underline-offset-4">
          {c.openOrder}
        </Link>
        {row.counterparty_slug !== null ? (
          <Link
            href={companyRoute(row.counterparty_slug)}
            className="text-muted underline underline-offset-4"
          >
            {ratingsCopy.profile.title}
          </Link>
        ) : null}
        {row.can_edit && row.rating_id !== null ? (
          <Link
            href={transportRoute(row.order_id)}
            className="text-muted underline underline-offset-4"
          >
            {ratingsCopy.form.edit}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
