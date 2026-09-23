import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TopBar } from '@/components/app/top-bar';
import { ReceivedOffers } from '@/components/offers/received-offers';
import { Card, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { requireAccountContext } from '@/lib/auth/account';
import { CARGO_CATEGORY_LABELS, type CargoCategory } from '@/lib/departures';
import { formatDay, isLive, requestStateLabel } from '@/lib/offers';
import { VisibilityPanel } from '@/components/requests/visibility-panel';
import { loadFavourites } from '@/lib/favourites-source';
import { loadOffersForRequest, loadOfferThread } from '@/lib/offers-source';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Cererea mea' };
export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  title: string | null;
  status: string;
  visibility: 'publica' | 'privata';
  loading_city: string;
  loading_country: string;
  unloading_city: string;
  unloading_country: string;
  loading_from: string;
  loading_to: string | null;
  category: CargoCategory | null;
}

/**
 * One of my requests, and the offers on it.
 *
 * The placeholder that used to sit here said offers were coming. They
 * are here now, which is the whole of Faza 2 from the client's side:
 * compare, ask, accept.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccountContext(`${ROUTES.accountRequests}/${id}`);

  // Ownership is `can_edit_cargo_listing()`, which is what
  // `offers_for_request()` asks before it answers. Asked here too
  // because RLS lets any signed-in person read an *active* listing, so
  // without it a carrier could open somebody else's request under the
  // heading „Cererile mele" — no offers would show, but the page would
  // still be a lie.
  const request = await loadRequest(id);
  if (request === null || !(await ownsRequest(id))) notFound();

  const offers = await loadOffersForRequest(id);
  const threads = new Map(
    await Promise.all(
      offers
        .filter((offer) => offer.conversation_id !== null)
        .map(async (offer) => [offer.id, await loadOfferThread(offer.id)] as const),
    ),
  );

  const pending = offers.filter((offer) => isLive(offer.status)).length;

  // Favourites and the current invitations, but only for a private
  // request — a public one has nothing to invite anybody to.
  const context = await requireAccountContext(`${ROUTES.accountRequests}/${id}`);
  const invitable =
    request.visibility === 'privata' && context.activeCompany
      ? await loadInvitable(id, context.activeCompany.id)
      : [];

  return (
    <div className="flex flex-col gap-6">
      <TopBar
        title={request.title ?? `${request.loading_city} — ${request.unloading_city}`}
        crumbs={[{ href: ROUTES.accountRequests, label: 'Cererile mele' }]}
        actions={[]}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-body text-muted">
              {request.loading_city} ({request.loading_country}) — {request.unloading_city} (
              {request.unloading_country})
            </p>
            <p className="mt-1 text-body text-muted">
              Încărcare de la {formatDay(request.loading_from)}
              {request.loading_to !== null ? ` până la ${formatDay(request.loading_to)}` : ''}
            </p>
            {request.category !== null ? (
              <p className="mt-1 text-body text-muted">
                {CARGO_CATEGORY_LABELS[request.category]}
              </p>
            ) : null}
          </div>
          <StatusBadge tone={pending > 0 ? 'warning' : 'neutral'}>
            {requestStateLabel(request.status, pending)}
          </StatusBadge>
        </div>
        <p className="mt-4 text-body">
          <Link href={requestRoute(request.id)} className="link-accent">
            Vezi cum o văd transportatorii
          </Link>
        </p>
      </Card>

      {request.visibility === 'privata' ? (
        <VisibilityPanel requestId={id} carriers={invitable} />
      ) : null}

      <section aria-labelledby="oferte" className="flex flex-col gap-4">
        <h2 id="oferte" className="text-h3">
          {offersCopy.received.title}
        </h2>
        <ReceivedOffers
          listingId={id}
          offers={offers}
          threads={Object.fromEntries(threads)}
          now={new Date().toISOString()}
        />
      </section>
    </div>
  );
}

async function loadRequest(id: string): Promise<RequestRow | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cargo_listings')
    .select(
      'id, title, status, visibility, loading_city, loading_country, unloading_city, unloading_country, loading_from, loading_to, cargo_vehicle_details(category)',
    )
    .eq('id', id)
    .maybeSingle();

  if (error || data === null) {
    if (error) console.error('[cerere] query failed', { message: error.message });
    return null;
  }

  // PostgREST types an embedded one-to-many as an array even where the
  // foreign key makes it one row.
  const embedded = data.cargo_vehicle_details as unknown;
  const details = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { category: CargoCategory | null }
    | null
    | undefined;

  return {
    id: data.id,
    visibility: data.visibility,
    title: data.title,
    status: data.status,
    loading_city: data.loading_city,
    loading_country: data.loading_country,
    unloading_city: data.unloading_city,
    unloading_country: data.unloading_country,
    loading_from: data.loading_from,
    loading_to: data.loading_to,
    category: details?.category ?? null,
  };
}

/** The same question `offers_for_request()` asks before it answers. */
async function ownsRequest(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('can_edit_cargo_listing', { p_listing_id: id });
  if (error) {
    console.error('[cerere] ownership check failed', { message: error.message });
    return false;
  }
  return data === true;
}

/**
 * Favoriții firmei, cu bifa pe cei deja invitați.
 *
 * Numai favoriții: o listă cu toate firmele verificate din țară ar fi
 * un formular pe care nimeni nu îl parcurge. Cine vrea pe altcineva îl
 * adaugă întâi la favoriți, de pe profilul lui.
 */
async function loadInvitable(
  listingId: string,
  companyId: string,
): Promise<{ id: string; name: string; invited: boolean }[]> {
  if (!isSupabaseConfigured()) return [];

  const [favourites, invites] = await Promise.all([
    loadFavourites(companyId),
    (await createClient())
      .from('cargo_listing_invites')
      .select('company_id')
      .eq('cargo_listing_id', listingId),
  ]);

  const invited = new Set(
    ((invites.data ?? []) as { company_id: string }[]).map((row) => row.company_id),
  );

  return favourites.map((row) => ({
    id: row.carrier_company_id,
    name: row.name,
    invited: invited.has(row.carrier_company_id),
  }));
}
