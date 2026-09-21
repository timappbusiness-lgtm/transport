import type { CargoCategory, ServiceType } from './departures';
import type { ListingStatus } from './requests';

/**
 * A request as its own client sees it, and what can be done to it next.
 *
 * Free of React and of SQL, because the card that renders it is a client
 * component: the loader lives in `my-requests-source.ts` and cannot be
 * imported from one. Every rule below is also in the RPC that enforces it —
 * a button that is not shown is a courtesy, `publish_cargo_request` and its
 * two neighbours are the rule.
 */

export interface MyRequest {
  id: string;
  status: ListingStatus;
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  loadingFrom: string;
  loadingTo: string | null;
  category: CargoCategory;
  make: string | null;
  model: string | null;
  year: number | null;
  isRunning: boolean;
  needsWinch: boolean;
  serviceType: ServiceType;
  publishedAt: string | null;
  createdAt: string;
  /**
   * Set when the team took the listing off the public board. The row stays
   * the owner's; `v_board_cargo` is what drops it. The reason is written
   * for them, so it is shown to them.
   */
  hiddenAt: string | null;
  hiddenReason: string | null;
}

/** On the board right now, which is what the list puts first. */
const ON_BOARD: readonly ListingStatus[] = ['active', 'offers_received'];

export function isOnBoard(status: ListingStatus): boolean {
  return ON_BOARD.includes(status);
}

export function canPublish(status: ListingStatus): boolean {
  return status === 'draft';
}

/** Expired and withdrawn both need new dates, which is what reopening asks for. */
export function canReopen(status: ListingStatus): boolean {
  return status === 'expired' || status === 'cancelled';
}

export function canCancel(status: ListingStatus): boolean {
  return status === 'draft' || status === 'active' || status === 'offers_received';
}

/** What is live comes first; a withdrawn request from March does not. */
export function byBoardThenAge(a: MyRequest, b: MyRequest): number {
  const live = Number(isOnBoard(b.status)) - Number(isOnBoard(a.status));
  return live !== 0 ? live : b.createdAt.localeCompare(a.createdAt);
}
