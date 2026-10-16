import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MementoEntryEditor } from '@/components/memento/entry-editor';
import { RenewForm } from '@/components/memento/renew-form';
import { MementoStateText } from '@/components/memento/state-text';
import { ConfirmDelete, ResponsibleForm, VehicleDetailsForm } from '@/components/memento/vehicle-details';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { requireAccountContext, type AccountContext } from '@/lib/auth/account';
import { bucharestToday, daysLeft, displayPlate, formatDay, mementoLabel } from '@/lib/memento';
import { loadFirmMembers, loadMementoHistory, loadMementoVehicle, type MementoVehicle } from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/uploads/paths';

const v = mementoCopy.vehicle;

export const metadata: Metadata = { title: mementoCopy.account.title };

const OPERATORS = new Set(['owner', 'admin', 'dispatcher']);

/** The owner, or an operator of the firm that owns it, may change it; the responsible person only renews. */
function mayManage(context: AccountContext, vehicle: MementoVehicle): boolean {
  if (vehicle.ownerUserId !== null) return vehicle.ownerUserId === context.user.id;
  return context.memberships.some((m) => m.company.id === vehicle.ownerCompanyId && OPERATORS.has(m.role));
}

async function load(vehicleId: string) {
  const context = await requireAccountContext(ROUTES.accountMemento);
  if (!isUuid(vehicleId)) notFound();
  const supabase = await createClient();
  const vehicle = await loadMementoVehicle(supabase, vehicleId);
  if (vehicle === null) notFound();
  const manage = mayManage(context, vehicle);
  const renew = manage || vehicle.responsibleUserId === context.user.id;
  const [history, members, photos] = await Promise.all([
    loadMementoHistory(supabase, vehicle.entries.map((entry) => entry.id)),
    vehicle.ownerCompanyId !== null && manage ? loadFirmMembers(supabase, vehicle.ownerCompanyId) : Promise.resolve([]),
    // Short-lived links to the private photos, for this page only.
    Promise.all(
      vehicle.entries
        .filter((entry) => entry.photoPath !== null)
        .map(async (entry) => {
          const { data } = await supabase.storage.from('memento').createSignedUrl(entry.photoPath!, 300);
          return [entry.id, data?.signedUrl ?? null] as const;
        }),
    ),
  ]);
  return {
    vehicle,
    manage,
    renew,
    history,
    members,
    photos: new Map(photos),
    today: bucharestToday(new Date()),
  };
}

/**
 * One memento vehicle: its dates with „Am reînnoit", each date's photo and
 * history, the person who receives the reminders, and the way out.
 * Staff open it read-only; RLS lets them see it and no function lets them
 * change it.
 */
export default async function Page({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const { vehicle, manage, renew, history, members, photos, today } = await load(vehicleId);
  const folder = vehicle.ownerCompanyId ?? vehicle.ownerUserId ?? '';
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const back = vehicle.ownerCompanyId !== null ? ROUTES.accountMemento : `${ROUTES.accountMemento}?vedere=personal`;

  return (
    <div className="flex max-w-[52rem] flex-col gap-6" data-memento-vehicle-page={vehicle.plate}>
      <div>
        <Link href={back} className="text-small text-muted underline underline-offset-4">
          {v.back}
        </Link>
        <div className="mt-3">
          <EyebrowPill tone="quiet">{mementoCopy.account.eyebrow}</EyebrowPill>
        </div>
        <h1 className="mt-2 font-mono text-h2">{displayPlate(vehicle.plate)}</h1>
        {name !== '' ? <p className="mt-1 text-body text-muted">{name}</p> : null}
      </div>
      <p className="text-small text-muted">{mementoCopy.account.declared}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-h3">{v.documents}</h2>
        {vehicle.entries.length === 0 ? <p className="text-body text-muted">{mementoCopy.account.noDates}</p> : null}
        <ul className="flex flex-col gap-3">
          {vehicle.entries.map((entry) => {
            const label = mementoLabel(entry.kind, entry.customName);
            const left = entry.validUntil === null ? null : daysLeft(entry.validUntil, today);
            const rows = history.filter((row) => row.entryId === entry.id);
            const photo = photos.get(entry.id) ?? null;
            return (
              <li key={entry.id} className="rounded-card border border-border bg-surface p-4 sm:p-5" data-memento-entry={entry.kind}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body">
                      <span className="font-medium">{label}</span>
                      {entry.validUntil ? <span className="ml-2 font-mono text-small">{formatDay(entry.validUntil)}</span> : null}
                      {entry.dueKm !== null ? (
                        <span className="ml-2 text-small text-muted">{mementoCopy.account.kmDue(entry.dueKm.toLocaleString('ro-RO'))}</span>
                      ) : null}
                    </p>
                    {left !== null ? <MementoStateText days={left} /> : null}
                    {entry.reference ? <p className="text-small text-muted">{entry.reference}</p> : null}
                    {entry.note ? <p className="mt-1 text-small">{entry.note}</p> : null}
                    {photo ? (
                      <a href={photo} target="_blank" rel="noopener" className="text-small underline underline-offset-4">
                        {mementoCopy.photo.view}
                      </a>
                    ) : null}
                  </div>
                  {renew ? <RenewForm entryId={entry.id} label={label} kind={entry.kind} /> : null}
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-small text-muted">
                    {v.history} ({rows.length})
                  </summary>
                  {rows.length === 0 ? (
                    <p className="mt-2 text-small text-muted">{v.historyEmpty}</p>
                  ) : (
                    <ul className="mt-2 flex flex-col gap-1 text-small" data-memento-history={entry.kind}>
                      {rows.map((row) => (
                        <li key={row.id}>
                          {v.historyRow(
                            row.validUntil ? formatDay(row.validUntil) : `${row.dueKm ?? '—'} km`,
                            formatDay(row.renewedAt.slice(0, 10)),
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>

                {manage ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-small text-muted">{v.editDocument}</summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <MementoEntryEditor vehicleId={vehicle.id} folder={folder} entry={entry} />
                      <ConfirmDelete
                        kind="entry"
                        hidden={{ entry_id: entry.id, vehicle_id: vehicle.id }}
                        label={v.deleteDocument}
                        question={v.deleteDocumentConfirm}
                      />
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {manage ? (
        <section className="rounded-card border border-border bg-surface p-5" data-memento-add-entry>
          <h2 className="mb-4 text-body font-medium">{v.addDocument}</h2>
          <MementoEntryEditor
            vehicleId={vehicle.id}
            folder={folder}
            takenKinds={vehicle.entries.map((entry) => entry.kind)}
          />
        </section>
      ) : null}

      {manage ? (
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-4 text-body font-medium">{v.details}</h2>
          <VehicleDetailsForm
            id={vehicle.id}
            plate={vehicle.plate}
            make={vehicle.make}
            model={vehicle.model}
            vehicleKind={vehicle.vehicleKind}
            isFirm={vehicle.ownerCompanyId !== null}
          />
        </section>
      ) : null}

      {manage && vehicle.ownerCompanyId !== null ? (
        <section className="rounded-card border border-border bg-surface p-5">
          <ResponsibleForm vehicleId={vehicle.id} current={vehicle.responsibleUserId} members={members} />
        </section>
      ) : null}

      {manage ? (
        <ConfirmDelete kind="vehicle" hidden={{ id: vehicle.id }} label={v.delete} question={v.deleteConfirm} />
      ) : null}
    </div>
  );
}
