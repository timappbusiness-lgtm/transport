import Link from 'next/link';
import { PlanForm, type EditablePlan } from '@/components/admin/plan-form';
import { PricingSettingsForm } from '@/components/admin/pricing-settings-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { formatDateRo } from '@/lib/format';
import { toPlan, type BillingMonths, type PricingSettings } from '@/lib/plans';
import { DEFAULT_PRICING_SETTINGS } from '@/lib/plans-source';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = adminDirectoryCopy.plans;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Prices, periods, what a plan card says, and the billing settings.
 *
 * Access is the layout's job — a non-staff visitor gets a 404 there — and
 * every RPC behind these forms checks again. This page only reads, and it
 * reads every plan including the ones taken off sale, which is why it uses
 * the session client rather than the public one.
 */
export default async function Page() {
  const { plans, settings, history } = await load();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
        <p className="mt-3 text-body">
          <Link
            href={ROUTES.plans}
            className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {c.preview}
          </Link>
        </p>
      </div>

      <PricingSettingsForm settings={settings} />

      {plans.length > 0 ? (
        <div className="flex flex-col gap-4">
          {plans.map((plan) => (
            <PlanForm key={plan.code} plan={plan} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted">{c.empty}</p>
      )}

      <section aria-labelledby="istoric">
        <h2 id="istoric" className="text-h3">
          {c.history}
        </h2>
        {history.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-4 py-2.5 text-small"
              >
                <span className="font-mono text-small text-muted">{entry.at}</span>
                <span>{entry.action}</span>
                {entry.reason ? <span className="text-muted">· {entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-body text-muted">{c.historyEmpty}</p>
        )}
      </section>
    </div>
  );
}

interface HistoryEntry {
  id: string;
  at: string;
  action: string;
  reason: string | null;
}

async function load(): Promise<{
  plans: EditablePlan[];
  settings: PricingSettings;
  history: HistoryEntry[];
}> {
  if (!isSupabaseConfigured()) {
    return { plans: [], settings: DEFAULT_PRICING_SETTINGS, history: [] };
  }

  const supabase = await createClient();
  const [plans, periods, settings, audit] = await Promise.all([
    supabase.from('plans').select('*').order('sort_order', { ascending: true }),
    supabase.from('plan_billing_periods').select('*'),
    supabase.from('pricing_settings').select('*').maybeSingle(),
    supabase
      .from('audit_log')
      .select('id,action,reason,created_at')
      .in('action', ['plan.updated', 'plan_period.updated', 'pricing_settings.updated'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  for (const [label, result] of [
    ['plans', plans],
    ['periods', periods],
    ['settings', settings],
    ['audit', audit],
  ] as const) {
    if (result.error) {
      console.error(`[admin] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return {
    plans: (plans.data ?? []).map((row) => ({
      ...toPlan(row, periods.data ?? []),
      isPublic: row.is_public,
      // Every period, including the ones taken off sale: this screen is
      // where one is put back.
      allPeriods: (periods.data ?? [])
        .filter((p) => p.plan_code === row.code)
        .map((p) => ({
          months: p.months as BillingMonths,
          total: Number(p.total_price_ron),
          isPublic: p.is_public,
        }))
        .sort((a, b) => a.months - b.months),
    })),
    settings: settings.data
      ? {
          trialDays: settings.data.trial_days,
          vatLabel: settings.data.vat_label,
          manualBilling: settings.data.manual_billing,
          billingContactEmail: settings.data.billing_contact_email,
        }
      : DEFAULT_PRICING_SETTINGS,
    history: (audit.data ?? []).map((row) => ({
      id: row.id,
      at: formatDateRo(row.created_at),
      action: row.action,
      reason: row.reason,
    })),
  };
}
