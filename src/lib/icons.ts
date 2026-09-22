import {
  AlarmClock,
  Anchor,
  Bandage,
  Bell,
  Bike,
  Box,
  Building2,
  Bus,
  Cable,
  Car,
  CarFront,
  CarTaxiFront,
  Caravan,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Container,
  Construction,
  Copy,
  CreditCard,
  Download,
  FileSearch,
  FileText,
  Forklift,
  Handshake,
  Hourglass,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListChecks,
  Lock,
  MailCheck,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Minus,
  Package,
  PackageCheck,
  Phone,
  Plus,
  Route,
  Scale,
  ScrollText,
  Search,
  Settings,
  Ship,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Tractor,
  Truck,
  TruckElectric,
  Umbrella,
  Upload,
  UserRound,
  Users,
  Van,
  Wallet,
  Warehouse,
  Weight,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { VEHICLE_CLASS_ORDER, type VehicleClass } from './pricing';
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

/**
 * Re-exported so that nothing outside this file needs to name
 * `lucide-react` at all, not even for a type. A component that takes an
 * icon as a prop imports the type from here.
 */
export type { LucideIcon };

/**
 * The sizes anything in this system may be. Nothing else is allowed.
 *
 * These were 13 / 16 / 20 and the whole set was reported as invisible.
 * The `sm` case is the one that did the damage: 13px of 1.75 stroke, in
 * `currentColor`, inside a row of 10px uppercase muted mono — an icon
 * technically on the page and practically not there. Each step up, and
 * `sm` is now larger than the text it sits beside rather than smaller.
 */
export const ICON_SIZES = { sm: 15, md: 18, lg: 22 } as const;
export type IconSize = keyof typeof ICON_SIZES;

/**
 * One stroke width, so a row of icons reads as one row.
 *
 * 2 rather than 1.75, which is also lucide's own default. At these sizes
 * the quarter-point is the difference between a drawing and a smudge,
 * and it costs nothing at `lg`.
 */
export const ICON_STROKE = 2;

/**
 * The one gap between an icon and its label.
 *
 * Exported as a class rather than left to each call site, because it had
 * already drifted to three values. `IconLabel` applies it; anything
 * laying out its own row uses this constant.
 */
export const ICON_GAP = 'gap-2';

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
  // Not a shield, and not a warning triangle either: this is a service a
  // firm offers, not an alarm.
  transport_avariat: Bandage,
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
  // A plain tick, not a shield. `docs/13-iconuri.md` is explicit that
  // nothing may read as an official seal, and a shield on anything to do
  // with a document is the shape people already recognise as one.
  valid: CircleCheck,
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
// Price classes
//
// `price_rates` is keyed by `vehicle_class`, a shorter vocabulary than
// the categories: it splits a car by size because the rate does, and it
// knows nothing about caravans. It used to live in its own file with its
// own map, its own stroke width and its own size — the exact drift the
// one-map rule exists to stop, discovered while fixing this.
// ---------------------------------------------------------------------
export const VEHICLE_CLASS_ICONS: Record<VehicleClass, LucideIcon> = {
  motocicleta: Bike,
  hatchback: Car,
  sedan: CarFront,
  suv: CarTaxiFront,
  autoutilitara: Van,
};

export function iconForVehicleClass(code: VehicleClass): LucideIcon {
  return VEHICLE_CLASS_ICONS[code];
}

// ---------------------------------------------------------------------
// Interface glyphs
//
// A chevron is not a domain concept and pretending otherwise would put
// „chevron" in a list beside „motocicletă". They are here anyway, for
// one reason: so that `lucide-react` is imported in exactly one file and
// a test can say so. `tests/unit/icons.test.ts` is that test.
// ---------------------------------------------------------------------
export type UiGlyph =
  | 'expand'
  | 'forward'
  | 'menu'
  | 'close'
  | 'check'
  | 'absent'
  | 'locked'
  | 'pending'
  | 'phone'
  | 'mail'
  | 'person'
  | 'company'
  | 'place'
  | 'search'
  | 'empty';

export const UI_ICONS: Record<UiGlyph, LucideIcon> = {
  expand: ChevronDown,
  forward: ChevronRight,
  menu: Menu,
  close: X,
  check: Check,
  absent: Minus,
  locked: Lock,
  pending: Clock,
  phone: Phone,
  mail: MailCheck,
  person: UserRound,
  company: Building2,
  place: MapPin,
  search: Search,
  empty: FileSearch,
};

export function uiIcon(glyph: UiGlyph): LucideIcon {
  return UI_ICONS[glyph];
}

// ---------------------------------------------------------------------
// Status banners
//
// Two of these are deliberately absent, and that absence is the rule
// rather than an omission: a suspension and a rejection get words and
// nothing else. `docs/13-iconuri.md` says why — a pictogram beside „Cont
// suspendat" turns a sentence somebody has to read into a notification
// they can dismiss. The banners carried a warning triangle and a red
// cross for months because the rule was written in a document and never
// applied to the code; `tests/unit/icons.test.ts` now checks the code.
// ---------------------------------------------------------------------
export type BannerKind =
  | 'suspended'
  | 'rejected'
  | 'pending'
  | 'draft'
  | 'documents_expiring'
  | 'trial_ending'
  | 'quota_reached';

export const BANNER_ICONS: Partial<Record<BannerKind, LucideIcon>> = {
  pending: Clock,
  draft: ClipboardCheck,
  documents_expiring: AlarmClock,
  trial_ending: Clock,
  quota_reached: ChartNoAxesColumn,
};

/** Null for the two that must never have one. */
export function iconForBanner(kind: BannerKind): LucideIcon | null {
  return BANNER_ICONS[kind] ?? null;
}

/** The banners that get words and nothing else. */
export const SOLEMN_BANNERS: readonly BannerKind[] = ['suspended', 'rejected'];

// ---------------------------------------------------------------------
// Navigation
//
// Keyed by the route, because that is what a `NavItem` already carries
// and the labels differ by account type — a carrier's „Oferte trimise"
// and a forwarder's „Oferte primite" are the same destination and want
// the same icon.
//
// `tests/unit/navigation.test.ts` walks every item the builder can
// produce, for every account type, and fails on one without an icon.
// That is the check that makes this map complete rather than nearly
// complete, which is what it was the first time.
// ---------------------------------------------------------------------
export const NAV_ICONS: Record<string, LucideIcon> = {
  [ROUTES.account]: LayoutDashboard,
  [ROUTES.accountRequests]: CarFront,
  [ROUTES.accountOffers]: Tag,
  [ROUTES.accountTransports]: Truck,
  [ROUTES.accountRatings]: Star,
  [ROUTES.accountMessages]: MessageSquare,
  [ROUTES.accountDepartures]: Route,
  [ROUTES.accountFleet]: Truck,
  [ROUTES.accountDocuments]: FileText,
  [ROUTES.accountMembers]: Users,
  [ROUTES.accountCompany]: Building2,
  [ROUTES.accountSubscription]: CreditCard,
  [ROUTES.accountAlerts]: Bell,
  [ROUTES.accountFavourites]: Star,
  [ROUTES.accountInvitations]: Inbox,
  [ROUTES.accountProfile]: UserRound,
  [ROUTES.accountNotificationSettings]: Bell,
  [ROUTES.accountPersonalData]: ScrollText,
  [ROUTES.accountHelp]: CircleHelp,
  [ROUTES.requests]: CarFront,
  [ROUTES.routes]: Route,
  [ROUTES.companies]: Building2,
  [ROUTES.prices]: Wallet,
  [ROUTES.plans]: CreditCard,
  [ROUTES.faq]: CircleHelp,
  [ROUTES.contact]: Megaphone,
  [ROUTES.newRequest]: Plus,
  // Admin
  [ROUTES.admin]: LayoutDashboard,
  [ROUTES.adminCompanies]: Building2,
  [ROUTES.adminDocuments]: FileSearch,
  [ROUTES.adminOffers]: Tag,
  [ROUTES.adminOrders]: Truck,
  [ROUTES.adminRatings]: Star,
  [ROUTES.adminListings]: Megaphone,
  [ROUTES.adminConversations]: MessageSquare,
  [ROUTES.adminReports]: Scale,
  [ROUTES.adminAuditLog]: ScrollText,
  [ROUTES.adminTeam]: Users,
  [ROUTES.adminOnboardings]: Handshake,
  [ROUTES.adminPlans]: CreditCard,
  [ROUTES.adminSubscriptions]: Wallet,
  [ROUTES.adminPrices]: Wallet,
  [ROUTES.adminOptions]: ListChecks,
  [ROUTES.adminPages]: FileText,
  [ROUTES.adminImport]: Download,
  [ROUTES.adminNotifications]: Bell,
  [ROUTES.adminDeletions]: ScrollText,
  [ROUTES.adminPilot]: ChartNoAxesColumn,
  [ROUTES.adminActivity]: ChartNoAxesColumn,
  [ROUTES.adminSettings]: Settings,
};

/** Null for a destination nobody has chosen an icon for yet. */
export function iconForRoute(href: string): LucideIcon | null {
  return NAV_ICONS[href] ?? null;
}

// ---------------------------------------------------------------------
// Repeated actions
//
// A button somebody presses many times a day earns an icon; a button
// pressed once does not, and a destructive one may never have one.
// ---------------------------------------------------------------------
export type ActionKind =
  | 'add'
  | 'upload'
  | 'download'
  | 'search'
  | 'filter'
  | 'copy'
  | 'help';

export const ACTION_ICONS: Record<ActionKind, LucideIcon> = {
  add: Plus,
  upload: Upload,
  download: Download,
  search: Search,
  filter: SlidersHorizontal,
  copy: Copy,
  help: LifeBuoy,
};

export function iconForAction(kind: ActionKind): LucideIcon {
  return ACTION_ICONS[kind];
}

// ---------------------------------------------------------------------
// The things a listing is described by
//
// Used on the request and route detail pages, where a definition list of
// twelve rows is otherwise a wall somebody has to read line by line.
// ---------------------------------------------------------------------
export type FactKind =
  | 'route'
  | 'window'
  | 'vehicle'
  | 'weight'
  | 'distance'
  | 'service'
  | 'condition'
  | 'price'
  | 'company'
  | 'capacity';

export const FACT_ICONS: Record<FactKind, LucideIcon> = {
  route: Route,
  window: AlarmClock,
  vehicle: CarFront,
  weight: Weight,
  distance: MapPin,
  service: Tag,
  condition: Wrench,
  price: Wallet,
  company: Building2,
  capacity: Warehouse,
};

export function iconForFact(kind: FactKind): LucideIcon {
  return FACT_ICONS[kind];
}

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
  action: { icons: ACTION_ICONS, values: Object.keys(ACTION_ICONS) },
  fact: { icons: FACT_ICONS, values: Object.keys(FACT_ICONS) },
  ui: { icons: UI_ICONS, values: Object.keys(UI_ICONS) },
  vehicleClass: { icons: VEHICLE_CLASS_ICONS, values: VEHICLE_CLASS_ORDER },
} as const;
