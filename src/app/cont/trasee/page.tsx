import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { stopDepartureAction, duplicateAsReturnAction } from '@/app/cont/trasee/actions';
import { BookingDecision } from '@/components/departures/booking-decision';
import { SeriesCard } from '@/components/departures/series-list';
import { HelpLink } from '@/components/help/help-link';
import { HiddenNotice } from '@/components/listings/hidden-notice';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, departureRoute } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { requireAccountContext } from '@/lib/auth/account';
import { DIRECTION_LABELS, formatWindow, readWaypoints } from '@/lib/departures';
import { loadSeries, loadUpcoming } from '@/lib/series-source';
import { createClient } from '@/lib/supabase/server';
import { KeepingForm } from '@/components/ui/keeping-form';

export const metadata: Metadata = { title: departuresCopy.mine.title };

interface MyDeparture {
  id: string;
  direction: 'tur' | 'retur';
  from_country: string;
  from_city: string;
  to_country: string;
  to_city: string;
  waypoints: unknown;
  available_from: string;
  available_to: string | null;
  platform_slots_total: number | null;
  status: string;
  hidden_at: string | null;
  hidden_reason: string | null;
}

interface PendingBooking {
  id: string;
  slots: number;
  created_at: string;
  truck_listing_id: string;
  cargo: { title: string; loading_city: string; unloading_city: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Ciornă',
  active: 'Pe bursă',
  offers_received: 'Cu oferte',
  carrier_selected: 'Transportator ales',
  in_progress: 'În curs',
  delivered: 'Livrat',
  cancelled: 'Anulat',
  expired: 'Retras',
  suspended: 'Suspendat',
  disputed: 'În dispută',
};

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountDepartures);
  const company = context.activeCompany;
  if (!company) redirect(ROUTES.accountCompanyCreate);

  const supabase = await createClient();
  const [departuresResult, seatsResult, bookingsResult] = await Promise.all([
    supabase
      .from('truck_listings')
      .select(
        'id, direction, from_country, from_city, to_country, to_city, waypoints, available_from, available_to, platform_slots_total, status, hidden_at, hidden_reason',
      )
      .eq('company_id', company.id)
      .order('available_from', { ascending: true })
      .limit(50),
    supabase
      .from('v_departures')
      .select('truck_listing_id, slots_taken, slots_free')
      .eq('company_id', company.id),
    supabase
      .from('departure_bookings')
      .select(
        'id, slots, created_at, truck_listing_id, cargo:cargo_listings(title, loading_city, unloading_city)',
      )
      .eq('status', 'reserved')
      .order('created_at', { ascending: true }),
  ]);

  const series = await loadSeries(company.id);
  const upcoming = new Map(
    await Promise.all(
      series.map(async (row) => [row.id, await loadUpcoming(row.id, 4)] as const),
    ),
  );

  const departures = (departuresResult.data ?? []) as MyDeparture[];
  const seats = new Map(
    ((seatsResult.data ?? []) as { truck_listing_id: string; slots_taken: number }[]).map((row) => [
      row.truck_listing_id,
      row.slots_taken,
    ]),
  );
  const mine = new Set(departures.map((d) => d.id));
  const pending = ((bookingsResult.data ?? []) as unknown[])
    .map((row) => {
      const record = row as PendingBooking & { cargo: PendingBooking['cargo'] | PendingBooking['cargo'][] };
      return {
        ...record,
        cargo: Array.isArray(record.cargo) ? (record.cargo[0] ?? null) : record.cargo,
      };
    })
    // RLS already limits these to departures the caller can see; this keeps
    // the list to the active company when somebody belongs to two.
    .filter((booking) => mine.has(booking.truck_listing_id));

  const c = departuresCopy.mine;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <EyebrowPill>{c.eyebrow}</EyebrowPill>
          <h1 className="mt-2 text-h2">{c.title}</h1>
          <p className="mt-2 max-w-[54ch] text-body text-muted">{c.lede}</p>
        </div>
        <Link href={ROUTES.accountDepartureNew} className={buttonClasses('primary', 'sm')}>
          {c.add}
        </Link>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-4 text-body font-medium">{c.pending}</h2>
        {pending.length === 0 ? (
          <p className="text-body text-muted">{c.noPending}</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">{booking.cargo?.title ?? 'Cerere'}</p>
                  <p className="text-small text-muted">
                    {booking.cargo
                      ? `${booking.cargo.loading_city} → ${booking.cargo.unloading_city} · `
                      : ''}
                    {booking.slots === 1 ? 'un loc' : `${booking.slots} locuri`}
                  </p>
                </div>
                <BookingDecision bookingId={booking.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-h3">{departuresCopy.series.title}</h2>
          <p className="mt-1 max-w-[64ch] text-body text-muted">{departuresCopy.series.lede}</p>
          <p className="mt-2">
            <HelpLink topic="series" />
          </p>
        </div>

        {series.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-strong bg-surface p-5">
            <p className="text-body">{departuresCopy.series.empty}</p>
            <p className="mt-1 max-w-[54ch] text-body text-muted">
              {departuresCopy.series.emptyBody}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {series.map((row) => (
              <SeriesCard key={row.id} row={row} upcoming={upcoming.get(row.id) ?? []} />
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <h2 className="border-b border-border px-5 py-3.5 text-body font-medium">{c.title}</h2>
        {departures.length === 0 ? (
          <p className="px-5 py-4 text-body text-muted">{c.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {departures.map((departure) => {
              const taken = seats.get(departure.id) ?? 0;
              const total = departure.platform_slots_total;
              const waypoints = readWaypoints(departure.waypoints);
              return (
                <li key={departure.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 text-body font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <CountryTag cc={departure.from_country} />
                        {departure.from_city}
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CountryTag cc={departure.to_country} />
                        {departure.to_city}
                      </span>
                    </p>
                    <p className="mt-1 text-small text-muted">
                      {DIRECTION_LABELS[departure.direction]} ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatWindow(departure.available_from, departure.available_to)}
                      </span>
                      {waypoints.length > 0 ? ` · prin ${waypoints.map((w) => w.city).join(', ')}` : ''}
                    </p>
                    {total !== null ? (
                      <p className="mt-1 text-small text-muted">{c.seatsTaken(taken, total)}</p>
                    ) : null}
                    {departure.hidden_at !== null ? (
                      <HiddenNotice reason={departure.hidden_reason} />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={departure.status === 'active' ? 'success' : 'neutral'}>
                      {STATUS_LABELS[departure.status] ?? departure.status}
                    </StatusBadge>

                    {departure.status === 'active' ? (
                      <>
                        <Link
                          href={departureRoute(departure.id)}
                          className="text-small text-muted underline-offset-4 hover:underline"
                        >
                          Vezi pe bursă
                        </Link>
                        <KeepingForm action={stopDepartureAction}>
                          <input type="hidden" name="departure_id" value={departure.id} />
                          <button
                            type="submit"
                            className="text-small text-danger underline-offset-4 hover:underline"
                          >
                            {c.stop}
                          </button>
                        </KeepingForm>
                      </>
                    ) : null}

                    <KeepingForm action={duplicateAsReturnAction}>
                      <input type="hidden" name="departure_id" value={departure.id} />
                      <button
                        type="submit"
                        className="text-small text-muted underline-offset-4 hover:underline"
                      >
                        {c.duplicate}
                      </button>
                    </KeepingForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
