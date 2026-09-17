import { PublishForm, RateForm, SettingsForm } from '@/components/prices/admin-forms';
import { RateTable } from '@/components/prices/rate-table';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { pricesCopy } from '@/content/preturi';
import { VEHICLE_CLASS_LABELS, formatValidMonth, type VehicleClass } from '@/lib/pricing';
import { inClassOrder, loadPrices } from '@/lib/prices-source';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = pricesCopy.admin;

/** The staff area is the session; nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Setting the indicative prices.
 *
 * Access is the layout's job — `src/app/admin/layout.tsx` gives a non-staff
 * visitor a 404, and the RPCs behind every form refuse them a second time.
 * What this screen adds is the sequence that matters: edit while nobody can
 * see it, look at the preview, then publish on purpose.
 */
export default async function Page() {
  const [data, history] = await Promise.all([loadPrices(), loadHistory()]);
  const settings = data.settings;
  const published = settings?.is_published === true;
  const rates = inClassOrder(data.rates);
  const month = formatValidMonth(settings?.valid_month ?? null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">{c.lede}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge tone={published ? 'success' : 'neutral'}>
            {published ? c.statusPublished : c.statusDraft}
          </StatusBadge>
          {published && data.approvedAt ? (
            <span className="text-[0.8125rem] text-muted">
              {c.publishedNote(formatMoment(data.approvedAt))}
            </span>
          ) : null}
          {month ? (
            <span className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
              {pricesCopy.table.updated(month)}
            </span>
          ) : null}
        </div>
      </div>

      {settings ? (
        <>
          <PublishForm published={published} />

          <section className="flex flex-col gap-4">
            <h2 className="text-[1.0625rem]">{c.rates.title}</h2>
            {rates.map((rate) => (
              <RateForm key={rate.vehicle_class} rate={rate} />
            ))}
          </section>

          <SettingsForm settings={settings} />

          <section>
            <h2 className="text-[1.0625rem]">{c.preview.title}</h2>
            <p className="mt-1 text-sm text-muted">{c.preview.lede}</p>
            <div className="mt-4">
              <RateTable rates={rates} settings={settings} express={false} />
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-card border border-border bg-surface p-5 text-sm text-muted">
          {pricesCopy.unpublished.title}
        </p>
      )}

      <section>
        <h2 className="text-[1.0625rem]">{c.history.title}</h2>
        {history.length > 0 ? (
          <ul className="mt-4 flex flex-col">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[0.75rem] tabular-nums text-muted">
                  {formatMoment(entry.created_at)}
                </span>
                <span className="text-sm">
                  {c.history.actions[entry.action] ?? entry.action}
                  {entry.subject ? ` · ${entry.subject}` : ''}
                </span>
                {entry.reason ? (
                  <span className="text-[0.8125rem] text-muted">{entry.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{c.history.empty}</p>
        )}
      </section>
    </div>
  );
}

interface HistoryEntry {
  id: number;
  created_at: string;
  action: string;
  reason: string | null;
  /** Which class the row was about, when the action was about one. */
  subject: string | null;
}

const PRICE_ACTIONS = [
  'price_rate.updated',
  'price_settings.updated',
  'prices.published',
  'prices.unpublished',
] as const;

/**
 * The trail, read through RLS: `audit_log` is staff-only, so a non-staff
 * caller gets an empty list rather than a leak, whatever this page renders.
 */
async function loadHistory(): Promise<HistoryEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, created_at, action, reason, after')
    .in('action', [...PRICE_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[admin/preturi] history query failed', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    action: row.action,
    reason: row.reason,
    subject: vehicleClassOf(row.after),
  }));
}

/** `after` is jsonb, which is to say it could be anything. */
function vehicleClassOf(after: unknown): string | null {
  if (typeof after !== 'object' || after === null) return null;
  const value = (after as Record<string, unknown>).vehicle_class;
  if (typeof value !== 'string') return null;
  return VEHICLE_CLASS_LABELS[value as VehicleClass] ?? null;
}

/**
 * Rendered on the server, so this is the server's clock — fine for a staff
 * trail, and the reason no component formats a timestamp for a visitor.
 */
function formatMoment(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
