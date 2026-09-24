import { describe, expect, it } from 'vitest';
import { newRequestsLine, newSince, seenAt } from '@/lib/board-news';

/**
 * „12 cereri noi de la ultima vizită": which requests count, how the line
 * reads, and which moment is recorded as the visit.
 */

const row = (published_at: string | null) => ({ published_at });

describe('what counts as new', () => {
  const since = '2026-09-24T08:00:00.000Z';

  it('is what was published strictly after the last visit', () => {
    const rows = [
      row('2026-09-24T07:59:59.000Z'),
      // The same instant was on the board they saw.
      row('2026-09-24T08:00:00.000Z'),
      row('2026-09-24T08:00:01.000Z'),
      row('2026-09-24T12:00:00.000Z'),
    ];
    expect(newSince(rows, since).map((r) => r.published_at)).toEqual([
      '2026-09-24T08:00:01.000Z',
      '2026-09-24T12:00:00.000Z',
    ]);
  });

  it('is nothing for somebody who has never opened the board', () => {
    // Not „everything is new": a first visit is not a backlog.
    expect(newSince([row('2026-09-24T12:00:00.000Z')], null)).toEqual([]);
  });

  it('is nothing when the last visit is not a time', () => {
    expect(newSince([row('2026-09-24T12:00:00.000Z')], 'ieri')).toEqual([]);
  });

  it('skips a row with no publication time', () => {
    expect(newSince([row(null), row('nu')], since)).toEqual([]);
  });
});

describe('the line on the board', () => {
  it('is absent at zero, and for anything that is not a count', () => {
    expect(newRequestsLine(0)).toBeNull();
    expect(newRequestsLine(-3)).toBeNull();
    expect(newRequestsLine(Number.NaN)).toBeNull();
  });

  it('reads as Romanian at every number', () => {
    expect(newRequestsLine(1)).toBe('O cerere nouă de la ultima vizită');
    expect(newRequestsLine(2)).toBe('2 cereri noi de la ultima vizită');
    expect(newRequestsLine(12)).toBe('12 cereri noi de la ultima vizită');
    // From twenty on, Romanian puts „de" between the number and the noun.
    expect(newRequestsLine(20)).toBe('20 de cereri noi de la ultima vizită');
    expect(newRequestsLine(101)).toBe('101 cereri noi de la ultima vizită');
  });
});

describe('the moment recorded as the visit', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');

  it('is when the board was drawn, so what arrived since stays new', () => {
    expect(seenAt('2026-09-24T11:59:30.000Z', now)).toBe('2026-09-24T11:59:30.000Z');
  });

  it('is never later than now, whatever the browser sends', () => {
    expect(seenAt('2027-01-01T00:00:00.000Z', now)).toBe(now.toISOString());
  });

  it('is nothing for a board left open more than a day', () => {
    // A tab left open over the weekend and glanced at on Monday does not
    // mark Monday's requests as read.
    expect(seenAt('2026-09-23T11:59:59.000Z', now)).toBeNull();
  });

  it('is nothing for a value that is not a time', () => {
    expect(seenAt('', now)).toBeNull();
    expect(seenAt('azi', now)).toBeNull();
  });
});
