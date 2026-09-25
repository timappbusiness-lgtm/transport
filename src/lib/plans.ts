import type { Database } from '@/lib/supabase/database.types';
import { formatNumber, pluralRo } from './requests';

/**
 * What a plan costs, and what that means next to the monthly price.
 *
 * One rule runs through this file: **a discount is never a stored number**.
 * The database holds the monthly price and the total for a period; every
 * "economisești" and every "2 luni gratuite" on the page is computed from
 * those two, here. A percentage in a column is a figure nobody can check
 * against the price printed beside it, and the reference site we were shown
 * is full of them.
 *
 * Free of React and of SQL, so every figure below is testable without either.
 */

export type PlanAudience = Database['public']['Enums']['plan_audience'];
export type FeatureStatus = 'included' | 'not_included' | 'coming_soon';

export interface PlanFeature {
  key: string;
  label: string;
  status: FeatureStatus;
}

export interface BillingPeriod {
  months: BillingMonths;
  /** Total for the whole period, in lei. */
  total: number;
}

export interface Plan {
  code: string;
  name: string;
  description: string | null;
  audience: PlanAudience | null;
  /** Lei per month at the monthly rate — the figure every saving is measured against. */
  monthlyPrice: number;
  highlight: boolean;
  features: PlanFeature[];
  periods: BillingPeriod[];
  limits: PlanLimits;
}

/** The numbers the database actually enforces. null means no limit. */
export interface PlanLimits {
  contactsPerMonth: number | null;
  activeTruckListings: number | null;
  activeCargoListings: number | null;
  savedSearches: number | null;
}

export interface PricingSettings {
  trialDays: number;
  /** null says nothing about VAT rather than guessing. */
  vatLabel: string | null;
  manualBilling: boolean;
  billingContactEmail: string | null;
}

export const BILLING_MONTHS = [1, 6, 12] as const;
export type BillingMonths = (typeof BILLING_MONTHS)[number];

export const AUDIENCES: readonly PlanAudience[] = ['carrier', 'forwarder'];

/** Romanian in the URL, so a shared link reads like the site. */
const AUDIENCE_PARAMS: Record<PlanAudience, string> = {
  carrier: 'transportatori',
  forwarder: 'expeditii',
};

export const AUDIENCE_LABELS: Record<PlanAudience, string> = {
  carrier: 'Transportatori',
  forwarder: 'Case de expediții',
};

export function audienceParam(audience: PlanAudience): string {
  return AUDIENCE_PARAMS[audience];
}

/**
 * Anything unrecognised falls back to carriers rather than erroring: a
 * stale link should show a page, not a 400.
 */
export function parseAudience(value: string | string[] | undefined): PlanAudience {
  const raw = Array.isArray(value) ? value[0] : value;
  const found = AUDIENCES.find((a) => AUDIENCE_PARAMS[a] === raw);
  return found ?? 'carrier';
}

export function parseMonths(value: string | string[] | undefined): BillingMonths {
  const raw = Number(Array.isArray(value) ? value[0] : value);
  return (BILLING_MONTHS as readonly number[]).includes(raw) ? (raw as BillingMonths) : 1;
}

export const MONTHS_LABELS: Record<BillingMonths, string> = {
  1: 'Lunar',
  6: '6 luni',
  12: '12 luni',
};

/**
 * What a plan costs at a given period, and what that saves.
 *
 * `null` when the plan does not sell that period — the card then says so
 * rather than inventing a price by multiplying.
 */
export interface PriceView {
  months: BillingMonths;
  /** Lei per month at this period, rounded for display. */
  perMonth: number;
  /** Lei for the whole period. */
  total: number;
  /** Lei saved against paying monthly for the same span. 0 when none. */
  saving: number;
  /**
   * Whole months the saving is worth, when it is an exact number of them.
   * null otherwise — "2 luni gratuite" is a claim, and it is only made
   * when the arithmetic says exactly two.
   */
  freeMonths: number | null;
}

export function priceAt(plan: Plan, months: BillingMonths): PriceView | null {
  const period = plan.periods.find((p) => p.months === months);
  if (!period) return null;

  const saving = round(plan.monthlyPrice * months - period.total);

  return {
    months,
    perMonth: Math.round(exact(period.total / months)),
    total: period.total,
    saving: saving > 0 ? saving : 0,
    freeMonths: freeMonths(plan.monthlyPrice, period.total, months),
  };
}

/**
 * "2 luni gratuite", but only when it is true.
 *
 * The chip appears when the total is exactly N monthly payments short of
 * the period — 1.490 is ten times 149, so twelve months cost ten. Anything
 * that does not divide cleanly gets the computed saving in lei instead,
 * because "1,97 luni gratuite" is not a thing anybody says.
 */
export function freeMonths(
  monthlyPrice: number,
  total: number,
  months: BillingMonths,
): number | null {
  if (monthlyPrice <= 0 || total <= 0) return null;

  const paidMonths = exact(total / monthlyPrice);
  if (!Number.isInteger(paidMonths)) return null;

  const free = months - paidMonths;
  return free >= 1 ? free : null;
}

/** "2 luni gratuite", "o lună gratuită". */
export function freeMonthsLabel(free: number): string {
  return free === 1 ? 'o lună gratuită' : `${pluralRo(free, 'lună', 'luni')} gratuite`;
}

/** "Economisești 298 lei față de plata lunară." */
export function savingLabel(saving: number): string {
  return `Economisești ${formatLei(saving)} față de plata lunară.`;
}

/** "1.490 lei" — Romanian groups thousands with a full stop. */
export function formatLei(value: number): string {
  return `${formatNumber(value)} lei`;
}

/**
 * The VAT sentence from the settings, ready to follow another sentence,
 * or null when staff left it empty. It is the only statement about VAT a
 * subscription price carries, so every place that shows one shows this
 * next to it; nothing computes or guesses a VAT amount.
 */
export function vatSentence(settings: Pick<PricingSettings, 'vatLabel'>): string | null {
  const label = settings.vatLabel?.trim();
  if (!label) return null;
  return /[.!?]$/.test(label) ? label : `${label}.`;
}

/** "1.490 lei la 12 luni", or "149 lei pe lună" for the monthly rate. */
export function totalLabel(price: PriceView): string {
  return price.months === 1
    ? `${formatLei(price.total)} pe lună`
    : `${formatLei(price.total)} la ${pluralRo(price.months, 'lună', 'luni')}`;
}

/**
 * Float arithmetic on money.
 *
 * 149 × 12 − 1490 lands on 298.00000000000006, and a saving printed as that
 * is worse than no saving at all. Six decimal places is far beyond what any
 * price here carries, so this only removes the artefact.
 */
function exact(value: number): number {
  return Number(value.toFixed(6));
}

function round(value: number): number {
  return Math.round(exact(value));
}

/** Only the plans this audience is offered, cheapest first. */
export function plansFor(plans: readonly Plan[], audience: PlanAudience): Plan[] {
  return plans.filter((plan) => plan.audience === audience);
}

/**
 * The recommended plan, or the dearest one if nothing is marked.
 *
 * The homepage reads this rather than a hardcoded `carrier` code, so
 * changing which plan is recommended in the admin screen changes the price
 * the homepage states.
 */
export function highlightedPlan(
  plans: readonly Plan[],
  audience: PlanAudience,
): Plan | null {
  const forAudience = plansFor(plans, audience);
  return (
    forAudience.find((plan) => plan.highlight) ??
    forAudience.reduce<Plan | null>(
      (best, plan) => (best === null || plan.monthlyPrice > best.monthlyPrice ? plan : best),
      null,
    )
  );
}

/** What a card lists: never the absent ones, which belong in the table. */
export function cardFeatures(plan: Plan): PlanFeature[] {
  return plan.features.filter((f) => f.status !== 'not_included');
}

/**
 * Every feature any plan in the set mentions, in the order the plans list
 * them, so the comparison table has one row per feature and no gaps.
 */
export function comparisonRows(plans: readonly Plan[]): PlanFeature[] {
  const seen = new Map<string, PlanFeature>();
  for (const plan of plans) {
    for (const feature of plan.features) {
      if (!seen.has(feature.key)) seen.set(feature.key, feature);
    }
  }
  return [...seen.values()];
}

/**
 * The features as the admin screen edits them: one line each.
 *
 * `cheie | text | stare`, because a jsonb textarea is a way to lose a
 * plan's feature list to a missing bracket. The status word is Romanian
 * for the same reason the rest of the screen is.
 */
const STATUS_WORDS: Record<string, FeatureStatus> = {
  inclus: 'included',
  neinclus: 'not_included',
  curand: 'coming_soon',
  'curând': 'coming_soon',
};

const STATUS_BACK: Record<FeatureStatus, string> = {
  included: 'inclus',
  not_included: 'neinclus',
  coming_soon: 'curand',
};

export function featuresToText(features: readonly PlanFeature[]): string {
  return features.map((f) => `${f.key} | ${f.label} | ${STATUS_BACK[f.status]}`).join('\n');
}

export function featuresFromText(text: string): PlanFeature[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .flatMap((line) => {
      const [key, label, status] = line.split('|').map((part) => part.trim());
      if (!key || !label) return [];
      // A line with no status is an included one: that is the common case,
      // and it keeps a short list short.
      return [{ key, label, status: STATUS_WORDS[(status ?? '').toLowerCase()] ?? 'included' }];
    });
}

/**
 * Which section of the comparison table a feature belongs in.
 *
 * A key the map does not know still appears, in a group of its own at the
 * end, rather than vanishing from the table: a feature added in the admin
 * screen should show up even before somebody files it.
 */
export type FeatureGroup = 'acces' | 'publicare' | 'alerte' | 'echipa' | 'suport' | 'altele';

export const FEATURE_GROUP_ORDER: readonly FeatureGroup[] = [
  'acces',
  'publicare',
  'alerte',
  'echipa',
  'suport',
  'altele',
];

const FEATURE_GROUPS: Record<string, FeatureGroup> = {
  board: 'acces',
  contacts: 'acces',
  docs: 'acces',
  expiry: 'acces',
  directory: 'acces',
  offers: 'acces',
  routes: 'publicare',
  post: 'publicare',
  promoted: 'publicare',
  alerts: 'alerte',
  seats: 'echipa',
  support: 'suport',
};

export function groupOf(key: string): FeatureGroup {
  return FEATURE_GROUPS[key] ?? 'altele';
}

export interface ComparisonGroup {
  group: FeatureGroup;
  rows: PlanFeature[];
}

/** The table, in sections, with empty sections left out. */
export function groupedComparison(plans: readonly Plan[]): ComparisonGroup[] {
  const rows = comparisonRows(plans);
  return FEATURE_GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((row) => groupOf(row.key) === group),
  })).filter((section) => section.rows.length > 0);
}

/** How a given plan stands on a given feature. Absent means not included. */
export function featureStatus(plan: Plan, key: string): FeatureStatus {
  return plan.features.find((f) => f.key === key)?.status ?? 'not_included';
}

export const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  included: 'Inclus',
  not_included: 'Nu este inclus',
  coming_soon: 'În curând',
};

/** "Nelimitat" reads better than an em dash where a number would go. */
export function limitLabel(value: number | null, unit: string): string {
  return value === null ? 'Nelimitat' : `${formatNumber(value)} ${unit}`;
}

/**
 * A row of `plans` as the pages use it, with its periods attached.
 *
 * The view's numeric columns come back from PostgREST as strings when they
 * do not fit a float, so they are coerced once here rather than trusted in
 * a component.
 */
type PlanRow = Database['public']['Tables']['plans']['Row'];
type PeriodRow = Database['public']['Tables']['plan_billing_periods']['Row'];

export function toPlan(row: PlanRow, periods: readonly PeriodRow[]): Plan {
  return {
    code: row.code,
    name: row.name,
    description: row.short_description,
    audience: row.audience,
    monthlyPrice: Number(row.price_ron_month),
    highlight: row.highlight,
    features: toFeatures(row.features),
    periods: periods
      .filter((p) => p.plan_code === row.code)
      .map((p) => ({ months: p.months as BillingMonths, total: Number(p.total_price_ron) }))
      .sort((a, b) => a.months - b.months),
    limits: {
      contactsPerMonth: row.max_contact_reveals_month,
      activeTruckListings: row.max_active_truck_listings,
      activeCargoListings: row.max_active_cargo_listings,
      savedSearches: row.max_saved_searches,
    },
  };
}

/**
 * The jsonb column, checked rather than cast.
 *
 * A constraint keeps the shape right in the database, but the column is
 * still `Json` to TypeScript and this is the boundary — an entry that does
 * not parse is dropped rather than rendered as `undefined`.
 */
export function toFeatures(value: unknown): PlanFeature[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { key, label, status } = entry as Record<string, unknown>;
    if (typeof key !== 'string' || typeof label !== 'string') return [];
    if (status !== 'included' && status !== 'not_included' && status !== 'coming_soon') return [];
    return [{ key, label, status }];
  });
}
