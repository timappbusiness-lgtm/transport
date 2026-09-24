import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewDriverForm, NewVehicleForm } from '@/components/account/fleet-forms';
import { JourneyBecause } from '@/components/onboarding/journey-because';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { IconLabel } from '@/components/ui/icon';
import { iconForContent } from '@/lib/icons';
import { ROUTES, vehicleRoute } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { inscriereCopy } from '@/content/inscriere';
import { requireAccountContext } from '@/lib/auth/account';
import { safeNextPath } from '@/lib/auth/next-path';
import { afterVehicles, isJourneyAction, withJourney } from '@/lib/carrier-journey';
import { countChecklist, progressLabel, rowsFor } from '@/lib/document-checklist';
import { loadJourney } from '@/lib/journey-source';
import { createClient } from '@/lib/supabase/server';
import { VEHICLE_TYPE_LABELS, formatPlate } from '@/lib/vehicles';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: accountCopy.fleet.title };

interface VehicleRow {
  id: string;
  plate_number: string;
  vehicle_type: keyof typeof VEHICLE_TYPE_LABELS;
  make: string | null;
  model: string | null;
  platform_slots: number | null;
  is_compliant: boolean;
  assigned_driver_id: string | null;
}

interface DriverRow {
  id: string;
  full_name: string;
  phone: string | null;
}

/**
 * The fleet, and step 4 of a carrier's way in.
 *
 * A vehicle is three answers — plate, type, how many cars fit — and the
 * form for them is the first thing on the page, not under the list. Each
 * row says how many of its documents are uploaded and leads to them;
 * nothing here asks for them. A carrier sent here on the way to an offer
 * (`pentru`, `next`) is shown the way on once there is a vehicle.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pentru?: string; next?: string }>;
}) {
  const { pentru, next } = await searchParams;
  const action = isJourneyAction(pentru) ? pentru : null;
  const back = safeNextPath(next, '') || null;

  const context = await requireAccountContext(ROUTES.accountFleet);
  const company = context.activeCompany;
  if (!company) redirect(withJourney(ROUTES.accountCompanyCreate, action, back));

  const supabase = await createClient();
  const [vehiclesResult, driversResult, journey] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type, make, model, platform_slots, is_compliant, assigned_driver_id')
      .eq('company_id', company.id)
      .order('created_at'),
    supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('company_id', company.id)
      .order('full_name'),
    loadJourney(context),
  ]);

  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];
  const drivers = (driversResult.data ?? []) as DriverRow[];
  const driverName = new Map(drivers.map((driver) => [driver.id, driver.full_name]));
  const c = accountCopy.fleet;
  const v = inscriereCopy.vehicles;
  // On the way in: the firm is not yet able to work, or somebody sent it
  // here to finish something. The drivers wait until afterwards.
  const onTheWay = journey.stage !== 'verified' || action !== null || back !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <EyebrowPill>{onTheWay ? v.eyebrow : accountCopy.nav.company}</EyebrowPill>
        <h1 className="mt-2 text-h2">{onTheWay ? v.title : c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-body text-muted">{onTheWay ? v.lede : c.lede}</p>
      </div>
      {action !== null ? <JourneyBecause action={action} /> : null}

      <section id="adauga-vehicul" className="scroll-mt-24 rounded-card border border-border bg-surface p-5">
        <h2 className="mb-4 text-body font-medium">{c.addVehicle}</h2>
        <NewVehicleForm />
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <h2 className="border-b border-border px-5 py-3.5 text-body font-medium">
          <IconLabel as={iconForContent('comanda')} size="sm" tone="strong">
            {c.vehicles}
          </IconLabel>
        </h2>
        {vehicles.length === 0 ? (
          <EmptyState title={c.noVehicles} className="rounded-none border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border" data-fleet-list>
            {vehicles.map((vehicle) => {
              const counts = countChecklist(rowsFor(journey.rows, vehicle.id));
              return (
                <li
                  key={vehicle.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3.5"
                >
                  <Link href={vehicleRoute(vehicle.id)} className="min-w-0 hover:underline">
                    <span className="block font-mono text-body font-medium">
                      <IconLabel as={iconForContent('comanda')} size="sm" tone="strong">
                        {formatPlate(vehicle.plate_number)}
                      </IconLabel>
                    </span>
                    <span className="block text-small text-muted">
                      {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
                      {vehicle.platform_slots ? ` · ${vehicle.platform_slots} locuri` : ''}
                      {vehicle.make ? ` · ${vehicle.make}${vehicle.model ? ` ${vehicle.model}` : ''}` : ''}
                      {vehicle.assigned_driver_id
                        ? ` · ${driverName.get(vehicle.assigned_driver_id) ?? ''}`
                        : ''}
                    </span>
                  </Link>
                  <StatusBadge tone={vehicle.is_compliant ? 'success' : 'neutral'}>
                    {vehicle.is_compliant
                      ? c.compliant
                      : counts.blockingTotal > 0
                        ? progressLabel(counts)
                        : c.notCompliant}
                  </StatusBadge>
                  {vehicle.is_compliant ? null : (
                    <Link
                      href={withJourney(`${ROUTES.accountDocuments}?vehicul=${vehicle.id}`, action, back)}
                      className="col-span-2 text-small link-accent"
                    >
                      {v.documentsFor}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {onTheWay ? (
        <div className="flex flex-wrap items-center gap-4">
          {vehicles.length > 0 ? (
            <Link href={afterVehicles(action, back)} className={cn(buttonClasses('primary', 'md'))}>
              {v.done}
            </Link>
          ) : (
            <Link href={back ?? ROUTES.requests} className="text-body link-accent">
              {v.later}
            </Link>
          )}
        </div>
      ) : (
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="mb-4 text-body font-medium">{c.drivers}</h2>
          {drivers.length > 0 ? (
            <ul className="mb-4 divide-y divide-border text-body">
              {drivers.map((driver) => (
                <li key={driver.id} className="flex justify-between gap-2 py-2">
                  <span>{driver.full_name}</span>
                  <span className="font-mono text-small text-muted">{driver.phone ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <NewDriverForm />
        </section>
      )}
    </div>
  );
}
