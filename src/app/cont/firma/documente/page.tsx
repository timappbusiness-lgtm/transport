import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DocumentHistory, type HistoryRow } from '@/components/account/document-history';
import {
  DocumentsScreen,
  type ScreenDocument,
  type ScreenRequirement,
} from '@/components/account/documents-screen';
import { SubmitForReview } from '@/components/account/submit-for-review';
import { JourneyBecause } from '@/components/onboarding/journey-because';
import { EyebrowPill } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { ROUTES } from '@/config/routes';
import { inscriereCopy } from '@/content/inscriere';
import { requireAccountContext } from '@/lib/auth/account';
import { safeNextPath } from '@/lib/auth/next-path';
import { carries, isJourneyAction, withJourney } from '@/lib/carrier-journey';
import { countChecklist } from '@/lib/document-checklist';
import { loadJourney } from '@/lib/journey-source';
import { reviewProgress } from '@/lib/review';
import { createClient } from '@/lib/supabase/server';
import { formatPlate } from '@/lib/vehicles';
import type { CompanyType } from '@/lib/validation/auth';

export const metadata: Metadata = { title: inscriereCopy.documents.titleCompany };

const c = inscriereCopy.documents;

/**
 * Every document the firm owes, on one screen: the firm's own, and each
 * vehicle's. `?vehicul=` narrows it to one vehicle — the screen the fleet
 * list links to — with „Adaugă încă un vehicul" on it.
 *
 * `?pentru=` and `?next=` are the journey's: a carrier sent here on the
 * way to an offer reads why at the top and has the way back once the
 * documents are with us.
 *
 * What is required comes from the database's views; what each document is
 * for comes from `inscriereCopy.reasons`. Submitting goes through
 * `submit_company_for_review()`, unchanged.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vehicul?: string; pentru?: string; next?: string }>;
}) {
  const { vehicul, pentru, next } = await searchParams;
  const action = isJourneyAction(pentru) ? pentru : null;
  const back = safeNextPath(next, '') || null;

  const context = await requireAccountContext(ROUTES.accountDocuments);
  const company = context.activeCompany;
  if (!company) redirect(withJourney(ROUTES.accountCompanyCreate, action, back));

  const journey = await loadJourney(context);
  // A vehicle's documents need the vehicle: that step comes first.
  if (journey.stage === 'no_vehicle') redirect(withJourney(ROUTES.accountFleet, action, back));

  const supabase = await createClient();
  const [latestResult, historyResult] = await Promise.all([
    supabase
      .from('documents')
      .select('id, kind, vehicle_id, status, valid_until, extracted, rejection_reason, extraction_error, created_at')
      .eq('company_id', company.id)
      .in('status', ['uploaded', 'parsing', 'pending', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('documents')
      .select('id, kind, status, valid_until, rejection_reason, created_at')
      .eq('company_id', company.id)
      .neq('status', 'replaced')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // The newest document per requirement: the one the row talks about.
  const latest = new Map<string, ScreenDocument>();
  for (const doc of latestResult.data ?? []) {
    const key = `${doc.vehicle_id ?? 'firma'}:${doc.kind}`;
    if (latest.has(key)) continue;
    const declared = (doc.extracted as { declared?: { valid_until?: unknown } } | null)?.declared?.valid_until;
    latest.set(key, {
      id: doc.id,
      status: doc.status,
      validUntil: doc.valid_until,
      declared: typeof declared === 'string' ? declared : null,
      rejectionReason: doc.rejection_reason,
      extractionError: doc.extraction_error,
    });
  }

  const requirements: ScreenRequirement[] = journey.rows.map((row) => ({
    scope: row.scope,
    kind: row.kind,
    label: row.label,
    reason: inscriereCopy.reasons[row.kind] ?? inscriereCopy.reasons.fallback!,
    isBlocking: row.isBlocking,
    state: row.state,
    validUntil: row.validUntil,
    vehicleId: row.vehicleId ?? null,
    latest: latest.get(`${row.vehicleId ?? 'firma'}:${row.kind}`) ?? null,
  }));

  const kinds = [...new Map(journey.rows.map((row) => [row.kind, { kind: row.kind, label: row.label, scope: row.scope }])).values()];
  const vehicles = journey.vehicles.map((vehicle) => ({ id: vehicle.id, plate: formatPlate(vehicle.plate) }));
  const focus = vehicul !== undefined && vehicles.some((vehicle) => vehicle.id === vehicul) ? vehicul : null;
  const focusPlate = vehicles.find((vehicle) => vehicle.id === focus)?.plate ?? null;

  const companyType = company.company_type as CompanyType;
  const counts = countChecklist(journey.rows);
  const vehicleRows = journey.rows.filter((row) => row.scope === 'vehicle');
  const vehiclesReady = !carries(companyType) || (journey.vehicles.length > 0 && countChecklist(vehicleRows).blockingMissing === 0);
  const progress = reviewProgress(
    journey.rows.filter((row) => row.scope === 'company').map((row) => ({ is_blocking: row.isBlocking, state: row.state })),
  );
  const missing = journey.rows.filter((row) => row.isBlocking && !['ok', 'in_review'].includes(row.state));

  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{focusPlate !== null ? c.titleVehicle(focusPlate) : c.titleCompany}</h1>
        <p className="mt-2 max-w-[56ch] text-body text-muted">{c.lede}</p>
        <p className="mt-2 flex flex-wrap gap-x-4">
          <HelpLink topic="documents" />
          <HelpLink topic="expiry" label="Ce se întâmplă la expirare" />
          {focus !== null ? (
            <Link href={withJourney(ROUTES.accountDocuments, action, back)} className="text-small link-accent">
              {c.otherVehicles}
            </Link>
          ) : null}
        </p>
      </div>
      {action !== null ? <JourneyBecause action={action} /> : null}

      <DocumentsScreen
        companyId={company.id}
        requirements={requirements}
        vehicles={vehicles}
        focusVehicleId={focus}
        kinds={kinds}
      />

      <div className="flex flex-col gap-2">
        {counts.blockingMissing > 0 && focus === null ? (
          <p className="text-small text-muted">{c.stillMissing(missing.map((row) => row.label).join(', '))}</p>
        ) : null}
        <SubmitForReview
          companyId={company.id}
          status={company.verification_status}
          progress={progress}
          needsVehicles={carries(companyType)}
          vehiclesReady={vehiclesReady}
          note={company.verification_note ?? null}
        />
        {back !== null && (journey.stage === 'in_review' || journey.stage === 'verified') ? (
          <Link href={back} className="text-body link-accent">
            {c.back}
          </Link>
        ) : null}
      </div>

      <details className="rounded-card border border-border bg-surface p-5">
        <summary className="cursor-pointer text-body font-medium">{c.history}</summary>
        <div className="mt-4">
          <DocumentHistory
            rows={(historyResult.data ?? []) as HistoryRow[]}
            labels={Object.fromEntries(kinds.map((entry) => [entry.kind, entry.label]))}
          />
        </div>
      </details>
    </div>
  );
}
