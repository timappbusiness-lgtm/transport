import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CarrierHome } from '@/components/app/dashboard/carrier';
import { RequestCard } from '@/components/requests/request-card';
import type { AccountContext, Company } from '@/lib/auth/account';
import type { CarrierDashboard } from '@/lib/dashboard-source';
import type { PublicRequest } from '@/lib/requests';

/**
 * A `<li>` directly inside a `<li>` is not a nested item: the HTML parser
 * closes the first one when it meets the second. The server's markup and
 * the browser's DOM then disagree, and React throws a hydration error
 * (#418) and re-renders the page on the client.
 *
 * The carrier dashboard did exactly that on every visit with matches —
 * its list item held a `RequestCard`, which was a list item itself — and
 * so did the landing pages. Found by rendering the dashboard in a
 * browser with sample rows; it was there before the warmth pass.
 */

/** The first `<li>` whose nearest list ancestor is another `<li>`, or null. */
function nestedItem(html: string): string | null {
  const stack: string[] = [];
  for (const [, close, name] of html.matchAll(/<(\/?)(ul|ol|li|menu)\b[^>]*>/g)) {
    if (close) {
      stack.pop();
      continue;
    }
    if (name === 'li' && stack.at(-1) === 'li') return html.slice(0, 200);
    stack.push(name!);
  }
  return null;
}

const NOW = new Date('2026-09-23T12:00:00.000Z');
const request = (id: string, category: string): PublicRequest =>
  ({
    id, category, make: 'Volkswagen', model: 'Golf', year: 2018, is_running: true,
    service_type: 'pe_sens', from_city: 'München', from_country: 'DE', to_city: 'Cluj-Napoca',
    to_country: 'RO', estimated_km: 1080, published_at: '2026-09-23T11:44:00.000Z', board: 'retur',
    loading_from: '2026-09-26', loading_to: null, weight_kg: null, needs_winch: false, photo_count: 0,
    is_domestic: false, from_county: null, to_county: null, from_lat: null, from_lng: null,
    to_lat: null, to_lng: null,
  }) as PublicRequest;

describe('list items are never nested', () => {
  it('the detector finds a nested item', () => {
    expect(nestedItem('<ul><li><li>x</li></li></ul>')).not.toBeNull();
    expect(nestedItem('<ul><li><ul><li>x</li></ul></li></ul>')).toBeNull();
  });

  it('the carrier dashboard, with matches', () => {
    const company = { id: 'c', name: 'Firmă', verification_status: 'verified', company_type: 'transport', is_suspended: false } as unknown as Company;
    const context = { profile: { first_name: 'A', account_type: 'company' }, activeCompany: company } as unknown as AccountContext;
    const data: CarrierDashboard = {
      documentsExpiring: 0, documentsRejected: 0, documentsMissing: 0, vehiclesActive: 1, vehiclesBlocked: 0,
      pendingBookings: [], activeRoutes: 0, seatsTaken: 0, seatsTotal: 0, contactsThisMonth: 0,
      matches: [request('a', 'autoturism'), request('b', 'rulota')],
      matchReasons: { a: ['ruta'], b: ['categorie'] }, detours: {}, now: NOW.toISOString(),
    };
    const html = renderToStaticMarkup(
      <CarrierHome company={company} context={context} data={data} contactsLimit={null} offering={null} />,
    );
    // It did render the matches, or the check proves nothing.
    expect(html).toContain('data-category-tile="rulota"');
    expect(nestedItem(html)).toBeNull();
  });

  it('the card is a list item on the feed and a div when wrapped', () => {
    const item = renderToStaticMarkup(<ul><RequestCard request={request('a', 'autoturism')} now={NOW} /></ul>);
    expect(item).toMatch(/^<ul><li class="min-w-0">/);
    const wrapped = renderToStaticMarkup(
      <ul><li><RequestCard request={request('a', 'autoturism')} now={NOW} as="div" /></li></ul>,
    );
    expect(nestedItem(wrapped)).toBeNull();
  });

  it('every caller that wraps the card in its own <li> asks for a div', () => {
    for (const file of ['src/components/app/dashboard/carrier.tsx', 'src/components/seo/page-body.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toMatch(/<li [^>]*>\s*<RequestCard [^>]*as="div"/);
    }
  });
});
