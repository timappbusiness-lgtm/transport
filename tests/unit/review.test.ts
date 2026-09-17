import { describe, expect, it } from 'vitest';
import {
  IN_PLACE,
  requirementAppliesTo,
  reviewProgress,
  type BlockingRow,
  type VehicleType,
} from '@/lib/review';

/**
 * Two rules the screen shares with the database. If either drifts, a
 * carrier sees a button that the RPC then refuses — the worst kind of
 * disagreement, because it looks like a bug in the upload.
 */

const row = (state: BlockingRow['state'], is_blocking = true): BlockingRow => ({
  is_blocking,
  state,
});

describe('how close a company is to being reviewable', () => {
  it('counts an uploaded document as handled: approving it is the point', () => {
    const progress = reviewProgress([row('ok'), row('in_review')]);
    expect(progress.inPlace).toBe(2);
    expect(progress.ready).toBe(true);
  });

  it('does not count what is missing, rejected or expired', () => {
    const progress = reviewProgress([row('ok'), row('missing'), row('rejected'), row('expired')]);
    expect(progress.total).toBe(4);
    expect(progress.inPlace).toBe(1);
    expect(progress.missing).toBe(3);
    expect(progress.ready).toBe(false);
  });

  it('ignores requirements that do not block', () => {
    const progress = reviewProgress([row('ok'), row('missing', false)]);
    expect(progress.total).toBe(1);
    expect(progress.ready).toBe(true);
  });

  it('is not ready with nothing required at all', () => {
    // An empty list means the requirements failed to load, not that the
    // company is complete. Showing the button then would be a lie.
    expect(reviewProgress([]).ready).toBe(false);
  });

  it('agrees with the states the database calls handled', () => {
    expect([...IN_PLACE].sort()).toEqual(['in_review', 'ok']);
  });
});

describe('which documents a vehicle needs', () => {
  const copieConforma = {
    for_vehicle_types: null,
    excluded_vehicle_types: ['autoutilitara_3_5t'] as VehicleType[],
  };

  it('does not ask a light commercial for a copie conformă', () => {
    expect(requirementAppliesTo(copieConforma, 'autoutilitara_3_5t')).toBe(false);
  });

  it('asks a car carrier for one', () => {
    expect(requirementAppliesTo(copieConforma, 'platforma_auto')).toBe(true);
  });

  it('keeps asking a vehicle type nobody thought of yet', () => {
    // The exclusion list is the whole point: a type added later is covered
    // by default rather than exempt by omission.
    expect(requirementAppliesTo(copieConforma, 'troliu')).toBe(true);
    expect(requirementAppliesTo(copieConforma, 'agabaritic')).toBe(true);
  });

  it('honours an inclusion list when one is set', () => {
    const onlyTankers = {
      for_vehicle_types: ['cisterna'] as VehicleType[],
      excluded_vehicle_types: null,
    };
    expect(requirementAppliesTo(onlyTankers, 'cisterna')).toBe(true);
    expect(requirementAppliesTo(onlyTankers, 'prelata')).toBe(false);
  });

  it('applies to everything when neither list is set', () => {
    const everyone = { for_vehicle_types: null, excluded_vehicle_types: null };
    expect(requirementAppliesTo(everyone, 'duba')).toBe(true);
  });

  it('treats an empty inclusion list as "no restriction", not "nothing"', () => {
    const empty = { for_vehicle_types: [] as VehicleType[], excluded_vehicle_types: null };
    expect(requirementAppliesTo(empty, 'duba')).toBe(true);
  });
});
