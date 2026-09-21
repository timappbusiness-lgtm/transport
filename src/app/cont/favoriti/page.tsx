import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { FavouriteButton } from '@/components/favourites/favourite-button';
import { HelpLink } from '@/components/help/help-link';
import { Card } from '@/components/ui/primitives';
import { ROUTES, companyRoute } from '@/config/routes';
import { favouritesCopy } from '@/content/favoriti';
import { requireAccountContext } from '@/lib/auth/account';
import { loadFavourites } from '@/lib/favourites-source';

export const metadata: Metadata = { title: favouritesCopy.meta.title };
export const dynamic = 'force-dynamic';

const c = favouritesCopy;

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountFavourites);
  const company = context.activeCompany;

  const rows = company ? await loadFavourites(company.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <TopBar title={c.title} actions={[]} />
      <div>
        <p className="max-w-[62ch] text-sm text-muted">{c.lede}</p>
        <p className="mt-1 max-w-[62ch] text-[0.8125rem] text-muted">{c.shared}</p>
        <p className="mt-2">
          <HelpLink topic="favourites" />
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-[1.0625rem]">{c.empty}</p>
          <p className="mt-1 max-w-[54ch] text-sm text-muted">{c.emptyBody}</p>
          <p className="mt-4 text-sm">
            <Link href={ROUTES.companies} className="underline underline-offset-4">
              Vezi transportatorii →
            </Link>
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.carrier_company_id}>
              <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[1rem] font-medium">
                    {row.slug !== null ? (
                      <Link
                        href={companyRoute(row.slug)}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-muted">
                    {[row.city, row.county].filter(Boolean).join(', ') || '—'} ·{' '}
                    {row.rating_count > 0
                      ? `${Number(row.rating_avg ?? 0).toFixed(1)} · ${c.ratings(row.rating_count)}`
                      : c.noRatings}
                  </p>
                  {row.note !== null ? (
                    <p className="mt-1 text-[0.8125rem]">{row.note}</p>
                  ) : null}
                </div>

                <FavouriteButton carrierCompanyId={row.carrier_company_id} isFavourite />
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">{c.privacy}</p>
    </div>
  );
}
