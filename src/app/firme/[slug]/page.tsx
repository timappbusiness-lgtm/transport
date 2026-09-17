import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompanyProfileBody } from '@/components/directory/profile-body';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { getAccountContext } from '@/lib/auth/account';
import { loadCompanyProfile } from '@/lib/directory-source';

const c = directoryCopy.profile;

type Params = Promise<{ slug: string }>;

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

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const [profile, context] = await Promise.all([loadCompanyProfile(slug), getAccountContext()]);

  // A firm that is suspended, not verified, or has opted out is simply not
  // there. A 403 with the word "suspendată" on it would publish a claim
  // about a real company that we do not make in public.
  if (!profile) notFound();

  return <CompanyProfileBody profile={profile} signedIn={context !== null} />;
}
