import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompanyProfileBody } from '@/components/directory/profile-body';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { ratingsCopy } from '@/content/evaluari';
import { getAccountContext } from '@/lib/auth/account';
import { loadCompanyProfile } from '@/lib/directory-source';
import {
  RATINGS_PAGE_SIZE,
  loadCompanyRatings,
  loadRatingThresholds,
} from '@/lib/ratings-source';

const c = directoryCopy.profile;

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadCompanyProfile(slug);
  if (!profile) return { title: c.back, robots: { index: false, follow: false } };

  return {
    title: c.metaTitle(profile.company.name, profile.company.city),
    description: c.metaDescription(profile.company.name),
    alternates: { canonical: `${ROUTES.companies}/${slug}` },
    // Nothing on this site is indexed before launch; the app-wide default
    // in the root layout says so, and this repeats it.
    robots: { index: false, follow: true },
  };
}

/** Reads the session for the contact button, so never prerendered. */
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const page = pageNumber((await searchParams).pagina);

  const [profile, context, ratings, thresholds] = await Promise.all([
    loadCompanyProfile(slug),
    getAccountContext(),
    loadCompanyRatings(slug, page),
    loadRatingThresholds(),
  ]);

  // A firm that is suspended, not verified, or has opted out is simply not
  // there. A 403 with the word "suspendată" on it would publish a claim
  // about a real company that we do not make in public.
  if (!profile) notFound();

  const lastPage = Math.max(1, Math.ceil(ratings.total / RATINGS_PAGE_SIZE));

  return (
    <CompanyProfileBody
      profile={profile}
      signedIn={context !== null}
      ratings={ratings.rows}
      {...(thresholds ? { minPublicRatings: thresholds.min_public_ratings } : {})}
      ratingsPager={
        lastPage > 1 ? (
          <nav
            aria-label={ratingsCopy.profile.latest}
            className="mt-4 flex flex-wrap items-center gap-3 text-sm"
          >
            {page > 1 ? (
              <Link
                href={`${ROUTES.companies}/${slug}?pagina=${page - 1}#evaluari`}
                className="link-accent"
              >
                {ratingsCopy.profile.previous}
              </Link>
            ) : null}
            <span className="text-muted">{ratingsCopy.profile.page(page)}</span>
            {page < lastPage ? (
              <Link
                href={`${ROUTES.companies}/${slug}?pagina=${page + 1}#evaluari`}
                className="link-accent"
              >
                {ratingsCopy.profile.next}
              </Link>
            ) : null}
          </nav>
        ) : null
      }
    />
  );
}
