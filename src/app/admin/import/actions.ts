'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface ImportSettingsState {
  error?: string;
  notice?: string;
}

/**
 * The dials behind the import panel.
 *
 * Validation is the table's, not this function's: the check constraints
 * on `import_settings` are the rule, and a second copy here would be a
 * second rule to keep in step. `set_import_settings` refuses a non-staff
 * caller regardless of what this file does.
 */
export async function saveImportSettingsAction(
  _previous: ImportSettingsState,
  formData: FormData,
): Promise<ImportSettingsState> {
  const number = (key: string): number => Number(String(formData.get(key) ?? ''));

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_import_settings', {
    p_is_enabled: formData.get('is_enabled') === 'on',
    p_daily_limit_per_user: number('daily_limit_per_user'),
    p_daily_limit_per_ip: number('daily_limit_per_ip'),
    p_monthly_budget_usd: number('monthly_budget_usd'),
    p_alert_at_pct: number('alert_at_pct'),
    p_min_field_confidence: number('min_field_confidence'),
  });

  if (error) return { error: toAppError(error, 'import.settings').message };

  revalidatePath(ROUTES.adminImport);
  revalidatePath(ROUTES.newRequest);
  return { notice: 'Setările au fost salvate.' };
}
