import 'server-only';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

/**
 * What `/admin/import` reads.
 *
 * The month's spend comes from `import_budget_status()`, which refuses a
 * non-staff caller in the database rather than trusting this file to have
 * checked. The attempt list comes through the table's own policy, which
 * shows staff everything and everybody else only their own.
 */

export interface ImportSettings {
  is_enabled: boolean;
  daily_limit_per_user: number;
  daily_limit_per_ip: number;
  monthly_budget_usd: number;
  alert_at_pct: number;
  min_field_confidence: number;
}

export interface ImportBudget {
  spent_usd: number;
  budget_usd: number;
  extractions: number;
  used_pct: number | null;
}

/** One attempt, as the screen shows it. Never what the page said. */
export interface ImportAttempt {
  id: string;
  created_at: string;
  source_type: 'link' | 'photo';
  source_host: string | null;
  status: 'running' | 'ok' | 'failed';
  failure_reason: string | null;
  duration_ms: number | null;
  cost_usd: number;
  fields_kept: number | null;
}

export interface ImportAdminData {
  settings: ImportSettings | null;
  budget: ImportBudget | null;
  attempts: ImportAttempt[];
}

export async function loadImportAdminData(): Promise<ImportAdminData> {
  // Without configuration there is nothing to read, and `createClient()`
  // throws rather than saying so. Every other source here opens with this.
  if (!isSupabaseConfigured()) return { settings: null, budget: null, attempts: [] };

  const supabase = await createClient();

  const [settings, budget, attempts] = await Promise.all([
    supabase.from('import_settings').select('*').single(),
    supabase.rpc('import_budget_status'),
    supabase
      .from('listing_extractions')
      .select('id, created_at, source_type, source_host, status, failure_reason, duration_ms, cost_usd, fields_kept')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const budgetRow = Array.isArray(budget.data) ? budget.data[0] : budget.data;

  return {
    settings: (settings.data as ImportSettings | null) ?? null,
    budget: (budgetRow as ImportBudget | undefined) ?? null,
    attempts: (attempts.data as ImportAttempt[] | null) ?? [],
  };
}
