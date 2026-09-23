import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarrierHome } from '@/components/app/dashboard/carrier';
import { DepartureCard } from '@/components/departures/departure-card';
import { BoardRequestCard } from '@/components/requests/board-card';
import { RequestCard } from '@/components/requests/request-card';
import { DataRow } from '@/components/ui/primitives';
import type { AccountContext, Company } from '@/lib/auth/account';
import type { CarrierDashboard } from '@/lib/dashboard-source';
import type { PublicDeparture } from '@/lib/departures';
import type { PublicRequest } from '@/lib/requests';

/**
 * The numbers a dispatcher opens a screen for carry the accent: the
 * distance on a request, the free seats and the price on a route, the
 * price of a live offer, the counts on the dashboard. Everything around
 * them stays ink, and a number that is history — a full platform, a
 * refused offer — goes back to ink too.
 */

const NOW = new Date('2026-09-23T12:00:00.000Z');

const request = (over: Partial<PublicRequest> = {}): PublicRequest => ({
  id: 'r1', category: 'autoturism', make: 'Opel', model: 'Combo', year: 2019, is_running: true,
  service_type: 'pe_sens', from_city: 'Mizil', from_country: 'RO', to_city: 'Pamplona', to_country: 'ES',
  estimated_km: 2970, published_at: '2026-09-23T11:44:00.000Z', board: 'retur', loading_from: '2026-09-25',
  loading_to: null, weight_kg: 1400, needs_winch: false, photo_count: 0, is_domestic: false,
  from_county: null, to_county: null, from_lat: null, from_lng: null, to_lat: null, to_lng: null, ...over,
});

const departure = (over: Partial<PublicDeparture> = {}): PublicDeparture => ({
  truck_listing_id: 'd1', direction: 'tur', from_country: 'RO', from_county: 'Cluj', from_city: 'Cluj-Napoca',
  to_country: 'DE', to_county: 'Bayern', to_city: 'München', waypoints: [], available_from: '2026-09-28',
  available_to: '2026-09-30', service_types: ['pe_sens'], accepted_vehicle_types: ['autoturism'],
  platform_slots_total: 8, slots_taken: 5, slots_free: 3, price_indicative: 1200, currency: 'RON',
  published_at: '2026-09-23T11:00:00.000Z', is_domestic: false, from_locality_lat: null,
  from_locality_lng: null, free_capacity_kg: null, ...over,
});

/** The class list of the element whose own text is `text`. */
function classOf(html: string, text: RegExp): string {
  const match = html.match(new RegExp(`<[a-z]+ class="([^"]*)"[^>]*>(?:<!-- -->)?${text.source}`));
  return match?.[1] ?? '<not found>';
}

describe('the key numbers are in the accent', () => {
  it('the distance on a board card and on a homepage card', () => {
    const board = renderToStaticMarkup(<ul><BoardRequestCard request={request()} now={NOW} /></ul>);
    expect(classOf(board, /~2\.970 km/)).toMatch(/\btext-accent\b/);
    const home = renderToStaticMarkup(<ul><RequestCard request={request()} now={NOW} /></ul>);
    expect(classOf(home, /~2\.970 km/)).toMatch(/\btext-accent\b/);
  });

  it('the free seats and the price on a route', () => {
    const html = renderToStaticMarkup(<ul><DepartureCard departure={departure()} now={NOW} /></ul>);
    expect(classOf(html, /3 locuri libere/)).toMatch(/\btext-accent\b/);
    expect(classOf(html, /1\.200 RON/)).toMatch(/\btext-accent\b/);
  });

  it('but a full platform is ink', () => {
    const html = renderToStaticMarkup(
      <ul><DepartureCard departure={departure({ slots_taken: 8, slots_free: 0 })} now={NOW} /></ul>,
    );
    expect(html).not.toMatch(/class="font-medium text-accent">[^<]*loc/);
  });

  it('the three counts on the carrier dashboard', () => {
    const company = { id: 'c', name: 'F', verification_status: 'verified', company_type: 'transport', is_suspended: false } as unknown as Company;
    const context = { profile: { account_type: 'company' }, activeCompany: company } as unknown as AccountContext;
    const data: CarrierDashboard = {
      documentsExpiring: 0, documentsRejected: 0, documentsMissing: 0, vehiclesActive: 1, vehiclesBlocked: 0,
      pendingBookings: [], activeRoutes: 2, seatsTaken: 3, seatsTotal: 8, contactsThisMonth: 4,
      matches: [], matchReasons: {}, detours: {}, now: NOW.toISOString(),
    };
    const html = renderToStaticMarkup(
      <CarrierHome company={company} context={context} data={data} contactsLimit={20} offering={null} />,
    );
    for (const value of [/2/, /3 \/ 8/, /4 \/ 20/]) {
      expect(classOf(html, new RegExp(`${value.source}<`)), value.source).toMatch(/\btext-accent\b/);
    }
  });

  it('while a plain data row stays ink', () => {
    const html = renderToStaticMarkup(<DataRow label="Număr" value="CJ 01 ABC" />);
    expect(html).not.toContain('text-accent');
  });

  it('the price of an offer, while it is alive or won', () => {
    const page = readFileSync('src/app/cont/oferte/page.tsx', 'utf8');
    expect(page).toContain("isLive(offer.status) || offer.status === 'accepted' ? 'text-accent' : 'text-foreground'");
  });
});
