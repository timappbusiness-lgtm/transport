import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClaimLink } from '@/components/onboarding/claim-link';
import { CompanyStep } from '@/components/onboarding/company-step';
import { ProfileStep } from '@/components/onboarding/profile-step';
import { VehicleStep } from '@/components/onboarding/vehicle-step';
import { Card, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, onboardingRoute } from '@/config/routes';
import { onboardingCopy } from '@/content/inscrieri';
import {
  CONSENT_LABELS,
  STATUS_LABELS,
  STEPS,
  STEP_LABELS,
  doneCount,
  parseStep,
  type Step,
} from '@/lib/onboarding';
import { loadCompanyOptions } from '@/lib/company-options-source';
import { loadNotificationsAdminData } from '@/lib/notifications-admin-source';
import { loadOnboarding, loadOnboardingContents, stepsOf } from '@/lib/onboarding-source';
import { VEHICLE_TYPE_LABELS } from '@/lib/vehicles';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: onboardingCopy.wizard.meta.title };
export const dynamic = 'force-dynamic';

const c = onboardingCopy.wizard;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text !== '' ? text : null;
}

/**
 * Vrăjitorul, cu pașii salvați pe măsură ce se fac.
 *
 * Pasul curent stă în adresă, nu în starea unei componente: un om
 * întrerupt de un telefon închide fila și se întoarce mâine pe același
 * link. Ce este gata se citește din tabele — `admin_assisted_onboardings()`
 * derivă fiecare bifă — deci nu există niciun „pas 2 terminat" scris
 * undeva care să se contrazică cu realitatea.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Params>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const row = await loadOnboarding(id);
  if (row === null) notFound();

  const state = stepsOf(row);
  const raw = one(query, 'pas');
  const step: Step | 'link' = raw === 'link' ? 'link' : parseStep(raw);

  const contents =
    row.company_id === null
      ? { documents: [], vehicles: [] }
      : await loadOnboardingContents(row.company_id);

  // Only on the steps that need them: the options query and the mail
  // state are two round trips nobody on step one is waiting for.
  const options = step === 'profil' ? await loadCompanyOptions() : null;
  const mail =
    step === 'link'
      ? (await loadNotificationsAdminData()).provider.configured !== 'nu'
      : true;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link
            href={ROUTES.adminOnboardings}
            className="text-muted underline-offset-4 hover:underline"
          >
            ← {c.back}
          </Link>
        </p>
        <EyebrowPill>{onboardingCopy.admin.eyebrow}</EyebrowPill>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-h2">
          {row.company_name ?? row.contact_name}
          <StatusBadge tone={row.status === 'revendicat' ? 'success' : 'neutral'}>
            {STATUS_LABELS[row.status]}
          </StatusBadge>
        </h1>
        <p className="mt-1 text-small text-muted">
          {row.contact_name} · {row.contact_email} · {row.contact_phone}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Acord: {CONSENT_LABELS[row.consent_channel]},{' '}
          {new Date(row.consent_at).toLocaleDateString('ro-RO')} · {row.staff_name}
        </p>
      </div>

      <nav aria-label={c.title} className="flex flex-wrap gap-2">
        {STEPS.map((option, index) => (
          <Link
            key={option}
            href={onboardingRoute(row.id, option)}
            aria-current={option === step ? 'page' : undefined}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-small',
              option === step
                ? 'border-transparent bg-foreground text-ground'
                : state[option]
                  ? 'border-success/45 bg-success/8 text-foreground'
                  : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {index + 1}. {STEP_LABELS[option]}
          </Link>
        ))}
        <Link
          href={onboardingRoute(row.id, 'link')}
          aria-current={step === 'link' ? 'page' : undefined}
          className={cn(
            'rounded-pill border px-3.5 py-1.5 text-small',
            step === 'link'
              ? 'border-transparent bg-foreground text-ground'
              : 'border-border-strong text-muted hover:text-foreground',
          )}
        >
          5. {c.finish.title}
        </Link>
      </nav>

      <p className="text-xs text-muted">
        {onboardingCopy.admin.steps(doneCount(state), STEPS.length)}
      </p>

      {step === 'firma' ? (
        <Card className="p-5">
          <h2 className="text-h3">{c.company.title}</h2>
          <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.company.lede}</p>
          {row.company_id === null ? (
            <div className="mt-5">
              <CompanyStep onboardingId={row.id} />
            </div>
          ) : (
            <p className="mt-4 rounded-input border border-success/45 bg-success/8 p-3 text-small">
              {c.company.done}
            </p>
          )}
        </Card>
      ) : null}

      {step === 'documente' ? (
        <Card className="p-5">
          <h2 className="text-h3">{c.documents.title}</h2>
          <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.documents.lede}</p>
          <p className="mt-3 max-w-[66ch] rounded-input border border-warning/45 bg-warning/8 p-3 text-small">
            {c.documents.fourEyes}
          </p>

          {contents.documents.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{c.documents.empty}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {contents.documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-border p-2.5 text-sm"
                >
                  <span>
                    {doc.label}
                    {doc.uploaded_on_behalf ? (
                      <span className="ml-2 text-xs text-muted">
                        · {c.documents.onBehalf}
                      </span>
                    ) : null}
                  </span>
                  <StatusBadge tone="neutral">{doc.status}</StatusBadge>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-small text-muted">
            Documentele se încarcă din{' '}
            <Link
              href={`${ROUTES.adminCompanies}?firma=${row.company_id ?? ''}`}
              className="underline underline-offset-4"
            >
              ecranul firmei
            </Link>
            , cu aceleași câmpuri ca la o firmă obișnuită. {c.documents.skipHint}
          </p>

          <p className="mt-4 text-sm">
            <Link
              href={onboardingRoute(row.id, 'vehicule')}
              className="underline underline-offset-4"
            >
              {c.documents.skip} →
            </Link>
          </p>
        </Card>
      ) : null}

      {step === 'vehicule' ? (
        <Card className="p-5">
          <h2 className="text-h3">{c.vehicles.title}</h2>
          <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.vehicles.lede}</p>

          {contents.vehicles.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{c.vehicles.empty}</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-2">
              {contents.vehicles.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className="rounded-pill border border-border px-3 py-1 text-small"
                >
                  {vehicle.plate_number} ·{' '}
                  {VEHICLE_TYPE_LABELS[
                    vehicle.vehicle_type as keyof typeof VEHICLE_TYPE_LABELS
                  ] ?? vehicle.vehicle_type}
                </li>
              ))}
            </ul>
          )}

          {row.company_id !== null ? (
            <div className="mt-5">
              <VehicleStep onboardingId={row.id} companyId={row.company_id} />
            </div>
          ) : null}

          <p className="mt-4 text-sm">
            <Link href={onboardingRoute(row.id, 'profil')} className="underline underline-offset-4">
              {c.vehicles.skip} →
            </Link>
          </p>
        </Card>
      ) : null}

      {step === 'profil' && row.company_id !== null ? (
        <Card className="p-5">
          <h2 className="text-h3">{c.profile.title}</h2>
          <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.profile.lede}</p>
          <div className="mt-5">
            <ProfileStep
              onboardingId={row.id}
              companyId={row.company_id}
              services={(options?.services ?? []).map((o) => ({
                code: o.code,
                label: o.label,
              }))}
              equipment={(options?.equipment ?? []).map((o) => ({
                code: o.code,
                label: o.label,
              }))}
            />
          </div>
        </Card>
      ) : null}

      {step === 'link' ? (
        <Card className="p-5">
          <h2 className="text-h3">{c.finish.title}</h2>
          <p className="mt-1 max-w-[66ch] text-sm text-muted">{c.finish.lede}</p>
          <div className="mt-5">
            <ClaimLink
              onboardingId={row.id}
              hasCompany={row.company_id !== null}
              mailConfigured={mail}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
