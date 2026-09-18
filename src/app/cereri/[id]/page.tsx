import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CarrierCount } from '@/components/requests/carrier-count';
import { RevealRequestContact } from '@/components/requests/reveal-request-contact';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { getAccountContext } from '@/lib/auth/account';
import {
  CARGO_CATEGORY_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_NOTES,
  formatWindow,
} from '@/lib/departures';
import { formatKm, vehicleLine, type PublicRequest } from '@/lib/requests';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Cerere de transport' };

/**
 * One line of a detail panel.
 *
 * `DataRow` from the primitives is mono, tabular and truncated, which is
 * right for a plate or a count and wrong for "aripa dreapta față lovită,
 * ușa nu se deschide". This one wraps.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-[0.8125rem] text-muted sm:w-[12rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-[0.875rem]">{children}</dd>
    </div>
  );
}

/** The extra columns a session buys. Still no contact: that costs a plan. */
interface RequestDetail {
  description: string | null;
  damage_notes: string | null;
  has_keys: boolean;
  is_damaged: boolean;
  wheels_turn: boolean;
  steering_works: boolean;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('v_requests_public')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const request = data as PublicRequest | null;
  // A request that is not on the public board — a draft, withdrawn, or past
  // its loading window — is indistinguishable from one that never existed.
  if (!request) notFound();

  const context = await getAccountContext();
  const detail = context ? await loadDetail(id) : null;
  // Owner only, and enforced by `count_matching_carriers` rather than by
  // this line: a carrier reading somebody else's request has no business
  // knowing how much competition it has, and a rule only the page keeps
  // is not a rule.
  const carrierCount = context ? await countCarriers(supabase, id) : null;
  const c = requestsCopy.detail;
  const km = formatKm(request.estimated_km);
  const vehicle = vehicleLine(request);

  return (
    <div className="mx-auto w-full max-w-[60rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <p className="text-sm">
        <Link href={ROUTES.requests} className="text-muted underline-offset-4 hover:underline">
          ← {c.back}
        </Link>
      </p>

      <header className="mt-6">
        <EyebrowPill>{CARGO_CATEGORY_LABELS[request.category]}</EyebrowPill>
        <h1 className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[clamp(1.5rem,4vw,2rem)]">
          <span>{request.from_city}</span>
          <CountryTag cc={request.from_country} />
          <span className="text-muted">→</span>
          <span>{request.to_city}</span>
          <CountryTag cc={request.to_country} />
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge tone={request.needs_winch ? 'warning' : 'success'}>
            {request.needs_winch ? requestsCopy.card.winch : requestsCopy.card.running}
          </StatusBadge>
          <StatusBadge tone="neutral">
            {request.board === 'curse'
              ? requestsCopy.card.fromCompany
              : requestsCopy.card.fromIndividual}
          </StatusBadge>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        <section className="flex flex-col gap-4">
          <CarrierCount count={carrierCount} />
          <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[1.0625rem]">{c.route}</h2>
            <dl className="mt-4 flex flex-col">
              <Row label={c.window}>
                {formatWindow(request.loading_from, request.loading_to)}
              </Row>
              {km ? <Row label="Distanță estimată">{km}</Row> : null}
              <Row label={c.service}>
                {SERVICE_TYPE_LABELS[request.service_type]}
                <span className="block text-xs text-muted">
                  {SERVICE_TYPE_NOTES[request.service_type]}
                </span>
              </Row>
            </dl>
          </div>

          <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-[1.0625rem]">{c.vehicle}</h2>
            <dl className="mt-4 flex flex-col">
              <Row label="Categoria">{CARGO_CATEGORY_LABELS[request.category]}</Row>
              {vehicle ? <Row label="Model">{vehicle}</Row> : null}
              {request.weight_kg !== null ? (
                <Row label="Greutate">{requestsCopy.card.weight(request.weight_kg)}</Row>
              ) : null}
              <Row label={c.condition}>
                {request.is_running
                  ? requestsCopy.form.condition.isRunning
                  : requestsCopy.card.winch}
              </Row>
              {detail ? (
                <>
                  <Row label="Roțile se învârt">{detail.wheels_turn ? 'Da' : 'Nu'}</Row>
                  <Row label="Direcția funcționează">
                    {detail.steering_works ? 'Da' : 'Nu'}
                  </Row>
                  <Row label="Are cheile">{detail.has_keys ? 'Da' : 'Nu'}</Row>
                  {detail.is_damaged && detail.damage_notes ? (
                    <Row label="Avarii">{detail.damage_notes}</Row>
                  ) : null}
                </>
              ) : null}
            </dl>
          </div>

          {detail?.description ? (
            <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
              <h2 className="text-[1.0625rem]">{c.notes}</h2>
              <p className="mt-3 whitespace-pre-line text-sm">{detail.description}</p>
            </div>
          ) : null}

          {context === null ? (
            <p className="max-w-[54ch] text-sm text-muted">{c.anonBody}</p>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-border bg-surface p-5">
            <RevealRequestContact requestId={request.id} signedIn={context !== null} />
          </div>
          <Link href={ROUTES.newRequest} className={buttonClasses('secondary', 'md')}>
            {requestsCopy.board.publish}
          </Link>
        </aside>
      </div>
    </div>
  );
}

/**
 * What a session adds: the free text, and the three condition flags the
 * public view leaves out because a card does not need them.
 *
 * Read from `cargo_listings` under RLS, whose select policy lets any
 * signed-in person read an active listing. The contact is not here — that
 * is `reveal_contact`, and it costs one from the plan.
 */
async function loadDetail(id: string): Promise<RequestDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cargo_listings')
    .select(
      'description, cargo_vehicle_details(damage_notes, has_keys, is_damaged, wheels_turn, steering_works)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  const vehicle = Array.isArray(data.cargo_vehicle_details)
    ? data.cargo_vehicle_details[0]
    : data.cargo_vehicle_details;
  if (!vehicle) return null;

  return {
    description: data.description,
    damage_notes: vehicle.damage_notes,
    has_keys: vehicle.has_keys,
    is_damaged: vehicle.is_damaged,
    wheels_turn: vehicle.wheels_turn,
    steering_works: vehicle.steering_works,
  };
}

/**
 * The count, for whoever is allowed one.
 *
 * `count_matching_carriers` raises for anybody but the request's own
 * side, so „owner only" is a database answer and this returns null for
 * everybody else — which renders as nothing rather than as a zero.
 */
async function countCarriers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('count_matching_carriers', { p_listing_id: id });
  if (error || typeof data !== 'number') return null;
  return data;
}
