import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DepartureForm, type EligibleVehicle } from '@/components/departures/departure-form';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { requireAccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import { ActionGate } from '@/components/onboarding/action-gate';
import { withJourney } from '@/lib/carrier-journey';
import { loadJourney } from '@/lib/journey-source';

export const metadata: Metadata = { title: departuresCopy.form.title };

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountDepartureNew);
  const company = context.activeCompany;
  if (!company) redirect(withJourney(ROUTES.accountCompanyCreate, 'traseu', ROUTES.accountDepartureNew));

  // A firm that cannot publish yet is shown the way through here, where it
  // wanted to publish — not a form it would fill in and be refused at the
  // end. `guard_truck_listing_publish()` still refuses it either way.
  const journey = await loadJourney(context);

  const supabase = await createClient();
  // A departure can only be published on a vehicle whose papers are in
  // order — the database refuses otherwise — so the form offers only those
  // rather than letting somebody fill it in and be turned away at the end.
  const { data } = await supabase
    .from('vehicles')
    .select('id, plate_number, make, model')
    .eq('company_id', company.id)
    .eq('is_compliant', true)
    .order('plate_number');

  const vehicles = (data ?? []) as EligibleVehicle[];
  const c = departuresCopy.form;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-body text-muted">{c.lede}</p>
        <p className="mt-2">
          <HelpLink topic="routeForm" />
        </p>
      </div>

      {journey.stage !== 'verified' ? (
        <div className="max-w-[34rem]">
          <ActionGate
            action="traseu"
            stage={journey.stage}
            minutes={journey.minutes}
            next={ROUTES.accountDepartureNew}
          />
        </div>
      ) : vehicles.length === 0 ? (
        <section className="rounded-card border border-warning/40 bg-warning/8 p-5">
          <p className="text-body">{c.noVehicle}</p>
          <div className="mt-4">
            <Link href={ROUTES.accountFleet} className={buttonClasses('primary', 'sm')}>
              {c.noVehicleAction}
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-card border border-border bg-surface p-5 sm:p-6">
          <DepartureForm vehicles={vehicles} />
        </section>
      )}
    </div>
  );
}
