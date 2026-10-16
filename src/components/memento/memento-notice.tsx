import Link from 'next/link';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import type { AccountContext } from '@/lib/auth/account';
import { FEATURES } from '@/lib/features';
import { addDays, bucharestToday, daysLeft } from '@/lib/memento';
import { mementoInAppEnabled } from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';

const OPERATORS = new Set(['owner', 'admin', 'dispatcher']);

/**
 * The person's own memento dates close enough to mention: the week ahead,
 * and the month behind. Their own vehicles, the firm vehicles they are
 * responsible for, and — for a firm's operators — the fleet. Never
 * everybody's: staff read every row through RLS, and this asks only for
 * the caller's.
 */
async function loadCounts(context: AccountContext): Promise<{ soon: number; expired: number } | null> {
  const supabase = await createClient();
  if (!(await mementoInAppEnabled(supabase, context.user.id))) return null;
  const today = bucharestToday(new Date());
  const firms = context.memberships.filter((m) => OPERATORS.has(m.role)).map((m) => m.company.id);
  const owners = [`owner_user_id.eq.${context.user.id}`, `responsible_user_id.eq.${context.user.id}`];
  if (firms.length > 0) owners.push(`owner_company_id.in.(${firms.join(',')})`);
  const { data } = await supabase
    .from('memento_vehicles')
    .select('id, memento_entries!inner(valid_until)')
    .or(owners.join(','))
    .gte('memento_entries.valid_until', addDays(today, -30))
    .lte('memento_entries.valid_until', addDays(today, 7));
  let soon = 0;
  let expired = 0;
  for (const vehicle of (data ?? []) as { memento_entries: { valid_until: string | null }[] }[]) {
    for (const entry of vehicle.memento_entries) {
      if (entry.valid_until === null) continue;
      const left = daysLeft(entry.valid_until, today);
      if (left < 0) expired += 1;
      else if (left <= 7) soon += 1;
    }
  }
  return { soon, expired };
}

/**
 * The in-app channel of the memento: a calm line on arrival in the
 * account when a date is near or past, and nothing otherwise. Honours the
 * person's „în aplicație" choice for memento reminders.
 */
export async function MementoNotice({ context }: { context: AccountContext }) {
  if (!FEATURES.memento) return null;
  const counts = await loadCounts(context);
  if (counts === null || (counts.soon === 0 && counts.expired === 0)) return null;
  const c = mementoCopy.notice;
  return (
    <p
      role="status"
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-input border border-border bg-surface px-3.5 py-2.5 text-body"
      data-memento-notice
    >
      {counts.soon > 0 ? <span>{c.soon(counts.soon)}</span> : null}
      {counts.expired > 0 ? <span>{c.expired(counts.expired)}</span> : null}
      <Link href={ROUTES.accountMemento} className="underline underline-offset-4">
        {c.open}
      </Link>
    </p>
  );
}
