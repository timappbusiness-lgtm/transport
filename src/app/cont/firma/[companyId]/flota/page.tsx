import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, PageHeader } from '@/components/app/badge';
import { NewDriverForm, NewVehicleForm } from '@/components/app/fleet-forms';
import { companyRoutes } from '@/config/routes';
import { requireMembership } from '@/lib/auth';
import { VEHICLE_TYPE_LABELS, formatPlate } from '@/lib/vehicles';

export const metadata: Metadata = { title: 'Flotă' };

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { session, membership } = await requireMembership(companyId);
  const routes = companyRoutes(companyId);

  const [vehiclesResult, driversResult] = await Promise.all([
    session.supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type, make, model, is_compliant, assigned_driver_id')
      .eq('company_id', companyId)
      .order('created_at'),
    session.supabase.from('drivers').select('id, full_name, phone').eq('company_id', companyId).order('full_name'),
  ]);
  const vehicles = vehiclesResult.data ?? [];
  const drivers = driversResult.data ?? [];
  const driverName = new Map(drivers.map((d) => [d.id, d.full_name]));

  return (
    <>
      <PageHeader
        title="Flotă"
        description={`${membership.name}. Un vehicul apare pe bursă doar cu ITP, RCA și copia conformă aprobate și valabile.`}
      />
      <div className="grid gap-5">
        <Card>
          <h2 className="mb-3 text-lg font-bold">Vehicule</h2>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted">Niciun vehicul încă.</p>
          ) : (
            <ul className="divide-y divide-border">
              {vehicles.map((v) => (
                <li key={v.id}>
                  <Link
                    href={routes.vehicle(v.id)}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 hover:bg-foreground/[0.03]"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono font-medium">{formatPlate(v.plate_number)}</span>
                      <span className="block text-xs text-muted">
                        {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                        {v.make ? ` · ${v.make}${v.model ? ` ${v.model}` : ''}` : ''}
                        {v.assigned_driver_id ? ` · ${driverName.get(v.assigned_driver_id) ?? ''}` : ''}
                      </span>
                    </span>
                    <Badge tone={v.is_compliant ? 'ok' : 'danger'}>
                      {v.is_compliant ? 'Documente în regulă' : 'Documente lipsă'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Adaugă un vehicul</h2>
            <NewVehicleForm companyId={companyId} />
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold">Șoferi</h2>
            {drivers.length > 0 ? (
              <ul className="mb-4 divide-y divide-border text-sm">
                {drivers.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 py-2">
                    <span>{d.full_name}</span>
                    <span className="font-mono text-xs text-muted">{d.phone}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <NewDriverForm companyId={companyId} />
          </Card>
        </div>
      </div>
    </>
  );
}
