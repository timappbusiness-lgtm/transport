import { unstable_cache } from 'next/cache';
import {
  DIRECTORY_PAGE_SIZE,
  HOME_GRID_SIZE,
  TYPE_FILTER_MATCHES,
  dayNumber,
  sanitizeSearch,
  toCompany,
  toDocument,
  type DirectoryFilters,
  type DirectoryStats,
  type DirectoryThresholds,
  type PublicCompany,
  type PublicCompanyDocument,
} from './directory';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the directory reads, and how often.
 *
 * The homepage's slice and the counts behind it are the same for every
 * visitor, so they are read with the sessionless client and cached. The
 * directory's own pages are filtered per visitor and are not: a query with
 * a county and a search term in it would fill the cache with one entry per
 * combination and hit the database anyway.
 */

export const DIRECTORY_TAG = 'company-directory';
const REVALIDATE_SECONDS = 300;

/** The columns every page reads. Listed once so no page invents its own. */
const COMPANY_COLUMNS =
  'slug,name,legal_name,cui,city,county,company_type,logo_path,public_description,verified_since,rating_avg,rating_count,compliant_vehicles,serves_national,serves_international,last_checked_at' as const;

export interface CarrierPlan {
  name: string;
  /** Lei per month, as the database holds it. */
  priceMonth: number;
  features: string[];
}

export interface HomepageDirectory {
  /** null when there is no database configured, or the query failed. */
  stats: DirectoryStats | null;
  thresholds: DirectoryThresholds;
  /** The slice the homepage grid shows today. */
  companies: PublicCompany[];
  /** null hides the price card rather than showing a price we made up. */
  plan: CarrierPlan | null;
}

/**
 * The defaults the migration seeds, used only when there is no database to
 * ask. A checkout with no Supabase shows no grid and no counts, which is
 * the honest answer to "how many firms are there" when we cannot tell.
 */
export const DEFAULT_DIRECTORY_THRESHOLDS: DirectoryThresholds = {
  statsMinCompanies: 20,
  directoryMinCompanies: 12,
  trialDays: 30,
};

export const NO_DIRECTORY: HomepageDirectory = {
  stats: null,
  thresholds: DEFAULT_DIRECTORY_THRESHOLDS,
  companies: [],
  plan: null,
};

async function fetchHomepageDirectory(): Promise<HomepageDirectory> {
  if (!isSupabaseConfigured()) return NO_DIRECTORY;

  const supabase = createPublicClient();
  const [statsResult, settings, plan] = await Promise.all([
    supabase.rpc('directory_stats'),
    supabase
      .from('homepage_settings')
      .select('stats_min_companies,directory_min_companies,trial_days')
      .maybeSingle(),
    supabase
      .from('plans')
      .select('name,price_ron_month,display_features')
      .eq('code', 'carrier')
      .eq('is_public', true)
      .maybeSingle(),
  ]);

  report('stats', statsResult.error);
  report('settings', settings.error);
  report('plan', plan.error);

  const row = Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data;
  const stats = row
    ? {
        verifiedCompanies: Number(row.verified_companies ?? 0),
        compliantVehicles: Number(row.compliant_vehicles ?? 0),
        listedCompanies: Number(row.listed_companies ?? 0),
      }
    : null;

  return {
    stats,
    thresholds: settings.data
      ? {
          statsMinCompanies: settings.data.stats_min_companies,
          directoryMinCompanies: settings.data.directory_min_companies,
          trialDays: settings.data.trial_days,
        }
      : DEFAULT_DIRECTORY_THRESHOLDS,
    companies: await homeSlice(stats?.listedCompanies ?? 0),
    plan: plan.data
      ? {
          name: plan.data.name,
          priceMonth: Number(plan.data.price_ron_month),
          features: plan.data.display_features ?? [],
        }
      : null,
  };
}

/**
 * Twelve of however many there are, rotating by the day.
 *
 * The window is taken in the database rather than by fetching everything
 * and slicing: a directory of three hundred firms should not become three
 * hundred rows on the homepage's critical path. When the window runs past
 * the end of the list it wraps with a second, smaller read.
 */
async function homeSlice(total: number): Promise<PublicCompany[]> {
  const supabase = createPublicClient();
  const offset = total > HOME_GRID_SIZE ? dayNumber(new Date()) % total : 0;

  const first = await supabase
    .from('v_public_companies')
    .select(COMPANY_COLUMNS)
    .order('slug', { ascending: true })
    .range(offset, offset + HOME_GRID_SIZE - 1);
  report('companies', first.error);

  const rows = first.data ?? [];
  const missing = HOME_GRID_SIZE - rows.length;
  if (missing > 0 && offset > 0) {
    const wrapped = await supabase
      .from('v_public_companies')
      .select(COMPANY_COLUMNS)
      .order('slug', { ascending: true })
      .range(0, missing - 1);
    report('companies (wrap)', wrapped.error);
    rows.push(...(wrapped.data ?? []));
  }

  return rows.map(toCompany).filter((c): c is PublicCompany => c !== null);
}

export const loadHomepageDirectory = unstable_cache(fetchHomepageDirectory, [DIRECTORY_TAG], {
  revalidate: REVALIDATE_SECONDS,
  tags: [DIRECTORY_TAG],
});

export interface DirectoryPage {
  companies: PublicCompany[];
  /** Rows matching the filters, across every page. */
  total: number;
  /** Every county that has a listed company, sorted. */
  counties: string[];
  stats: DirectoryStats | null;
  thresholds: DirectoryThresholds;
}

export const EMPTY_DIRECTORY_PAGE: DirectoryPage = {
  companies: [],
  total: 0,
  counties: [],
  stats: null,
  thresholds: DEFAULT_DIRECTORY_THRESHOLDS,
};

/**
 * One page of /firme. Not cached: the filters are the visitor's, and the
 * count is exact rather than estimated so the pager cannot offer a page
 * that turns out to be empty.
 */
export async function loadDirectoryPage(filters: DirectoryFilters): Promise<DirectoryPage> {
  if (!isSupabaseConfigured()) return EMPTY_DIRECTORY_PAGE;

  const supabase = createPublicClient();
  let query = supabase
    .from('v_public_companies')
    .select(COMPANY_COLUMNS, { count: 'exact' })
    .order('verified_since', { ascending: false, nullsFirst: false })
    .order('slug', { ascending: true });

  if (filters.county) query = query.eq('county', filters.county);
  if (filters.companyType) {
    query = query.in('company_type', [...TYPE_FILTER_MATCHES[filters.companyType]]);
  }
  if (filters.scope === 'intern') query = query.eq('serves_national', true);
  if (filters.scope === 'international') query = query.eq('serves_international', true);
  if (filters.query) {
    const term = sanitizeSearch(filters.query);
    if (term !== '') {
      query = query.or(`name.ilike.%${term}%,legal_name.ilike.%${term}%,cui.ilike.%${term}%`);
    }
  }

  const from = (filters.page - 1) * DIRECTORY_PAGE_SIZE;
  const [result, meta] = await Promise.all([
    query.range(from, from + DIRECTORY_PAGE_SIZE - 1),
    loadDirectoryMeta(),
  ]);
  report('directory page', result.error);

  return {
    companies: (result.data ?? []).map(toCompany).filter((c): c is PublicCompany => c !== null),
    total: result.count ?? 0,
    counties: meta.counties,
    stats: meta.stats,
    thresholds: meta.thresholds,
  };
}

interface DirectoryMeta {
  counties: string[];
  stats: DirectoryStats | null;
  thresholds: DirectoryThresholds;
}

/**
 * The parts of /firme that do not depend on the filters — the county list
 * and the counts — so they are cached once for everybody rather than
 * fetched again for every combination of filters.
 */
async function fetchDirectoryMeta(): Promise<DirectoryMeta> {
  if (!isSupabaseConfigured()) {
    return { counties: [], stats: null, thresholds: DEFAULT_DIRECTORY_THRESHOLDS };
  }

  const supabase = createPublicClient();
  const [counties, home] = await Promise.all([
    supabase.from('v_public_companies').select('county').not('county', 'is', null).limit(2000),
    loadHomepageDirectory(),
  ]);
  report('counties', counties.error);

  const unique = new Set<string>();
  for (const row of counties.data ?? []) {
    if (row.county) unique.add(row.county);
  }

  return {
    counties: [...unique].sort((a, b) => a.localeCompare(b, 'ro')),
    stats: home.stats,
    thresholds: home.thresholds,
  };
}

const loadDirectoryMeta = unstable_cache(fetchDirectoryMeta, [`${DIRECTORY_TAG}-meta`], {
  revalidate: REVALIDATE_SECONDS,
  tags: [DIRECTORY_TAG],
});

export interface CompanyProfile {
  company: PublicCompany;
  documents: PublicCompanyDocument[];
}

/**
 * One profile, or null.
 *
 * null is what a suspended, unverified or opted-out company looks like from
 * outside, and the page turns it into a 404: a 403 would confirm that the
 * firm is on the platform, which is exactly what the company asked us not
 * to publish.
 */
export async function loadCompanyProfile(slug: string): Promise<CompanyProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createPublicClient();
  const [company, documents] = await Promise.all([
    supabase.from('v_public_companies').select(COMPANY_COLUMNS).eq('slug', slug).maybeSingle(),
    supabase.from('v_public_company_documents').select('kind,label_ro,state,valid_month').eq('slug', slug),
  ]);

  report('profile', company.error);
  report('profile documents', documents.error);

  const mapped = company.data ? toCompany(company.data) : null;
  if (!mapped) return null;

  return {
    company: mapped,
    documents: (documents.data ?? [])
      .map(toDocument)
      .filter((d): d is PublicCompanyDocument => d !== null),
  };
}

/**
 * The public URL of a logo in the `company-logos` bucket.
 *
 * The bucket is public, so this is a string built from the project URL
 * rather than a signed request. null when there is no logo, or no Supabase
 * configured, and the card draws initials instead.
 */
export function companyLogoUrl(path: string | null): string | null {
  if (!path || !isSupabaseConfigured()) return null;
  const { data } = createPublicClient().storage.from('company-logos').getPublicUrl(path);
  return data.publicUrl;
}

function report(label: string, error: { code?: string; message: string } | null): void {
  if (!error) return;
  console.error(`[firme] ${label} query failed`, { code: error.code, message: error.message });
}
