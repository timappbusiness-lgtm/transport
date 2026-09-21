import { describe, expect, it } from 'vitest';
import {
  byBoardThenAge,
  canCancel,
  canPublish,
  canReopen,
  isOnBoard,
  type MyRequest,
} from '@/lib/my-requests';
import type { ListingStatus } from '@/lib/requests';

/**
 * Which button a client is offered on their own request. The same rules are
 * in `publish_cargo_request`, `cancel_cargo_request` and
 * `reopen_cargo_request`, which is where they are enforced — these pin that
 * the two do not drift apart, and in particular that no button is offered
 * for a request that has a carrier on it.
 */

const ALL: ListingStatus[] = [
  'draft',
  'active',
  'offers_received',
  'carrier_selected',
  'in_progress',
  'delivered',
  'cancelled',
  'expired',
  'suspended',
  'disputed',
];

function request(over: Partial<MyRequest> = {}): MyRequest {
  return {
    id: 'r1',
    status: 'active',
    fromCity: 'München',
    fromCountry: 'DE',
    toCity: 'Cluj-Napoca',
    toCountry: 'RO',
    loadingFrom: '2026-09-25',
    loadingTo: null,
    category: 'autoturism',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2018,
    isRunning: true,
    needsWinch: false,
    serviceType: 'pe_sens',
    publishedAt: '2026-09-17T09:00:00Z',
    createdAt: '2026-09-17T09:00:00Z',
    hiddenAt: null,
    hiddenReason: null,
    ...over,
  };
}

describe('what a client can do next', () => {
  it('counts only the two statuses that are on the board', () => {
    expect(ALL.filter(isOnBoard)).toEqual(['active', 'offers_received']);
  });

  it('publishes a draft and nothing else', () => {
    expect(ALL.filter(canPublish)).toEqual(['draft']);
  });

  it('reopens what expired or was withdrawn', () => {
    expect(ALL.filter(canReopen)).toEqual(['cancelled', 'expired']);
  });

  it('withdraws what is on the board, or not yet on it', () => {
    expect(ALL.filter(canCancel)).toEqual(['draft', 'active', 'offers_received']);
  });

  it('offers nothing once a carrier has it', () => {
    // A transport in progress is not the client's to withdraw from here;
    // cancelling a job somebody is driving is a different conversation.
    for (const status of ['carrier_selected', 'in_progress', 'delivered', 'disputed'] as const) {
      expect(canPublish(status)).toBe(false);
      expect(canCancel(status)).toBe(false);
      expect(canReopen(status)).toBe(false);
    }
  });

  it('leaves a suspended request alone entirely', () => {
    // Suspension is the compliance sweep's doing and the sweep undoes it
    // when the papers are back in order. Nothing the client presses here
    // would change that, so nothing is offered.
    expect(canPublish('suspended')).toBe(false);
    expect(canReopen('suspended')).toBe(false);
    expect(canCancel('suspended')).toBe(false);
  });
});

describe('the order of the list', () => {
  it('puts what is live first, whatever its age', () => {
    const live = request({ id: 'live', status: 'active', createdAt: '2026-01-01T00:00:00Z' });
    const dead = request({ id: 'dead', status: 'cancelled', createdAt: '2026-09-01T00:00:00Z' });
    expect([dead, live].sort(byBoardThenAge).map((r) => r.id)).toEqual(['live', 'dead']);
  });

  it('puts the newer of two live ones first', () => {
    const older = request({ id: 'older', createdAt: '2026-09-01T00:00:00Z' });
    const newer = request({ id: 'newer', createdAt: '2026-09-10T00:00:00Z' });
    expect([older, newer].sort(byBoardThenAge).map((r) => r.id)).toEqual(['newer', 'older']);
  });
});
