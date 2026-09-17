import { describe, expect, it } from 'vitest';
import {
  COMPANY_TYPE_LABELS,
  DIRECTORY_PAGE_SIZE,
  HOME_GRID_SIZE,
  MIN_RATINGS,
  dayNumber,
  filtersToQuery,
  hasFilters,
  monogram,
  monthYear,
  TYPE_FILTER_MATCHES,
  pageCount,
  parseFilters,
  sanitizeSearch,
  ratingLabel,
  rotateDaily,
  scopeLabel,
  showCompanyGrid,
  showStatsBand,
  toCompany,
  toDocument,
  verifiedSinceLabel,
  type DirectoryStats,
  type DirectoryThresholds,
  type PublicCompany,
} from '@/lib/directory';

/**
 * The directory decides what a visitor is told about a real firm, so the
 * rules that hide a number or a card matter more than the ones that show
 * them. Get one wrong and the homepage states a count we cannot stand
 * behind, or a card carries a rating nobody gave.
 */

function company(over: Partial<PublicCompany> = {}): PublicCompany {
  return {
    slug: 'autotrans-vest-srl-timisoara',
    name: 'Autotrans Vest SRL',
    legalName: 'Autotrans Vest SRL',
    cui: '12345678',
    city: 'Timișoara',
    county: 'Timiș',
    companyType: 'transport',
    logoPath: null,
    description: null,
    verifiedSince: '2026-09-04T10:00:00Z',
    ratingAvg: null,
    ratingCount: 0,
    compliantVehicles: 4,
    servesNational: true,
    servesInternational: false,
    lastCheckedAt: null,
    ...over,
  };
}

const thresholds: DirectoryThresholds = {
  statsMinCompanies: 20,
  directoryMinCompanies: 12,
  trialDays: 30,
};

function stats(over: Partial<DirectoryStats> = {}): DirectoryStats {
  return { verifiedCompanies: 40, compliantVehicles: 120, listedCompanies: 30, ...over };
}

describe('what stays hidden until there is enough of it', () => {
  it('states no number below the threshold', () => {
    expect(showStatsBand(stats({ verifiedCompanies: 19 }), thresholds)).toBe(false);
    expect(showStatsBand(stats({ verifiedCompanies: 20 }), thresholds)).toBe(true);
  });

  it('says nothing at all when the query failed', () => {
    expect(showStatsBand(null, thresholds)).toBe(false);
    expect(showCompanyGrid([company()], null, thresholds)).toBe(false);
  });

  it('hides the grid while the directory is thin, however many it fetched', () => {
    const twelve = Array.from({ length: 12 }, () => company());
    expect(showCompanyGrid(twelve, stats({ listedCompanies: 11 }), thresholds)).toBe(false);
    expect(showCompanyGrid(twelve, stats({ listedCompanies: 12 }), thresholds)).toBe(true);
  });

  it('hides the grid when there is nothing to put in it', () => {
    expect(showCompanyGrid([], stats(), thresholds)).toBe(false);
  });
});

describe('which twelve the homepage shows', () => {
  const all = Array.from({ length: 30 }, (_, i) => `c${i}`);

  it('gives every company its turn as the days pass', () => {
    const first = rotateDaily(all, HOME_GRID_SIZE, new Date('2026-09-17T00:00:00Z'));
    const next = rotateDaily(all, HOME_GRID_SIZE, new Date('2026-09-18T00:00:00Z'));
    expect(first).toHaveLength(HOME_GRID_SIZE);
    expect(first).not.toEqual(next);
    expect(next[0]).toBe(first[1]);
  });

  it('does not reshuffle within the same day', () => {
    const morning = rotateDaily(all, HOME_GRID_SIZE, new Date('2026-09-17T06:00:00Z'));
    const evening = rotateDaily(all, HOME_GRID_SIZE, new Date('2026-09-17T22:30:00Z'));
    expect(morning).toEqual(evening);
  });

  it('wraps round the end of the list rather than running short', () => {
    const picked = rotateDaily(all, HOME_GRID_SIZE, new Date('2026-09-17T00:00:00Z'));
    expect(new Set(picked).size).toBe(HOME_GRID_SIZE);
  });

  it('shows everything it has when there is less than a grid of it', () => {
    expect(rotateDaily(['a', 'b'], HOME_GRID_SIZE, new Date())).toEqual(['a', 'b']);
    expect(rotateDaily([], HOME_GRID_SIZE, new Date())).toEqual([]);
  });

  it('counts the same day everywhere: the day number is UTC', () => {
    expect(dayNumber(new Date('2026-09-17T23:59:59Z'))).toBe(
      dayNumber(new Date('2026-09-17T00:00:00Z')),
    );
    expect(dayNumber(new Date('2026-09-18T00:00:00Z'))).toBe(
      dayNumber(new Date('2026-09-17T00:00:00Z')) + 1,
    );
  });
});

describe('the letters on a card with no logo', () => {
  it('skips the legal form', () => {
    expect(monogram('Autotrans Vest SRL')).toBe('AV');
    expect(monogram('Marfa Transport S.R.L.')).toBe('MT');
  });

  it('keeps Romanian letters', () => {
    expect(monogram('Țara Transport SRL')).toBe('ȚT');
  });

  it('manages a single word, and a name that is only a legal form', () => {
    expect(monogram('Autotrans')).toBe('A');
    expect(monogram('SRL')).toBe('—');
    expect(monogram('   ')).toBe('—');
  });
});

describe('dates a visitor sees', () => {
  it('names the month, never the day', () => {
    expect(verifiedSinceLabel('2026-09-04T10:00:00Z')).toBe('Verificat din septembrie 2026');
    expect(monthYear(new Date('2027-10-01T00:00:00Z'))).toBe('octombrie 2027');
  });

  it('says nothing when there is no date to say it from', () => {
    expect(verifiedSinceLabel(null)).toBeNull();
    expect(verifiedSinceLabel('nu e o dată')).toBeNull();
  });
});

describe('the rating, or nothing at all', () => {
  it('stays quiet below three ratings', () => {
    expect(ratingLabel(company({ ratingAvg: 5, ratingCount: MIN_RATINGS - 1 }))).toBeNull();
  });

  it('shows one decimal, with a Romanian comma', () => {
    expect(ratingLabel(company({ ratingAvg: 4.75, ratingCount: 8 }))).toBe('4,8');
  });

  it('stays quiet when there is no average', () => {
    expect(ratingLabel(company({ ratingAvg: null, ratingCount: 9 }))).toBeNull();
  });
});

describe('what a company covers', () => {
  it('reads from the routes it published', () => {
    expect(scopeLabel(company())).toBe('Intern');
    expect(scopeLabel(company({ servesNational: false, servesInternational: true }))).toBe(
      'Internațional',
    );
    expect(scopeLabel(company({ servesInternational: true }))).toBe('Intern și internațional');
  });

  it('claims nothing for a company that has published no routes', () => {
    expect(scopeLabel(company({ servesNational: false, servesInternational: false }))).toBeNull();
  });

  it('labels every company type', () => {
    expect(Object.values(COMPANY_TYPE_LABELS).every((l) => l.length > 0)).toBe(true);
  });
});

describe('filters from the query string', () => {
  it('reads the four of them', () => {
    expect(
      parseFilters({ judet: 'Timiș', tip: 'transport', acoperire: 'international', q: ' vest ' }),
    ).toEqual({
      county: 'Timiș',
      companyType: 'transport',
      scope: 'international',
      query: 'vest',
      page: 1,
    });
  });

  it('treats a stale bookmark as no filter rather than an error', () => {
    expect(parseFilters({ tip: 'pescuit', acoperire: 'luna', pagina: '-3' })).toEqual({
      county: null,
      companyType: null,
      scope: null,
      query: null,
      page: 1,
    });
  });

  it('takes the first value when a parameter repeats', () => {
    expect(parseFilters({ tip: ['transport', 'expeditie'] }).companyType).toBe('transport');
  });

  it('round-trips into a query string, leaving the empty ones out', () => {
    const filters = parseFilters({ judet: 'Cluj', pagina: '3' });
    expect(filtersToQuery(filters)).toBe('?judet=Cluj&pagina=3');
    expect(filtersToQuery(parseFilters({}))).toBe('');
    expect(hasFilters(parseFilters({}))).toBe(false);
    expect(hasFilters(filters)).toBe(true);
  });

  it('a page number on its own is not a filter: the list is unfiltered', () => {
    expect(hasFilters(parseFilters({ pagina: '2' }))).toBe(false);
  });

  it('a firm that does both is matched by either filter', () => {
    expect(TYPE_FILTER_MATCHES.transport).toContain('both');
    expect(TYPE_FILTER_MATCHES.expeditie).toContain('both');
    expect(parseFilters({ tip: 'both' }).companyType).toBeNull();
  });

  it('filter syntax typed into the search box stays text', () => {
    expect(sanitizeSearch('vest,(srl)')).toBe('vest srl');
    expect(sanitizeSearch('  100%  ')).toBe('100');
  });

  it('counts pages, and always has one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(DIRECTORY_PAGE_SIZE)).toBe(1);
    expect(pageCount(DIRECTORY_PAGE_SIZE + 1)).toBe(2);
  });
});

describe('rows that cannot be rendered are dropped, not patched', () => {
  it('needs a slug, a name and a CUI', () => {
    expect(toCompany({ slug: null, name: 'X', legal_name: 'X', cui: '1', company_type: 'transport' } as never)).toBeNull();
    expect(toCompany({ slug: 'x', name: null, legal_name: 'X', cui: '1', company_type: 'transport' } as never)).toBeNull();
  });

  it('coerces the numbers PostgREST may hand back as strings', () => {
    const mapped = toCompany({
      slug: 'x',
      name: 'X SRL',
      legal_name: 'X SRL',
      cui: '1',
      city: null,
      county: null,
      company_type: 'transport',
      logo_path: null,
      public_description: null,
      verified_since: null,
      rating_avg: '4.5',
      rating_count: '6',
      compliant_vehicles: '2',
      serves_national: null,
      serves_international: true,
      last_checked_at: null,
    } as never);
    expect(mapped?.ratingAvg).toBe(4.5);
    expect(mapped?.ratingCount).toBe(6);
    expect(mapped?.compliantVehicles).toBe(2);
    expect(mapped?.servesNational).toBe(false);
  });

  it('an unknown document state reads as valid rather than throwing', () => {
    const doc = toDocument({ kind: 'itp', label_ro: 'ITP', state: 'ceva', valid_month: null } as never);
    expect(doc?.state).toBe('valid');
    expect(toDocument({ kind: null, label_ro: 'ITP' } as never)).toBeNull();
  });
});
