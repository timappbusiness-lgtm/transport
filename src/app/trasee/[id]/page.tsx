import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DepartureCard } from '@/components/departures/departure-card';
import { RevealContactButton } from '@/components/departures/reveal-contact-button';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { SeatDeck } from '@/components/ui/seat-deck';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { getAccountContext } from '@/lib/auth/account';
import {
  CARGO_CATEGORY_LABELS,
  DIRECTION_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_NOTES,
  formatWindow,
  hasDeparted,
  isFull,
  priceSentence,
  routeCities,
  seatsSentence,
  type PublicDeparture,
} from '@/lib/departures';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { IconLabel } from '@/components/ui/icon';
import { iconForFact } from '@/lib/icons';

export const metadata: Metadata = { title: 'Traseu' };

interface Carrier {
  id: string;
  name: string;
  verification_status: string;
  county: string | null;
  city: string | null;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from('v_departures_public')
    .select('*')
    .eq('truck_listing_id', id)
    .maybeSingle();

  const departure = data as PublicDeparture | null;
  // A departure that is not on the public board — draft, withdrawn, or past
  // its window — is indistinguishable from one that never existed.
  if (!departure) notFound();

  const context = await getAccountContext();
  const carrier = context ? await loadCarrier(id) : null;
  const [similar] = await Promise.all([loadSimilar(departure)]);

  const cities = routeCities(departure);
  const full = isFull(departure);
  const departed = hasDeparted(departure);
  const c = departuresCopy.detail;

  return (
    <div className="mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <p className="mb-6 text-sm">
        <Link
          href={ROUTES.routes}
          className="text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← {c.back}
        </Link>
      </p>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <EyebrowPill>{DIRECTION_LABELS[departure.direction]}</EyebrowPill>
          <h1 className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[clamp(1.5rem,4vw,2.25rem)]">
            <span className="inline-flex items-center gap-2">
              <CountryTag cc={departure.from_country} />
              {departure.from_city}
            </span>
            <span aria-hidden="true" className="text-ink-soft">
              →
            </span>
            <span className="inline-flex items-center gap-2">
              <CountryTag cc={departure.to_country} />
              {departure.to_city}
            </span>
          </h1>
          <p className="mt-3 font-mono text-sm tabular-nums text-muted">
            {formatWindow(departure.available_from, departure.available_to)}
          </p>
        </div>

        {departed ? (
          <StatusBadge tone="neutral">{c.departed}</StatusBadge>
        ) : full ? (
          <StatusBadge tone="warning">{departuresCopy.card.full}</StatusBadge>
        ) : null}
      </header>

      {departed || full ? (
        <p className="mt-6 rounded-input border border-warning/40 bg-warning/8 px-4 py-3 text-sm">
          {departed ? c.departed : c.full}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">
              <IconLabel as={iconForFact('route')} size="sm" tone="strong">
                {c.route}
              </IconLabel>
            </h2>
            <ol className="mt-4 flex flex-col gap-3">
              {cities.map((city, index) => (
                <li key={`${city}-${index}`} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-[6px] flex-none rounded-full bg-border-strong"
                  />
                  <span className={index === 0 || index === cities.length - 1 ? 'font-medium' : 'text-muted'}>
                    {city}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {departure.platform_slots_total !== null ? (
            <section className="rounded-card border border-border bg-surface p-5">
              <h2 className="text-sm font-medium">
              <IconLabel as={iconForFact('capacity')} size="sm" tone="strong">
                {c.seats}
              </IconLabel>
            </h2>
              <p className="mt-1 text-sm text-muted">{seatsSentence(departure)}</p>
              <div className="mt-4 max-w-[22rem]">
                <SeatDeck
                  taken={departure.slots_taken}
                  total={departure.platform_slots_total}
                  freeLabel="liber"
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">
              <IconLabel as={iconForFact('service')} size="sm" tone="strong">
                {c.services}
              </IconLabel>
            </h2>
            <dl className="mt-3 flex flex-col gap-3">
              {departure.service_types.map((service) => (
                <div key={service}>
                  <dt className="text-sm font-medium">{SERVICE_TYPE_LABELS[service]}</dt>
                  <dd className="text-sm text-muted">{SERVICE_TYPE_NOTES[service]}</dd>
                </div>
              ))}
            </dl>

            <h2 className="mt-6 text-sm font-medium">{c.accepts}</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {departure.accepted_vehicle_types.map((category) => (
                <li
                  key={category}
                  className="rounded-pill border border-border bg-ground-alt px-2.5 py-1 text-xs text-muted"
                >
                  {CARGO_CATEGORY_LABELS[category]}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">
              <IconLabel as={iconForFact('price')} size="sm" tone="strong">
                {c.price}
              </IconLabel>
            </h2>
            <p className="mt-1 font-mono text-[1.125rem] tabular-nums">
              {priceSentence(departure) ?? departuresCopy.card.noPrice}
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <Link
                href={`${ROUTES.newRequest}?plecare=${departure.truck_listing_id}`}
                className={buttonClasses('primary', 'md')}
              >
                {c.request}
              </Link>
              <RevealContactButton
                truckListingId={departure.truck_listing_id}
                signedIn={context !== null}
              />
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">
              <IconLabel as={iconForFact('company')} size="sm" tone="strong">
                {c.carrier}
              </IconLabel>
            </h2>
            {carrier ? (
              <div className="mt-3">
                <p className="text-sm font-medium">{carrier.name}</p>
                {carrier.city || carrier.county ? (
                  <p className="text-xs text-muted">
                    {[carrier.city, carrier.county].filter(Boolean).join(', ')}
                  </p>
                ) : null}
                {carrier.verification_status === 'verified' ? (
                  <div className="mt-3">
                    <StatusBadge tone="success">{c.verified}</StatusBadge>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {c.carrierHidden}{' '}
                <Link
                  href={ROUTES.signIn}
                  className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
                >
                  Autentificare
                </Link>
              </p>
            )}
          </section>
        </aside>
      </div>

      {departed || full ? (
        <section className="mt-12">
          <h2 className="text-[1.125rem]">{c.similar}</h2>
          {similar.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-4">
              {similar.map((other) => (
                <DepartureCard key={other.truck_listing_id} departure={other} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{c.noSimilar}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Who is driving, for signed-in visitors only.
 *
 * Two hops on purpose: `v_departures` is authenticated-only and is the only
 * place that maps a departure to a company, and `v_companies_public` holds
 * what may then be shown. anon can reach neither, so there is no path from
 * the public board to a company name.
 */
async function loadCarrier(truckListingId: string): Promise<Carrier | null> {
  const supabase = await createClient();
  const { data: departure } = await supabase
    .from('v_departures')
    .select('company_id')
    .eq('truck_listing_id', truckListingId)
    .maybeSingle();

  const companyId = (departure as { company_id: string | null } | null)?.company_id;
  if (!companyId) return null;

  const { data } = await supabase
    .from('v_companies_public')
    .select('id, name, verification_status, county, city')
    .eq('id', companyId)
    .maybeSingle();

  return (data as Carrier | null) ?? null;
}

/** Other live departures on the same corridor, for when this one cannot serve. */
async function loadSimilar(departure: PublicDeparture): Promise<PublicDeparture[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('v_departures_public')
    .select('*')
    .eq('from_country', departure.from_country)
    .eq('to_country', departure.to_country)
    .neq('truck_listing_id', departure.truck_listing_id)
    .gt('slots_free', 0)
    .order('available_from', { ascending: true })
    .limit(3);

  return (data ?? []) as PublicDeparture[];
}
