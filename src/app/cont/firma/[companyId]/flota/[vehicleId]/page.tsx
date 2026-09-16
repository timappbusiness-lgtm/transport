import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { removeRoute } from '@/app/actions/fleet';
import { ActionButtonForm } from '@/components/app/action-form';
import { Badge, Card, PageHeader } from '@/components/app/badge';
import { DocumentHistory } from '@/components/app/document-history';
import { DocumentUpload } from '@/components/app/document-upload';
import { AddRouteForm, EditVehicleForm } from '@/components/app/fleet-forms';
import { RequirementList } from '@/components/app/requirement-list';
import { companyRoutes } from '@/config/routes';
import { requireMembership } from '@/lib/auth';
import { COUNTRY_OPTIONS, VEHICLE_TYPE_LABELS, formatPlate } from '@/lib/vehicles';

export const metadata: Metadata = { title: 'Vehicul' };

const countryName = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c.name]));

export default async function Page({ params }: { params: Promise<{ companyId: string; vehicleId: string }> }) {
  const { companyId, vehicleId } = await params;
  const { session } = await requireMembership(companyId);
  const { supabase } = session;
  const routes = companyRoutes(companyId);

  const [vehicleResult, driversResult, routesResult, requirementsResult, labelsResult, historyResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, vin, vehicle_type, make, model, year, length_m, width_m, height_m, max_weight_kg, is_compliant, assigned_driver_id')
      .eq('id', vehicleId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase.from('drivers').select('id, full_name').eq('company_id', companyId).order('full_name'),
    supabase.from('vehicle_routes').select('id, from_country, from_city, to_country, to_city').eq('vehicle_id', vehicleId).order('created_at'),
    supabase
      .from('v_vehicle_missing_documents')
      .select('kind, label_ro, is_blocking, state, valid_until')
      .eq('vehicle_id', vehicleId)
      .order('is_blocking', { ascending: false }),
    supabase.from('document_requirements').select('kind, label_ro'),
    supabase
      .from('documents')
      .select('id, kind, status, valid_until, rejection_reason, created_at')
      .eq('vehicle_id', vehicleId)
      .neq('status', 'replaced')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const vehicle = vehicleResult.data;
  if (!vehicle) notFound();
  const requirements = requirementsResult.data ?? [];
  const labels = Object.fromEntries((labelsResult.data ?? []).map((r) => [r.kind, r.label_ro]));
  const kinds = requirements.flatMap((r) => (r.kind && r.label_ro ? [{ kind: r.kind, label: r.label_ro }] : []));

  return (
    <>
      <PageHeader
        title={formatPlate(vehicle.plate_number)}
        description={
          <>
            {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
            {vehicle.vin ? <> · VIN <span className="font-mono">{vehicle.vin}</span></> : null} ·{' '}
            <Link href={routes.fleet} className="underline underline-offset-4">
              înapoi la flotă
            </Link>
          </>
        }
        actions={
          <Badge tone={vehicle.is_compliant ? 'ok' : 'danger'}>
            {vehicle.is_compliant ? 'Poate apărea pe bursă' : 'Nu poate apărea pe bursă'}
          </Badge>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-lg font-bold">Documentele vehiculului</h2>
            <div className="mt-2">
              <RequirementList rows={requirements} />
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <DocumentUpload companyId={companyId} vehicleId={vehicleId} kinds={kinds} />
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold">Istoric documente</h2>
            <DocumentHistory rows={historyResult.data ?? []} labels={labels} />
          </Card>
        </div>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Date tehnice</h2>
            <EditVehicleForm
              companyId={companyId}
              vehicleId={vehicleId}
              specs={vehicle}
              assignedDriverId={vehicle.assigned_driver_id}
              drivers={driversResult.data ?? []}
            />
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Rute operate</h2>
            <p className="mt-1 mb-3 text-sm text-muted">Coridoarele pe care vehiculul circulă de obicei. Le folosim ca să îți arătăm cererile potrivite.</p>
            {(routesResult.data ?? []).length > 0 ? (
              <ul className="mb-4 divide-y divide-border text-sm">
                {(routesResult.data ?? []).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {r.from_city ? `${r.from_city}, ` : ''}
                      {countryName.get(r.from_country) ?? r.from_country} → {r.to_city ? `${r.to_city}, ` : ''}
                      {countryName.get(r.to_country) ?? r.to_country}
                    </span>
                    <ActionButtonForm
                      action={removeRoute}
                      fields={{ company_id: companyId, vehicle_id: vehicleId, route_id: r.id }}
                      label="Șterge"
                      variant="ghost"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <AddRouteForm companyId={companyId} vehicleId={vehicleId} />
          </Card>
        </div>
      </div>
    </>
  );
}
