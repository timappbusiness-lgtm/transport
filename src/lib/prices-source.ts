import { VEHICLE_CLASS_ORDER, type PriceRate, type PriceSettings } from './pricing';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * Reading the indicative prices, server-side.
 *
 * The publication rule is not repeated here. `price_rates` and
 * `price_settings` are readable only when `prices_are_published()` says so,
 * or to staff — so an unpublished table comes back empty for a visitor
 * whatever this code does. A page that forgot to check would show nothing
 * rather than something it should not.
 */

export interface PriceData {
  rates: PriceRate[];
  /** null when nothing is published and the caller is not staff. */
  settings: PriceSettings | null;
  /** When the team last published. Only the staff screen shows it. */
  approvedAt: string | null;
}

export const NO_PRICES: PriceData = { rates: [], settings: null, approvedAt: null };

/** True when there is a table to show and the team has published it. */
export function isPublished(data: PriceData): boolean {
  return data.settings?.is_published === true && data.rates.length > 0;
}

export async function loadPrices(): Promise<PriceData> {
  if (!isSupabaseConfigured()) return NO_PRICES;

  const supabase = await createClient();
  const [rates, settings] = await Promise.all([
    supabase.from('price_rates').select('*').order('sort_order', { ascending: true }),
    supabase.from('price_settings').select('*').maybeSingle(),
  ]);

  if (rates.error) {
    console.error('[preturi] rates query failed', {
      code: rates.error.code,
      message: rates.error.message,
    });
  }
  if (settings.error) {
    console.error('[preturi] settings query failed', {
      code: settings.error.code,
      message: settings.error.message,
    });
  }

  return {
    rates: (rates.data ?? []).map(toRate),
    settings: settings.data ? toSettings(settings.data) : null,
    approvedAt: settings.data?.approved_at ?? null,
  };
}

/**
 * The homepage band shows three classes, not five: enough to place a car,
 * short enough not to become the page.
 */
export const HOME_CLASSES = ['hatchback', 'sedan', 'suv'] as const;

export function homeRates(rates: PriceRate[]): PriceRate[] {
  const wanted = new Set<string>(HOME_CLASSES);
  return rates.filter((rate) => wanted.has(rate.vehicle_class));
}

/** Classes in table order, whatever order the rows arrived in. */
export function inClassOrder(rates: PriceRate[]): PriceRate[] {
  return [...rates].sort(
    (a, b) =>
      VEHICLE_CLASS_ORDER.indexOf(a.vehicle_class) - VEHICLE_CLASS_ORDER.indexOf(b.vehicle_class),
  );
}

/**
 * `numeric` arrives as a JSON number through PostgREST, but the column type
 * allows more precision than a float carries, so every figure is coerced
 * once here rather than trusted in five components.
 */
function toRate(row: {
  vehicle_class: PriceRate['vehicle_class'];
  weight_label: string;
  local_ron_per_km: number;
  national_ron_per_km: number;
  international_eur_per_km: number;
  minimum_ron: number;
  minimum_eur: number;
}): PriceRate {
  return {
    vehicle_class: row.vehicle_class,
    weight_label: row.weight_label,
    local_ron_per_km: Number(row.local_ron_per_km),
    national_ron_per_km: Number(row.national_ron_per_km),
    international_eur_per_km: Number(row.international_eur_per_km),
    minimum_ron: Number(row.minimum_ron),
    minimum_eur: Number(row.minimum_eur),
  };
}

function toSettings(row: {
  not_running_surcharge_pct: number;
  express_surcharge_pct: number;
  road_distance_factor: number;
  range_spread_pct: number;
  valid_month: string | null;
  is_published: boolean;
}): PriceSettings {
  return {
    not_running_surcharge_pct: Number(row.not_running_surcharge_pct),
    express_surcharge_pct: Number(row.express_surcharge_pct),
    road_distance_factor: Number(row.road_distance_factor),
    range_spread_pct: Number(row.range_spread_pct),
    valid_month: row.valid_month,
    is_published: row.is_published,
  };
}
