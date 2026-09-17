import { PlanForm, type EditablePlan } from '@/components/admin/plan-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = adminDirectoryCopy.plans;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Prices and what a plan card says.
 *
 * Access is the layout's job — a non-staff visitor gets a 404 there — and
 * `set_plan` checks again. This page only reads.
 */
export default async function Page() {
  const plans = await load();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      {plans.length > 0 ? (
        <div className="flex flex-col gap-4">
          {plans.map((plan) => (
            <PlanForm key={plan.code} plan={plan} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{c.empty}</p>
      )}
    </div>
  );
}

async function load(): Promise<EditablePlan[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('plans')
    .select('code,name,price_ron_month,is_public,display_features')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[admin] plans query failed', { code: error.code, message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    code: row.code,
    name: row.name,
    priceMonth: Number(row.price_ron_month),
    isPublic: row.is_public,
    features: row.display_features ?? [],
  }));
}
