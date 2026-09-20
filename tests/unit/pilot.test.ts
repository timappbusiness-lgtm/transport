import { describe, expect, it } from 'vitest';
import {
  chartCeiling,
  chronological,
  countRo,
  defaultRange,
  enoughHistory,
  humanHours,
  parseIsoDate,
  progress,
  type PilotWeek,
} from '@/lib/pilot';

const week = (over: Partial<PilotWeek> & { week_start: string }): PilotWeek => ({
  active_carriers: 0,
  active_forwarders: 0,
  requests_published: 0,
  departures_published: 0,
  ...over,
});

describe('progress towards a target', () => {
  it('is the fraction of the way there', () => {
    expect(progress(5, 20).ratio).toBe(0.25);
    expect(progress(5, 20).remaining).toBe(15);
    expect(progress(5, 20).met).toBe(false);
  });

  it('is met exactly at the target', () => {
    expect(progress(20, 20).met).toBe(true);
    expect(progress(20, 20).remaining).toBe(0);
  });

  it('does not run past the end of the bar when we overshoot', () => {
    expect(progress(45, 20).ratio).toBe(1);
    expect(progress(45, 20).met).toBe(true);
  });

  it('treats a zero target as met rather than dividing by it', () => {
    expect(progress(0, 0).ratio).toBe(1);
    expect(progress(0, 0).met).toBe(true);
  });

  it('refuses a negative, which is what a bad query returns', () => {
    expect(progress(-3, 20).current).toBe(0);
    expect(progress(-3, 20).ratio).toBe(0);
  });
});

describe('how long somebody waited', () => {
  it('says nothing when there is nothing to say', () => {
    expect(humanHours(null)).toBe('—');
  });

  it('uses hours for the first two days', () => {
    expect(humanHours(0.5)).toBe('sub o oră');
    expect(humanHours(1)).toBe('o oră');
    expect(humanHours(7.4)).toBe('7 ore');
  });

  it('switches to days once hours stop meaning anything', () => {
    expect(humanHours(48)).toBe('2 de zile');
    expect(humanHours(26)).toBe('26 ore');
    expect(humanHours(24 * 9)).toBe('9 de zile');
  });
});

describe('Romanian counting', () => {
  it('keeps the singular at one', () => {
    expect(countRo(1, 'transportator', 'transportatori')).toBe('1 transportator');
  });

  it('has no „de" below twenty', () => {
    expect(countRo(5, 'transportator', 'transportatori')).toBe('5 transportatori');
    expect(countRo(19, 'transportator', 'transportatori')).toBe('19 transportatori');
  });

  it('takes „de" from twenty up', () => {
    expect(countRo(20, 'transportator', 'transportatori')).toBe('20 de transportatori');
    expect(countRo(101, 'transportator', 'transportatori')).toBe('101 transportatori');
    expect(countRo(120, 'transportator', 'transportatori')).toBe('120 de transportatori');
  });

  it('says zero with „de", as Romanian does', () => {
    expect(countRo(0, 'transportator', 'transportatori')).toBe('0 de transportatori');
  });
});

describe('the weekly series', () => {
  it('sorts oldest first however it arrives', () => {
    const sorted = chronological([
      week({ week_start: '2026-09-14' }),
      week({ week_start: '2026-08-31' }),
      week({ week_start: '2026-09-07' }),
    ]);
    expect(sorted.map((w) => w.week_start)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('never gives a chart a ceiling of zero to divide by', () => {
    expect(chartCeiling([])).toBe(1);
    expect(chartCeiling([week({ week_start: '2026-09-07' })])).toBe(1);
  });

  it('takes the tallest of either series', () => {
    expect(
      chartCeiling([
        week({ week_start: '2026-09-07', active_carriers: 3, active_forwarders: 11 }),
        week({ week_start: '2026-09-14', active_carriers: 7, active_forwarders: 2 }),
      ]),
    ).toBe(11);
  });

  it('will not call two busy weeks a trend', () => {
    const weeks = [
      week({ week_start: '2026-09-07', active_carriers: 4 }),
      week({ week_start: '2026-09-14', active_carriers: 6 }),
      week({ week_start: '2026-09-21' }),
    ];
    expect(enoughHistory(weeks)).toBe(false);
  });

  it('accepts four weeks with something in them', () => {
    const weeks = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'].map((d) =>
      week({ week_start: d, active_carriers: 1 }),
    );
    expect(enoughHistory(weeks)).toBe(true);
  });
});

describe('the date range', () => {
  it('goes eight weeks back from today', () => {
    const { from, to } = defaultRange(new Date('2026-09-20T12:00:00Z'));
    expect(to).toBe('2026-09-20');
    expect(from).toBe('2026-07-27');
  });

  it('accepts an ISO date and refuses everything else', () => {
    expect(parseIsoDate('2026-09-20')).toBe('2026-09-20');
    expect(parseIsoDate('20-09-2026')).toBeNull();
    expect(parseIsoDate('2026-13-45')).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });
});
