import type { Metadata } from 'next';
import Link from 'next/link';
import { MementoCsvImport } from '@/components/memento/csv-import';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { requireAccountContext } from '@/lib/auth/account';
import { loadMementoSettings, mementoScope } from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';

const c = mementoCopy.import;

export const metadata: Metadata = { title: c.title };

/** A fleet from a CSV: read and checked here, imported whole or not at all. */
export default async function Page({ searchParams }: { searchParams: Promise<{ vedere?: string }> }) {
  const { vedere } = await searchParams;
  const context = await requireAccountContext(ROUTES.accountMementoImport);
  const scope = mementoScope(context, vedere);
  const settings = await loadMementoSettings(await createClient());
  const back = scope.kind === 'firma' ? ROUTES.accountMemento : `${ROUTES.accountMemento}?vedere=personal`;

  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      <div>
        <EyebrowPill tone="quiet">{mementoCopy.account.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 text-body text-muted">
          {c.lede} {scope.kind === 'firma' ? `${mementoCopy.account.viewFirm} · ${scope.companyName}.` : ''}
        </p>
      </div>
      <section className="rounded-card border border-border bg-surface p-5">
        <MementoCsvImport scope={scope.kind} maxRows={settings.importMaxRows} />
      </section>
      <Link href={back} className="text-body underline underline-offset-4">
        {mementoCopy.vehicle.back}
      </Link>
    </div>
  );
}
