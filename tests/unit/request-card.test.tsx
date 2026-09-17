import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RequestCard } from '@/components/requests/request-card';
import { FEED_LIMIT, FEED_LIMIT_MOBILE, type PublicRequest } from '@/lib/requests';

/**
 * The card, rendered to markup without a browser.
 *
 * The database test in `supabase/tests/rls_test.sql` proves the projection
 * carries nothing private. This one proves the other half: that the card
 * renders what it was given and nothing else — no spread of an unknown
 * object into the DOM, no debug output, nothing that would put a note or a
 * phone number on the homepage if one ever reached the client.
 */

const NOW = new Date('2026-09-17T12:00:00.000Z');

const REQUEST: PublicRequest = {
  id: '11111111-1111-1111-1111-111111111111',
  category: 'autoturism',
  make: 'Opel',
  model: 'Combo',
  year: 2019,
  is_running: true,
  service_type: 'pe_sens',
  from_city: 'Mizil',
  from_country: 'RO',
  to_city: 'Pamplona',
  to_country: 'ES',
  estimated_km: 2970,
  published_at: '2026-09-17T11:54:00.000Z',
};

function render(request: PublicRequest, className?: string): string {
  return renderToStaticMarkup(
    <ul>
      <RequestCard request={request} now={NOW} className={className} />
    </ul>,
  );
}

describe('one card', () => {
  const html = render(REQUEST);

  it('links the whole card to the request', () => {
    expect(html).toContain('href="/cereri/11111111-1111-1111-1111-111111111111"');
  });

  it('names the category and whether it crosses a border', () => {
    expect(html).toContain('Autoturism');
    expect(html).toContain('Internațional');
  });

  it('writes the route with country codes rather than flags', () => {
    expect(html).toContain('Mizil');
    expect(html).toContain('Pamplona');
    expect(html).toContain('>RO<');
    expect(html).toContain('>ES<');
    // Emoji flags read as a nationality claim and are unreliable on Windows.
    expect(html).not.toMatch(/\uD83C[\uDDE6-\uDDFF]/);
  });

  it('marks the distance as an estimate', () => {
    expect(html).toContain('~2.970 km');
  });

  it('names the vehicle', () => {
    expect(html).toContain('Opel Combo, 2019');
  });

  it('says how long ago it was published, from the server clock', () => {
    expect(html).toContain('acum 6 min');
    // React writes the attribute as authored; HTML attribute names are
    // case-insensitive, so the browser reads it as `datetime` either way.
    expect(html).toMatch(/datetime="2026-09-17T11:54:00\.000Z"/i);
  });

  it('gives a screen reader the route as a sentence', () => {
    expect(html).toContain('De la Mizil la Pamplona');
  });
});

describe('what the card says about the vehicle', () => {
  it('says it starts when it does', () => {
    expect(render(REQUEST)).toContain('Pornește');
  });

  it('says it does not when it does not', () => {
    const html = render({ ...REQUEST, is_running: false });
    expect(html).toContain('Nu pornește');
  });

  it('marks Expres only when the service is Expres', () => {
    expect(render(REQUEST)).not.toContain('Expres');
    expect(render({ ...REQUEST, service_type: 'expres' })).toContain('Expres');
  });

  it('leaves out the distance pill when there are no coordinates', () => {
    expect(render({ ...REQUEST, estimated_km: null })).not.toContain(' km');
  });

  it('says Intern for a move inside one country', () => {
    const html = render({ ...REQUEST, to_city: 'Cluj-Napoca', to_country: 'RO' });
    expect(html).toContain('Intern');
    expect(html).not.toContain('Internațional');
  });
});

describe('what the card refuses to say', () => {
  it('renders nothing it was not designed to render', () => {
    // If a wider row ever reached the client — a note, a phone number, an
    // owner — the card must not put it on screen just because it arrived.
    const withPrivateFields = {
      ...REQUEST,
      description: 'Sunați la 0722 000 000, mașina e în curte la Ion',
      posted_by: '99999999-9999-9999-9999-999999999999',
      company_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      loading_lat: 45.0103,
      price_amount: 4200,
    } as unknown as PublicRequest;

    const html = render(withPrivateFields);
    expect(html).not.toContain('0722');
    expect(html).not.toContain('Ion');
    expect(html).not.toContain('99999999');
    expect(html).not.toContain('cccccccc');
    expect(html).not.toContain('45.0103');
    expect(html).not.toContain('4200');
  });
});

describe('the grid on a phone', () => {
  it('hides everything past the fourth card, and only there', () => {
    expect(render(REQUEST, 'hidden sm:block')).toContain('hidden sm:block');
    expect(render(REQUEST)).not.toContain('hidden sm:block');
    // Six are fetched; a phone shows four of them.
    expect(FEED_LIMIT - FEED_LIMIT_MOBILE).toBe(2);
  });
});
