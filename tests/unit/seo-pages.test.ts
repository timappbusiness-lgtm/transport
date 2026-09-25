import { describe, expect, it } from 'vitest';
import { parsePrefill, prefillQuery } from '@/lib/price-prefill';
import {
  COUNTY_NEIGHBOURS,
  breadcrumbs,
  boardHref,
  corridorCountryName,
  corridorEnds,
  pageHref,
  pageSubject,
  prefillFor,
  relatedPages,
  requestHref,
  routeEnds,
  vehicleTypeLabel,
  type SeoPage,
} from '@/lib/seo-pages';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo-jsonld';
import { routeFacts } from '@/lib/seo-data-source';

/**
 * The URL shapes and the prefills, which are the two things a landing page
 * gets wrong in ways nobody notices: a slug that collides, and a call to
 * action that fills a box the visitor did not choose.
 */

function page(over: Partial<SeoPage> = {}): SeoPage {
  return {
    id: 'p1',
    type: 'corridor_international',
    slug: 'germania-romania',
    title: 'Transport auto Germania România — preț și firme verificate',
    h1: 'Transport auto Germania — România',
    h1Soft: 'cu firme verificate.',
    intro: 'Cel mai circulat coridor de transport auto către România.',
    origin: 'DE',
    destination: 'RO',
    vehicleType: null,
    faq: [{ q: 'Cât durează?', a: 'Între trei și șase zile.' }],
    isPublished: true,
    publishedAt: '2026-09-18T10:00:00Z',
    updatedAt: '2026-09-18T10:00:00Z',
    ...over,
  };
}

const route = page({
  type: 'route_internal',
  slug: 'bucuresti-cluj-napoca',
  origin: 'București',
  destination: 'Cluj-Napoca',
});

const county = page({
  type: 'county',
  slug: 'cluj',
  origin: 'CJ',
  destination: null,
});

const vehicle = page({
  type: 'vehicle_type',
  slug: 'motocicleta',
  origin: null,
  destination: null,
  vehicleType: 'motocicleta',
});

describe('where a page lives', () => {
  it('puts the four kinds at the addresses the brief named', () => {
    expect(pageHref(page())).toBe('/transport-auto/germania-romania');
    expect(pageHref(route)).toBe('/transport-auto/bucuresti-cluj-napoca');
    expect(pageHref(county)).toBe('/transport-auto/judet/cluj');
    expect(pageHref(vehicle)).toBe('/transport-auto/motocicleta');
  });

  it('keeps counties one segment deeper, so a slug cannot collide', () => {
    // `arad` the county and `arad` inside a city pair are different pages,
    // and a namespace checked by hand breaks the first time somebody adds
    // a row.
    const arad = page({ type: 'county', slug: 'arad', origin: 'AR' });
    expect(pageHref(arad)).not.toBe(pageHref(page({ slug: 'arad' })));
  });
});

describe('what a page hands the request form', () => {
  it('gives a corridor the country and not a town', () => {
    // The car is somewhere in Germany. Which somewhere is the visitor's to
    // type, and a guess here is a wrong pickup address nobody notices.
    const prefill = prefillFor(page());
    expect(prefill.fromCountry).toBe('DE');
    expect(prefill.toCountry).toBe('RO');
    expect(prefill.from).toBeNull();
  });

  it('gives a route both towns, with their coordinates', () => {
    const prefill = prefillFor(route);
    expect(prefill.from?.name).toBe('București');
    expect(prefill.to?.name).toBe('Cluj-Napoca');
  });

  it('gives a vehicle-type page its category', () => {
    expect(prefillFor(vehicle).category).toBe('motocicleta');
  });

  it('says a car that does not start does not start', () => {
    const stuck = page({
      type: 'vehicle_type',
      slug: 'masina-care-nu-porneste',
      vehicleType: 'nefunctional',
      origin: null,
      destination: null,
    });
    expect(prefillFor(stuck).isRunning).toBe(false);
  });

  it('gives a county page nothing at all', () => {
    // A county is not a pickup address, and filling the county seat in
    // would put a town in the box that nobody chose.
    const prefill = prefillFor(county);
    expect(prefill.from).toBeNull();
    expect(prefill.fromCountry).toBeNull();
    expect(prefill.category).toBeNull();
  });

  it('survives the round trip through a query string', () => {
    const prefill = prefillFor(route);
    const query = prefillQuery(prefill);
    const parsed = parsePrefill(
      Object.fromEntries(new URLSearchParams(query.replace(/^\?/, '')).entries()),
    );
    expect(parsed.from?.name).toBe('București');
    expect(parsed.to?.name).toBe('Cluj-Napoca');
  });

  it('builds a request link that carries it', () => {
    expect(requestHref(page(), '/cerere/noua')).toContain('tara-plecare=DE');
    expect(requestHref(county, '/cerere/noua')).toBe('/cerere/noua');
  });
});

describe('the link to the board', () => {
  it('filters a corridor by both countries', () => {
    expect(boardHref(page(), '/cereri')).toBe('/cereri?tara-plecare=DE&tara-sosire=RO');
  });

  it('filters a winch page by the condition, not only the category', () => {
    const stuck = page({
      type: 'vehicle_type',
      slug: 'masina-care-nu-porneste',
      vehicleType: 'nefunctional',
    });
    expect(boardHref(stuck, '/cereri')).toContain('stare=nu-ruleaza');
  });

  it('sends a county page to the unfiltered board rather than a wrong filter', () => {
    expect(boardHref(county, '/cereri')).toBe('/cereri');
  });
});

describe('distance and duration', () => {
  it('computes them for a route from real coordinates', () => {
    const facts = routeFacts(route);
    // București–Cluj is about 450 km by road; the straight line is shorter.
    expect(facts?.km).toBeGreaterThan(300);
    expect(facts?.km).toBeLessThan(600);
    expect(facts?.hours).toBeGreaterThan(3);
    expect(facts?.isExample).toBe(false);
  });

  it('marks a corridor as an example, because a corridor has no distance', () => {
    const facts = routeFacts(page());
    expect(facts?.isExample).toBe(true);
    expect(facts?.fromName).toBe('München');
  });

  it('has nothing to say about a county or a vehicle type', () => {
    expect(routeFacts(county)).toBeNull();
    expect(routeFacts(vehicle)).toBeNull();
  });

  it('uses the published road factor when there is one', () => {
    const tight = routeFacts(route, 1.0);
    const loose = routeFacts(route, 1.5);
    expect(loose!.km).toBeGreaterThan(tight!.km);
  });
});

describe('the two ends of a page', () => {
  it('resolves both towns of a route', () => {
    expect(routeEnds(route)?.from.name).toBe('București');
  });

  it('gives a corridor a named reference pair', () => {
    expect(corridorEnds(page())?.from.country).toBe('DE');
    expect(corridorEnds(page())?.to.name).toBe('București');
  });

  it('has no ends for a county', () => {
    expect(routeEnds(county)).toBeNull();
    expect(corridorEnds(county)).toBeNull();
  });
});

describe('what a page is called', () => {
  it('names each kind in Romanian', () => {
    expect(pageSubject(page())).toBe('Germania — România');
    expect(pageSubject(route)).toBe('București — Cluj-Napoca');
    expect(pageSubject(county)).toBe('județul Cluj');
    expect(pageSubject(vehicle)).toBe('Motocicletă');
  });

  it('does not call București a county, because it is not one', () => {
    expect(pageSubject(page({ type: 'county', origin: 'B', slug: 'bucuresti' }))).toBe(
      'București',
    );
  });

  it('names the countries with their diacritics', () => {
    expect(corridorCountryName('NL')).toBe('Țările de Jos');
    expect(corridorCountryName('FR')).toBe('Franța');
    expect(corridorCountryName('ZZ')).toBe('ZZ');
  });

  it('names the condition page as a condition', () => {
    expect(vehicleTypeLabel('nefunctional')).toBe('Vehicul care nu pornește');
  });
});

describe('internal linking', () => {
  const all = [page(), route, county, vehicle];

  it('never links a page to itself', () => {
    expect(relatedPages(route, all).map((p) => p.slug)).not.toContain(route.slug);
  });

  it('links only to pages of the same kind', () => {
    const others = [
      route,
      page({ slug: 'timisoara-arad', type: 'route_internal', origin: 'Timișoara', destination: 'Arad' }),
      county,
    ];
    expect(relatedPages(route, others).every((p) => p.type === 'route_internal')).toBe(true);
  });

  it('puts routes that share an end first', () => {
    const shares = page({
      slug: 'bucuresti-brasov',
      type: 'route_internal',
      origin: 'București',
      destination: 'Brașov',
    });
    const unrelated = page({
      slug: 'arad-sibiu',
      type: 'route_internal',
      origin: 'Arad',
      destination: 'Sibiu',
    });
    const related = relatedPages(route, [unrelated, shares]);
    expect(related[0]?.slug).toBe('bucuresti-brasov');
  });

  it('puts neighbouring counties first', () => {
    const salaj = page({ type: 'county', slug: 'salaj', origin: 'SJ' });
    const tulcea = page({ type: 'county', slug: 'tulcea', origin: 'TL' });
    expect(relatedPages(county, [tulcea, salaj])[0]?.slug).toBe('salaj');
  });

  it('keeps the neighbour map symmetric', () => {
    for (const [code, neighbours] of Object.entries(COUNTY_NEIGHBOURS)) {
      for (const neighbour of neighbours) {
        expect(COUNTY_NEIGHBOURS[neighbour]).toContain(code);
      }
    }
  });

  it('gives every county an entry, even the ones with no border listed', () => {
    expect(Object.keys(COUNTY_NEIGHBOURS)).toHaveLength(42);
  });
});

describe('breadcrumbs', () => {
  it('ends on the page you are on, with no link', () => {
    const trail = breadcrumbs(route, 'Acasă');
    expect(trail.at(-1)?.href).toBeNull();
    expect(trail.at(-1)?.label).toBe('București — Cluj-Napoca');
  });

  it('adds the county level only for a county', () => {
    expect(breadcrumbs(county, 'Acasă')).toHaveLength(4);
    expect(breadcrumbs(route, 'Acasă')).toHaveLength(3);
  });
});

describe('structured data', () => {
  it('builds an FAQPage from the questions the page shows', () => {
    const json = faqJsonLd(page().faq);
    expect(json?.['@type']).toBe('FAQPage');
    expect((json?.mainEntity as unknown[]).length).toBe(1);
  });

  it('writes no FAQ block at all when there are no questions', () => {
    // An empty FAQPage tells a crawler the page has an FAQ and then does
    // not have one, which is worse than saying nothing.
    expect(faqJsonLd([])).toBeNull();
  });

  it('builds a breadcrumb list with absolute URLs and no self-link', () => {
    const json = breadcrumbJsonLd(breadcrumbs(route, 'Acasă'), 'https://exemplu.ro');
    const items = json?.itemListElement as { item?: string; position: number }[];
    expect(items[0]?.item).toBe('https://exemplu.ro/');
    expect(items.at(-1)?.item).toBeUndefined();
    expect(items.at(-1)?.position).toBe(3);
  });

  it('writes nothing for a trail with nowhere to go', () => {
    expect(breadcrumbJsonLd([{ label: 'Acasă', href: null }], 'https://exemplu.ro')).toBeNull();
  });
});
