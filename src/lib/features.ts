/**
 * What is actually built.
 *
 * A menu item that leads to a "în curând" page teaches people to distrust
 * the menu, so navigation is generated from this map rather than written
 * out. Every entry is false until the feature has a page a person can use;
 * flipping one to true is how the item appears, and the nav tests read the
 * same map, so a flag turned on without a page shows up as a failing test
 * rather than as a dead link.
 *
 * The schema is ahead of the interface in several places — `offers`,
 * `conversations`/`messages`, `transports` and `ratings` all have tables,
 * RLS and RPCs but no screen. That is why they are listed here at all:
 * without the list, "the table exists" keeps getting mistaken for "the
 * feature exists".
 */
export interface FeatureMap {
  /** Publishing a transport request, and the client's own list of them. */
  requests: boolean;
  /** The public board of requests, with filters. */
  requestBoard: boolean;
  /** Saved searches and the alerts they cause — /cont/alerte. */
  savedSearches: boolean;
  /** Carrier routes, and the bookings against them. */
  departures: boolean;
  /** Offers on a request, and the clarification thread on one. */
  offers: boolean;
  /**
   * General messaging — a thread on any listing, an inbox, unread counts.
   * Still false: Faza 2 built the thread on a single offer and nothing
   * more, and a menu item called „Mesaje" that opens one offer would be
   * a promise the product does not keep.
   */
  messages: boolean;
  /**
   * Orders: execution, proof of delivery, the evidence against them.
   * Live since Faza 2 — the seven steps, the photographs and the
   * disputes.
   */
  transports: boolean;
  /**
   * Ratings and computed reputation. Live since Faza 2: the window, the
   * one correction, the firm's single public reply, and the figures on
   * the public profile — none of which anybody types.
   */
  ratings: boolean;
  /** The in-app notifications centre. */
  notifications: boolean;
  /** /cont/setari, including notification preferences and data export. */
  settings: boolean;
  fleet: boolean;
  documents: boolean;
  members: boolean;
  subscription: boolean;
  companyProfile: boolean;
}

export const FEATURES: FeatureMap = {
  requests: true,
  requestBoard: true,
  savedSearches: true,
  departures: true,
  offers: true,
  messages: false,
  transports: true,
  ratings: true,
  notifications: false,
  settings: false,
  fleet: true,
  documents: true,
  members: true,
  subscription: true,
  companyProfile: true,
};
