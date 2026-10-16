import type { Metadata } from 'next';
import Link from 'next/link';
import { MementoVehicleForm } from '@/components/memento/vehicle-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { requireAccountContext } from '@/lib/auth/account';
import { mementoScope } from '@/lib/memento-source';

const c = mementoCopy.account;

export const metadata: Metadata = { title: c.add };

/**
 * A vehicle in under thirty seconds: plate, make and model if wanted,
 * then the dates. The form stays for the next one.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ vedere?: string }> }) {
  const { vedere } = await searchParams;
  const context = await requireAccountContext(ROUTES.accountMementoAdd);
  const scope = mementoScope(context, vedere);
  const back = scope.kind === 'firma' ? ROUTES.accountMemento : `${ROUTES.accountMemento}?vedere=personal`;

  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      <div>
        <EyebrowPill tone="quiet">{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.add}</h1>
        <p className="mt-2 text-body text-muted">
          {scope.kind === 'firma' ? `${c.viewFirm} · ${scope.companyName}` : c.viewPersonal}
        </p>
      </div>
      <section className="rounded-card border border-border bg-surface p-5">
        <MementoVehicleForm scope={scope.kind} />
      </section>
      <p className="text-small text-muted">{c.declared}</p>
      <Link href={back} className="text-body underline underline-offset-4">
        {mementoCopy.vehicle.back}
      </Link>
    </div>
  );
}
