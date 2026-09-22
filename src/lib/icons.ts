import {
  AlarmClock,
  Anchor,
  Bike,
  Box,
  Building2,
  Bus,
  Cable,
  Car,
  CarFront,
  Caravan,
  ClipboardCheck,
  Container,
  Construction,
  FileText,
  Forklift,
  Hourglass,
  Link2,
  MapPin,
  MessageSquare,
  Package,
  PackageCheck,
  Route,
  ShieldCheck,
  Ship,
  Sparkles,
  Tag,
  Tractor,
  Truck,
  TruckElectric,
  Umbrella,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { CARGO_CATEGORIES, type CargoCategory } from './departures';
import { ORDER_STEPS, type OrderStatus } from './orders';

/**
 * One icon per value, in one file.
 *
 * Icons help somebody scan a list and recognise a thing they have seen
 * before. That is the whole of what they are for here. They are not
 * decoration, and there are places in this application where an icon
 * would be worse than nothing — see `docs/13-iconuri.md` for where and
 * why, because the rule is easier to break than to remember.
 *
 * Two rules hold everywhere:
 *
 *   - an icon is never the only meaning. Every one of these is drawn
 *     beside a label, or carries an accessible name of its own. A row
 *     that is only a pictogram is a row somebody cannot read.
 *   - one size scale, one stroke width, colour from the tokens. `Icon`
 *     in `src/components/ui/icon.tsx` is how that stays true; nothing
 *     renders a lucide component directly any more.
 *
 * `tests/unit/icons.test.ts` fails both ways: a value with no icon, and
 * an icon mapped to a value that no longer exists.
 */

/** The sizes anything in this system may be. Nothing else is allowed. */
export const ICON_SIZES = { sm: 13, md: 16, lg: 20 } as const;
export type IconSize = keyof typeof ICON_SIZES;

/** One stroke width, so a row of icons reads as one row. */
export const ICON_STROKE = 1.75;

// ---------------------------------------------------------------------
// Vehicle categories
//
// Every value the enum can hold, not only the ten still offered: an old
// listing on `camion` renders on the board like any other.
// ---------------------------------------------------------------------
export const CATEGORY_ICONS: Record<CargoCategory, LucideIcon> = {
  autoturism: Car,
  autoutilitara: Truck,
  microbuz: Bus,
  motocicleta: Bike,
  atv_quad: Bike,
  rulota: Caravan,
  remorca: Caravan,
  cvadriciclu: TruckElectric,
  istoric: Sparkles,
  altele: Package,
  // Retired, still readable.
  utilaj_agricol: Tractor,
  utilaj_constructii: Construction,
  cap_tractor: Truck,
  camion: Truck,
  utilaj_manipulare: Forklift,
  container: Container,
  ambarcatiune: Ship,
};

// ---------------------------------------------------------------------
// Equipment and services
//
// Keyed by the `code` column of `equipment_options` and
// `service_options`. The team can add a row to either table from
// /admin/optiuni without a deploy, so a code with no icon here is a
// normal state rather than a bug: `iconForEquipment` returns null and
// the chip renders as text. What the test checks is that nothing in this
// map points at a code the seed does not have.
// ---------------------------------------------------------------------
export const EQUIPMENT_ICONS: Record<string, LucideIcon> = {
  troliu: Cable,
  platforma_hidraulica: Forklift,
  rampe: Route,
  chingi: Link2,
  roti_transport: Package,
  prelata: Umbrella,
  remorca_inchisa: Box,
  cric: Wrench,
  robot_pornire: Zap,
  lant_tractare: Anchor,
};

export const SERVICE_ICONS: Record<string, LucideIcon> = {
  transport_platforma: Truck,
  tractare: Cable,
  transport_inchis: Box,
  transport_nefunctional: Wrench,
  transport_avariat: ShieldCheck,
  transport_motociclete: Bike,
  transport_utilaje: Tractor,
  ridicare_domiciliu: MapPin,
  livrare_domiciliu: MapPin,
  transport_expres: Zap,
};

// ---------------------------------------------------------------------
// Status chips
//
// Always beside their text. A chip that is a coloured dot and nothing
// else tells a person who cannot see colour nothing at all.
// ---------------------------------------------------------------------
export type StatusKind = 'valid' | 'expiring_soon' | 'expired' | 'in_review' | 'missing';

export const STATUS_ICONS: Record<StatusKind, LucideIcon> = {
  valid: ShieldCheck,
  expiring_soon: AlarmClock,
  expired: Hourglass,
  in_review: Hourglass,
  missing: FileText,
};

export const STATUS_LABELS: Record<StatusKind, string> = {
  valid: 'Valid',
  expiring_soon: 'Expiră curând',
  expired: 'Expirat',
  in_review: 'În verificare',
  missing: 'Lipsește',
};

// ---------------------------------------------------------------------
// Order timeline
// ---------------------------------------------------------------------
/**
 * The seven steps only.
 *
 * `transport_status` also holds `disputed`, `cancelled` and four names
 * the lifecycle left behind, and none of them gets an icon. A dispute is
 * a serious moment between two firms, and a pictogram beside it is the
 * exact kind of decoration this system refuses. `iconForOrderStep`
 * returns null for them and the timeline renders the label alone.
 *
 * Partial on purpose, therefore — the type cannot express „these seven
 * and no others", so `tests/unit/icons.test.ts` does: every step has an
 * icon, and `disputed` and `cancelled` have none.
 */
export const ORDER_STEP_ICONS: Partial<Record<OrderStatus, LucideIcon>> = {
  order_confirmed: ClipboardCheck,
  pickup_scheduled: AlarmClock,
  vehicle_picked_up: Package,
  in_transit: Truck,
  delivery_scheduled: AlarmClock,
  vehicle_delivered: PackageCheck,
  order_completed: ClipboardCheck,
};

// ---------------------------------------------------------------------
// Content types, for a mixed list
// ---------------------------------------------------------------------
export type ContentType =
  | 'cerere'
  | 'traseu'
  | 'oferta'
  | 'comanda'
  | 'mesaj'
  | 'document'
  | 'firma';

export const CONTENT_ICONS: Record<ContentType, LucideIcon> = {
  cerere: CarFront,
  traseu: Route,
  oferta: Tag,
  comanda: ClipboardCheck,
  mesaj: MessageSquare,
  document: FileText,
  firma: Building2,
};

export const CONTENT_LABELS: Record<ContentType, string> = {
  cerere: 'Cerere',
  traseu: 'Traseu',
  oferta: 'Ofertă',
  comanda: 'Comandă',
  mesaj: 'Mesaj',
  document: 'Document',
  firma: 'Firmă',
};

// ---------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------

export function iconForCategory(code: CargoCategory): LucideIcon {
  return CATEGORY_ICONS[code];
}

/** Null when the team added an option we have no icon for. Not an error. */
export function iconForEquipment(code: string): LucideIcon | null {
  return EQUIPMENT_ICONS[code] ?? null;
}

export function iconForService(code: string): LucideIcon | null {
  return SERVICE_ICONS[code] ?? null;
}

export function iconForStatus(kind: StatusKind): LucideIcon {
  return STATUS_ICONS[kind];
}

export function iconForOrderStep(status: OrderStatus): LucideIcon | null {
  return ORDER_STEP_ICONS[status] ?? null;
}

export function iconForContent(type: ContentType): LucideIcon {
  return CONTENT_ICONS[type];
}

/** What the completeness test walks. Exported so it cannot drift from it. */
export const ICON_MAPS = {
  category: { icons: CATEGORY_ICONS, values: CARGO_CATEGORIES },
  orderStep: { icons: ORDER_STEP_ICONS, values: ORDER_STEPS },
  status: { icons: STATUS_ICONS, values: Object.keys(STATUS_LABELS) },
  content: { icons: CONTENT_ICONS, values: Object.keys(CONTENT_LABELS) },
} as const;
