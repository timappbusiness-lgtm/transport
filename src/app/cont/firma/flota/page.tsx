import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NewDriverForm, NewVehicleForm } from '@/components/account/fleet-forms';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { IconLabel } from '@/components/ui/icon';
import { iconForContent } from '@/lib/icons';
import { ROUTES, vehicleRoute } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { requireAccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import { VEHICLE_TYPE_LABELS, formatPlate } from '@/lib/vehicles';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: accountCopy.fleet.title };

interface VehicleRow {
  id: string;
  plate_number: string;
  vehicle_type: keyof typeof VEHICLE_TYPE_LABELS;
  make: string | null;
  model: string | null;
  is_compliant: boolean;
  assigned_driver_id: string | null;
}

interface DriverRow {
  id: string;
  full_name: string;
  phone: string | null;
}

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountFleet);
  const company = context.activeCompany;
  if (!company) redirect(ROUTES.accountCompanyCreate);

  const supabase = await createClient();
  const [vehiclesResult, driversResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type, make, model, is_compliant, assigned_driver_id')
      .eq('company_id', company.id)
      .order('created_at'),
    supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('company_id', company.id)
      .order('full_name'),
  ]);

  const vehicles = (vehiclesResult.data ?? []) as VehicleRow[];
  const drivers = (driversResult.data ?? []) as DriverRow[];
  const driverName = new Map(drivers.map((driver) => [driver.id, driver.full_name]));
  const c = accountCopy.fleet;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <EyebrowPill>{accountCopy.nav.company}</EyebrowPill>
          <h1 className="mt-2 text-h2">{c.title}</h1>
          <p className="mt-2 max-w-[54ch] text-body text-muted">{c.lede}</p>
        </div>
        {/* The screen's one action, where it is seen first; the form it
            leads to sits under the list. */}
        <a href="#adauga-vehicul" className={buttonClasses('primary', 'sm')}>
          {c.addVehicle}
        </a>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <h2 className="border-b border-border px-5 py-3.5 text-body font-medium">
          <IconLabel as={iconForContent('comanda')} size="sm" tone="strong">
            {c.vehicles}
          </IconLabel>
        </h2>
        {vehicles.length === 0 ? (
          <EmptyState title={c.noVehicles} className="rounded-none border-0 py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <Link
                  href={vehicleRoute(vehicle.id)}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 hover:bg-ground-alt"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-body font-medium">
                      <IconLabel as={iconForContent('comanda')} size="sm" tone="strong">
                        {formatPlate(vehicle.plate_number)}
                      </IconLabel>
                    </span>
                    <span className="block text-small text-muted">
                      {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
                      {vehicle.make ? ` · ${vehicle.make}${vehicle.model ? ` ${vehicle.model}` : ''}` : ''}
                      {vehicle.assigned_driver_id
                        ? ` · ${driverName.get(vehicle.assigned_driver_id) ?? ''}`
                        : ''}
                    </span>
                  </span>
                  <StatusBadge tone={vehicle.is_compliant ? 'success' : 'danger'}>
                    {vehicle.is_compliant ? c.compliant : c.notCompliant}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="adauga-vehicul" className="scroll-mt-24 rounded-card border border-border bg-surface p-5">
          <h2 className="mb-4 text-body font-medium">{c.addVehicle}</h2>
          <NewVehicleForm />
        </section>

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
      </div>
    </div>
  );
}
