import Link from 'next/link';
import { HideProfileForm } from '@/components/admin/hide-profile-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { companyRoute } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { toCompany, type PublicCompany } from '@/lib/directory';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { pluralRo } from '@/lib/requests';
import { EmptyState } from '@/components/ui/empty-state';

const c = adminDirectoryCopy.companies;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Moderating the public list.
 *
 * It reads the same view a visitor reads, on purpose: what a staff member
 * sees here is exactly what is published, rather than a second query that
 * could show something the public page does not.
 */
export default async function Page() {
  const { companies, ids } = await load();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      {companies.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {companies.map((company) => (
            <li
              key={company.slug}
              className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]"
            >
              <div className="min-w-0">
                <p className="font-medium">{company.name}</p>
                <p className="mt-1 text-small text-muted">
                  {[company.city, company.county].filter(Boolean).join(' · ')}
                  {company.compliantVehicles > 0
                    ? ` · ${pluralRo(company.compliantVehicles, 'vehicul', 'vehicule', 'un')}`
                    : ''}
                </p>
                <p className="mt-2 text-body">
                  <Link
                    href={companyRoute(company.slug)}
                    className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
                  >
                    {c.view}
                  </Link>
                </p>
              </div>
              {ids[company.slug] ? <HideProfileForm companyId={ids[company.slug]!} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={c.empty} />
      )}
    </div>
  );
}

/**
 * The listed firms, plus the ids the action needs.
 *
 * The public view carries no id — nothing public should — so the ids come
 * from `companies`, which RLS opens to staff and to nobody else.
 */
async function load(): Promise<{ companies: PublicCompany[]; ids: Record<string, string> }> {
  if (!isSupabaseConfigured()) return { companies: [], ids: {} };

  const supabase = await createClient();
  const [listed, rows] = await Promise.all([
    supabase.from('v_public_companies').select('*').order('slug', { ascending: true }).limit(200),
    supabase.from('companies').select('id,slug').eq('public_profile_enabled', true).limit(500),
  ]);

  for (const [label, result] of [
    ['listed', listed],
    ['ids', rows],
  ] as const) {
    if (result.error) {
      console.error(`[admin] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const ids: Record<string, string> = {};
  for (const row of rows.data ?? []) {
    if (row.slug) ids[row.slug] = row.id;
  }

  return {
    companies: (listed.data ?? []).map(toCompany).filter((x): x is PublicCompany => x !== null),
    ids,
  };
}
