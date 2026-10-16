import type { Metadata } from 'next';
import Link from 'next/link';
import { MementoScheduleRow } from '@/components/memento/schedule-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { requireAccountContext } from '@/lib/auth/account';
import { MEMENTO_KIND_LABELS, MEMENTO_KINDS } from '@/lib/memento';
import { loadMementoSchedules, loadMementoSettings, mementoScope } from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';

const c = mementoCopy.schedule;

export const metadata: Metadata = { title: c.title };

/**
 * The days before an expiry a reminder goes, for every document or one
 * kind at a time. The channels and the quiet hours are the notification
 * settings' — one place for them, not two.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ vedere?: string }> }) {
  const { vedere } = await searchParams;
  const context = await requireAccountContext(ROUTES.accountMementoSettings);
  const scope = mementoScope(context, vedere);
  const supabase = await createClient();
  const [schedules, settings] = await Promise.all([
    loadMementoSchedules(supabase, scope, context.user.id),
    loadMementoSettings(supabase),
  ]);
  const own = new Map(schedules.map((row) => [row.kind, row.days]));
  const accountDefault = own.get('*') ?? null;
  const inherited = accountDefault ?? settings.defaultDays;
  const back = scope.kind === 'firma' ? ROUTES.accountMemento : `${ROUTES.accountMemento}?vedere=personal`;

  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      <div>
        <EyebrowPill tone="quiet">{mementoCopy.account.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 text-body text-muted">{c.lede}</p>
        <p className="mt-1 text-small text-muted">{c.daysHint}</p>
      </div>
      <section className="divide-y divide-border rounded-card border border-border bg-surface">
        <MementoScheduleRow scope={scope.kind} kind="*" label={c.all} days={accountDefault} inherited={settings.defaultDays} />
        {MEMENTO_KINDS.map((kind) => (
          <MementoScheduleRow
            key={kind}
            scope={scope.kind}
            kind={kind}
            label={MEMENTO_KIND_LABELS[kind]}
            days={own.get(kind) ?? null}
            inherited={inherited}
          />
        ))}
      </section>
      <p className="text-small text-muted">{c.grouped}</p>
      <p className="text-small text-muted">
        {c.channels}{' '}
        <Link href={ROUTES.accountNotificationSettings} className="underline underline-offset-4">
          {c.channelsLink}
        </Link>
      </p>
      <Link href={back} className="text-body underline underline-offset-4">
        {mementoCopy.vehicle.back}
      </Link>
    </div>
  );
}
