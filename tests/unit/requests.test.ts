import { describe, expect, it } from 'vitest';
import {
  FEED_LIMIT,
  FEED_LIMIT_MOBILE,
  formatKm,
  formatNumber,
  hasNewer,
  pluralRo,
  relativeTimeRo,
  scopeOf,
  showFeed,
  showStats,
  vehicleLine,
  type ActivityStats,
  type ActivityThresholds,
  type PublicRequest,
} from '@/lib/requests';

/**
 * Every number and every phrase the activity section shows passes through
 * one of these. They are the reason the section can be trusted to say "acum
 * 20 de ore" rather than "acum 20 ore", and to say nothing at all when
 * there is nothing to say.
 */

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
  published_at: '2026-09-17T09:00:00.000Z',
};

const STATS: ActivityStats = {
  publishedTotal: 62,
  publishedLast7d: 22,
  totalKm: 70107,
  activeTotal: 8,
  daily: Array.from({ length: 30 }, (_, i) => i % 4),
  dailyFrom: '2026-08-19',
};

const THRESHOLDS: ActivityThresholds = { statsMinRequests: 50, feedMinRequests: 6 };

describe('kilometres and counts, written the Romanian way', () => {
  it('groups thousands with a full stop and marks the estimate', () => {
    expect(formatKm(2970)).toBe('~2.970 km');
    expect(formatKm(940)).toBe('~940 km');
    expect(formatNumber(70107)).toBe('70.107');
  });

  it('shows nothing rather than a zero when there are no coordinates', () => {
    // A listing with no coordinates has no distance. "~0 km" would be a
    // claim about a journey; the pill simply does not appear.
    expect(formatKm(null)).toBeNull();
    expect(formatKm(0)).toBeNull();
    expect(formatKm(Number.NaN)).toBeNull();
  });
});

describe('Romanian plurals', () => {
  it('uses the singular for one', () => {
    expect(pluralRo(1, 'oră', 'ore')).toBe('o oră');
    expect(pluralRo(1, 'cerere', 'cereri')).toBe('o cerere');
  });

  it('uses the plural without "de" from two to nineteen', () => {
    expect(pluralRo(2, 'oră', 'ore')).toBe('2 ore');
    expect(pluralRo(19, 'zi', 'zile')).toBe('19 zile');
  });

  it('uses "de" from twenty upwards', () => {
    expect(pluralRo(20, 'oră', 'ore')).toBe('20 de ore');
    expect(pluralRo(22, 'cerere', 'cereri')).toBe('22 de cereri');
    expect(pluralRo(100, 'cerere', 'cereri')).toBe('100 de cereri');
  });

  it('drops "de" again where the last two digits are one to nineteen', () => {
    // "o sută unu cereri", not "o sută unu de cereri".
    expect(pluralRo(101, 'cerere', 'cereri')).toBe('101 cereri');
    expect(pluralRo(115, 'cerere', 'cereri')).toBe('115 cereri');
  });
});

describe('how long ago', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');
  const ago = (ms: number) => relativeTimeRo(new Date(now.getTime() - ms).toISOString(), now);

  it('says "chiar acum" for the first three quarters of a minute', () => {
    expect(ago(0)).toBe('chiar acum');
    expect(ago(44_000)).toBe('chiar acum');
  });

  it('counts minutes', () => {
    expect(ago(6 * 60_000)).toBe('acum 6 min');
    expect(ago(59 * 60_000)).toBe('acum 59 min');
  });

  it('never says "acum 0 min" on the way to the first minute', () => {
    expect(ago(50_000)).toBe('acum 1 min');
  });

  it('counts hours, with the Romanian plural', () => {
    expect(ago(60 * 60_000)).toBe('acum o oră');
    expect(ago(2 * 60 * 60_000)).toBe('acum 2 ore');
    expect(ago(20 * 60 * 60_000)).toBe('acum 20 de ore');
  });

  it('counts days, then months', () => {
    expect(ago(24 * 60 * 60_000)).toBe('acum o zi');
    expect(ago(3 * 24 * 60 * 60_000)).toBe('acum 3 zile');
    expect(ago(29 * 24 * 60 * 60_000)).toBe('acum 29 de zile');
    expect(ago(60 * 24 * 60 * 60_000)).toBe('acum 2 luni');
  });

  it('reads a clock that is slightly ahead as "chiar acum", not as a negative', () => {
    expect(relativeTimeRo(new Date(now.getTime() + 30_000).toISOString(), now)).toBe('chiar acum');
  });

  it('says nothing for a timestamp it cannot read', () => {
    expect(relativeTimeRo('nu e o dată', now)).toBe('');
  });
});

describe('intern or internațional', () => {
  it('is intern inside one country', () => {
    expect(scopeOf('RO', 'RO')).toBe('intern');
  });

  it('is internațional across a border', () => {
    expect(scopeOf('RO', 'ES')).toBe('international');
  });

  it('does not turn a lower-case country code into a border crossing', () => {
    expect(scopeOf('ro', 'RO')).toBe('intern');
    expect(scopeOf(' RO ', 'RO')).toBe('intern');
  });
});

describe('the vehicle line', () => {
  it('reads as a sentence with everything present', () => {
    expect(vehicleLine(REQUEST)).toBe('Opel Combo, 2019');
  });

  it('holds together when parts are missing', () => {
    expect(vehicleLine({ ...REQUEST, model: null })).toBe('Opel, 2019');
    expect(vehicleLine({ ...REQUEST, year: null })).toBe('Opel Combo');
    expect(vehicleLine({ ...REQUEST, make: null, model: null })).toBe('2019');
    expect(vehicleLine({ ...REQUEST, make: null, model: null, year: null })).toBeNull();
  });
});

describe('the thresholds', () => {
  it('shows the statistics only once there are enough published requests', () => {
    expect(showStats(STATS, THRESHOLDS)).toBe(true);
    expect(showStats({ ...STATS, publishedTotal: 49 }, THRESHOLDS)).toBe(false);
    expect(showStats({ ...STATS, publishedTotal: 50 }, THRESHOLDS)).toBe(true);
  });

  it('shows the feed only once there are enough live requests', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ ...REQUEST, id: String(i) }));
    expect(showFeed(STATS, six, THRESHOLDS)).toBe(true);
    expect(showFeed({ ...STATS, activeTotal: 5 }, six, THRESHOLDS)).toBe(false);
  });

  it('shows neither when there is no database to ask', () => {
    expect(showStats(null, THRESHOLDS)).toBe(false);
    expect(showFeed(null, [], THRESHOLDS)).toBe(false);
  });

  it('shows no feed when the count says yes but nothing came back', () => {
    // Belt and braces: the count and the rows are two queries, and a grid
    // with a heading and no cards is worse than no grid.
    expect(showFeed(STATS, [], THRESHOLDS)).toBe(false);
  });

  it('fetches six and hides the last two on a phone', () => {
    expect(FEED_LIMIT).toBe(6);
    expect(FEED_LIMIT_MOBILE).toBe(4);
  });
});

describe('spotting something new', () => {
  const a = { ...REQUEST, id: 'a' };
  const b = { ...REQUEST, id: 'b' };

  it('sees a different newest row', () => {
    expect(hasNewer([a], [b, a])).toBe(true);
  });

  it('stays quiet when the newest row is the same', () => {
    expect(hasNewer([a, b], [a, b])).toBe(false);
  });

  it('treats the first arrival as new', () => {
    expect(hasNewer([], [a])).toBe(true);
  });

  it('says nothing when the poll came back empty', () => {
    expect(hasNewer([a], [])).toBe(false);
  });
});
