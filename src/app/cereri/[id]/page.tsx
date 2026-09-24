import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StartConversation } from '@/components/messages/start-conversation';
import { SendOffer } from '@/components/offers/send-offer';
import { ActionGate } from '@/components/onboarding/action-gate';
import { loadJourney } from '@/lib/journey-source';
import { CarrierCount } from '@/components/requests/carrier-count';
import { RevealRequestContact } from '@/components/requests/reveal-request-contact';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { offersCopy } from '@/content/oferte';
import { getAccountContext } from '@/lib/auth/account';
import { signInUrlFor } from '@/lib/auth/next-path';
import {
  CARGO_CATEGORY_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_NOTES,
  formatWindow,
} from '@/lib/departures';
import { FEATURES } from '@/lib/features';
import { indicativeRange } from '@/lib/offers';
import {
  loadEligibleVehicles,
  loadMyPendingOffers,
  loadOfferQuota,
  loadOfferSettings,
} from '@/lib/offers-source';
import { loadPrices } from '@/lib/prices-source';
import { formatKm, vehicleLine, type PublicRequest } from '@/lib/requests';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { IconLabel } from '@/components/ui/icon';
import { CategoryTile } from '@/components/ui/category-art';
import { iconForFact } from '@/lib/icons';
import { BackToBoard } from '@/components/continuity/board-memory';

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
      <dt className="text-small text-muted sm:w-[12rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-body">{children}</dd>
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

  const context = await getAccountContext();

  // O cerere privată nu este în vederea publică, dar cei invitați au
  // voie să o deschidă — iar e-mailul de invitație duce exact aici.
  // Dreptul îl decide `can_see_listing()`, în bază; pagina doar
  // întreabă. Pentru un vizitator nici nu se întreabă: o cerere privată
  // nu are cum să fie a lui.
  const fallback =
    data === null && context !== null
      ? ((await supabase.rpc('private_request_for_viewer', { p_id: id })).data ?? [])[0] ?? null
      : null;

  const request = (data ?? fallback) as PublicRequest | null;
  // A request that is not on the public board — a draft, withdrawn, or past
  // its loading window — is indistinguishable from one that never existed.
  if (!request) notFound();
  const detail = context ? await loadDetail(id) : null;
  // Owner only, and enforced by `count_matching_carriers` rather than by
  // this line: a carrier reading somebody else's request has no business
  // knowing how much competition it has, and a rule only the page keeps
  // is not a rule.
  const carrierCount = context ? await countCarriers(supabase, id) : null;
  const offering = FEATURES.offers ? await loadOfferPanel(context, id, request) : null;
  // A firm that cannot act yet sees the way through instead of the offer
  // box and the contact button: why, the missing step, one button to it —
  // and back here afterwards. `company_can_act()` still refuses either.
  const journey = context?.profile?.account_type === 'company' ? await loadJourney(context) : null;
  const gated = journey !== null && journey.stage !== 'verified' ? journey : null;
  const c = requestsCopy.detail;
  const km = formatKm(request.estimated_km);
  const vehicle = vehicleLine(request);

  return (
    <div className="mx-auto w-full max-w-[60rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <p className="text-body">
        <BackToBoard board={ROUTES.requests} className="text-muted underline-offset-4 hover:underline">
          ← {c.back}
        </BackToBoard>
      </p>

      <header className="mt-6">
        {/* The same drawing the card on the board carried, so the page
            that opens is recognisably the card that was clicked. */}
        <div className="flex items-center gap-3">
          <CategoryTile category={request.category} size="md" />
          <EyebrowPill>{CARGO_CATEGORY_LABELS[request.category]}</EyebrowPill>
        </div>
        <h1 className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-h2">
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
            <h2 className="text-h3">
              <IconLabel as={iconForFact('route')} size="md" tone="strong">
                {c.route}
              </IconLabel>
            </h2>
            <dl className="mt-4 flex flex-col">
              <Row label={c.window}>
                {formatWindow(request.loading_from, request.loading_to)}
              </Row>
              {km ? (
                <Row label="Distanță estimată">
                  {/* The key number on this card, as on the board. */}
                  <span className="font-mono font-medium tabular-nums text-accent">{km}</span>
                </Row>
              ) : null}
              <Row label={c.service}>
                {SERVICE_TYPE_LABELS[request.service_type]}
                <span className="block text-small text-muted">
                  {SERVICE_TYPE_NOTES[request.service_type]}
                </span>
              </Row>
            </dl>
          </div>

          <div className="rounded-card border border-border bg-surface p-5 sm:p-6">
            <h2 className="text-h3">
              <IconLabel as={iconForFact('vehicle')} size="md" tone="strong">
                {c.vehicle}
              </IconLabel>
            </h2>
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
              <h2 className="text-h3">{c.notes}</h2>
              <p className="mt-3 whitespace-pre-line break-words text-body">{detail.description}</p>
            </div>
          ) : null}

          {context === null ? (
            <p className="max-w-[54ch] text-body text-muted">{c.anonBody}</p>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {/* The offer comes first: a carrier who opened this page came to
              bid, and the contact is what they buy when bidding is not
              what they want. */}
          {/* A visitor gets one card and one primary action. The offer
              box and the contact button used to each ask them to sign in,
              in two different shapes, one above the other. */}
          {context === null ? (
            <section className="rounded-card border border-border bg-surface p-5">
              <p className="text-body">{offersCopy.entry.visitor.body}</p>
              <Link
                href={signInUrlFor(requestRoute(request.id))}
                className={`${buttonClasses('primary', 'md')} mt-4 w-full`}
              >
                {offersCopy.entry.visitor.signIn}
              </Link>
              <p className="mt-4 border-t border-border pt-4 text-small text-muted">
                {offersCopy.entry.visitor.join}{' '}
                <Link href={ROUTES.carrierSignup} className="link-accent">
                  {offersCopy.entry.visitor.joinAction}
                </Link>
              </p>
            </section>
          ) : null}
          {gated !== null && gated.stage !== 'verified' ? (
            <ActionGate action="oferta" stage={gated.stage} minutes={gated.minutes} next={requestRoute(request.id)} />
          ) : null}
          {offering !== null && context !== null && gated === null ? (
            <section aria-label={offersCopy.form.title}>
              <SendOffer
                request={{ id: request.id, loading_from: request.loading_from }}
                context={context}
                vehicles={offering.vehicles}
                settings={offering.settings}
                quota={offering.quota}
                pendingOfferId={offering.pendingOfferId}
                priceRange={offering.priceRange}
              />
            </section>
          ) : null}
          {context !== null && gated === null ? (
          <div className="rounded-card border border-border bg-surface p-5">
            <RevealRequestContact
              requestId={request.id}
              signedIn
              variant={offering !== null ? 'secondary' : 'primary'}
            />
            {/* Aceeași poartă ca la contact, și o spune înainte de apăsare:
                o conversație este un contact, și se numără o singură dată
                pe anunț. Vizitatorii neautentificați văd butonul de
                contact de deasupra, care îi trimite la autentificare. */}
            {FEATURES.messages ? (
              <div className="mt-4 border-t border-border pt-4">
                <StartConversation requestId={request.id} />
              </div>
            ) : null}
          </div>
          ) : null}
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

/**
 * Everything the „Trimite ofertă" panel needs, read in one place.
 *
 * Only for a signed-in visitor: a stranger gets the sentence that asks
 * them to sign in, and none of these queries would answer anything for
 * them anyway. The fleet is read only when the firm needs one — a
 * forwarder subcontracts and offers no vehicle.
 */
async function loadOfferPanel(
  context: Awaited<ReturnType<typeof getAccountContext>>,
  listingId: string,
  request: PublicRequest,
): Promise<{
  vehicles: Awaited<ReturnType<typeof loadEligibleVehicles>>;
  settings: Awaited<ReturnType<typeof loadOfferSettings>>;
  quota: Awaited<ReturnType<typeof loadOfferQuota>>;
  pendingOfferId: string | null;
  priceRange: { low: string; high: string } | undefined;
} | null> {
  if (context === null) {
    return {
      vehicles: [],
      settings: await loadOfferSettings(),
      quota: null,
      pendingOfferId: null,
      priceRange: undefined,
    };
  }

  // Nobody bids on their own request, and the panel says so by not being
  // there. `guard_offer_insert()` refuses it anyway; this keeps a client
  // reading their own posting from being offered a form they cannot use.
  if (await isOwnRequest(listingId, context)) return null;

  const company = context.activeCompany;
  const [vehicles, settings, quota, pending, prices] = await Promise.all([
    company !== null && company.company_type !== 'expeditie'
      ? loadEligibleVehicles(company.id)
      : Promise.resolve([]),
    loadOfferSettings(),
    loadOfferQuota(),
    loadMyPendingOffers([listingId]),
    loadPrices(),
  ]);

  return {
    vehicles,
    settings,
    quota,
    pendingOfferId: pending.get(listingId) ?? null,
    priceRange: indicativeRange(request, prices.rates, prices.settings) ?? undefined,
  };
}

/** The same test `guard_offer_insert()` makes: poster, or a colleague of one. */
async function isOwnRequest(
  listingId: string,
  context: NonNullable<Awaited<ReturnType<typeof getAccountContext>>>,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('cargo_listings')
    .select('posted_by, company_id')
    .eq('id', listingId)
    .maybeSingle();

  if (!data) return false;
  if (data.posted_by === context.user.id) return true;
  return (
    data.company_id !== null &&
    context.memberships.some((membership) => membership.company.id === data.company_id)
  );
}
