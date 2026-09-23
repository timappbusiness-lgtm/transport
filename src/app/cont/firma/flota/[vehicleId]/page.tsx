import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { removeRouteAction } from '@/app/cont/fleet-actions';
import { DocumentHistory, type HistoryRow } from '@/components/account/document-history';
import { DocumentUpload } from '@/components/account/document-upload';
import { AddRouteForm, EditVehicleForm, type VehicleSpecs } from '@/components/account/fleet-forms';
import { RequirementList, type RequirementRow } from '@/components/account/requirement-list';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, vehicleRoute } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { requireAccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { COUNTRY_OPTIONS, VEHICLE_TYPE_LABELS, formatPlate } from '@/lib/vehicles';
import { KeepingForm } from '@/components/ui/keeping-form';

type DocumentKind = Database['public']['Enums']['document_kind'];

export const metadata: Metadata = { title: 'Vehicul' };

const countryName = new Map(COUNTRY_OPTIONS.map((country) => [country.code, country.name]));

interface RouteRow {
  id: string;
  from_country: string;
  from_city: string | null;
  to_country: string;
  to_city: string | null;
}

interface Vehicle extends VehicleSpecs {
  id: string;
  plate_number: string;
  vin: string | null;
  vehicle_type: keyof typeof VEHICLE_TYPE_LABELS;
  is_compliant: boolean;
  assigned_driver_id: string | null;
}

export default async function Page({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const context = await requireAccountContext(vehicleRoute(vehicleId));
  const company = context.activeCompany;
  if (!company) redirect(ROUTES.accountCompanyCreate);

  const supabase = await createClient();
  const [vehicleResult, driversResult, routesResult, requirementsResult, labelsResult, historyResult] =
    await Promise.all([
      supabase
        .from('vehicles')
        .select(
          'id, plate_number, vin, vehicle_type, make, model, year, length_m, width_m, height_m, max_weight_kg, is_compliant, assigned_driver_id',
        )
        .eq('id', vehicleId)
        .eq('company_id', company.id)
        .maybeSingle(),
      supabase
        .from('drivers')
        .select('id, full_name')
        .eq('company_id', company.id)
        .order('full_name'),
      supabase
        .from('vehicle_routes')
        .select('id, from_country, from_city, to_country, to_city')
        .eq('vehicle_id', vehicleId)
        .order('created_at'),
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

  // The query is already scoped to the active company, so a vehicle that
  // belongs to somebody else is indistinguishable from one that does not
  // exist — which is what we want it to look like.
  const vehicle = vehicleResult.data as Vehicle | null;
  if (!vehicle) notFound();

  const requirements = (requirementsResult.data ?? []) as RequirementRow[];
  const labels = Object.fromEntries(
    ((labelsResult.data ?? []) as { kind: string; label_ro: string }[]).map((row) => [
      row.kind,
      row.label_ro,
    ]),
  );
  const kinds = requirements.flatMap((row) =>
    row.kind && row.label_ro ? [{ kind: row.kind as DocumentKind, label: row.label_ro }] : [],
  );
  const routes = (routesResult.data ?? []) as RouteRow[];
  const c = accountCopy.fleet;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <EyebrowPill>{c.title}</EyebrowPill>
          <h1 className="mt-2 font-mono text-h2">
            {formatPlate(vehicle.plate_number)}
          </h1>
          <p className="mt-2 max-w-[54ch] text-body text-muted">
            {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
            {vehicle.vin ? (
              <>
                {' · VIN '}
                <span className="font-mono">{vehicle.vin}</span>
              </>
            ) : null}
            {' · '}
            <Link href={ROUTES.accountFleet} className="link-accent">
              {c.backToFleet}
            </Link>
          </p>
        </div>
        <StatusBadge tone={vehicle.is_compliant ? 'success' : 'danger'}>
          {vehicle.is_compliant ? 'Poate apărea pe bursă' : 'Nu poate apărea pe bursă'}
        </StatusBadge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-body font-medium">{c.vehicleDocuments}</h2>
            <div className="mt-3">
              <RequirementList rows={requirements} />
            </div>
            <div className="mt-5 border-t border-border pt-5">
              <DocumentUpload companyId={company.id} vehicleId={vehicleId} kinds={kinds} />
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-4 text-body font-medium">{accountCopy.documents.history}</h2>
            <DocumentHistory rows={(historyResult.data ?? []) as HistoryRow[]} labels={labels} />
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-4 text-body font-medium">{c.specs}</h2>
            <EditVehicleForm
              vehicleId={vehicleId}
              specs={vehicle}
              assignedDriverId={vehicle.assigned_driver_id}
              drivers={(driversResult.data ?? []) as { id: string; full_name: string }[]}
            />
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-body font-medium">{c.routes}</h2>
            <p className="mt-1.5 mb-4 text-body text-muted">
              Coridoarele pe care vehiculul circulă de obicei. Le folosim ca să îți arătăm cererile
              potrivite.
            </p>
            {routes.length > 0 ? (
              <ul className="mb-4 divide-y divide-border text-body">
                {routes.map((route) => (
                  <li key={route.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {route.from_city ? `${route.from_city}, ` : ''}
                      {countryName.get(route.from_country) ?? route.from_country}
                      {' → '}
                      {route.to_city ? `${route.to_city}, ` : ''}
                      {countryName.get(route.to_country) ?? route.to_country}
                    </span>
                    <KeepingForm action={removeRouteAction}>
                      <input type="hidden" name="vehicle_id" value={vehicleId} />
                      <input type="hidden" name="route_id" value={route.id} />
                      <button
                        type="submit"
                        className="text-small text-danger underline-offset-4 hover:underline"
                      >
                        {c.removeRoute}
                      </button>
                    </KeepingForm>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-body text-muted">{c.noRoutes}</p>
            )}
            <AddRouteForm vehicleId={vehicleId} />
          </section>
        </div>
      </div>
    </div>
  );
}
