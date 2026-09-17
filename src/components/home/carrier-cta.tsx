import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Headline } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { trustCopy } from '@/content/siguranta';
import { loadHomepageActivity } from '@/lib/requests-source';
import { formatCompanies, showCarrierCount } from '@/lib/trust';

const c = trustCopy.cta;

/**
 * The band that asks for the request.
 *
 * The line about how many carriers there are appears only above a threshold
 * the team sets, and the number under it is a count of companies that are
 * verified, not suspended and licensed for transport — the same set the
 * offer guard lets through. Below the threshold the band keeps its two
 * buttons and says nothing about size, which is the honest answer while
 * there is not much to say.
 *
 * Reads the same cached loader the activity section above it does, so this
 * costs no extra query.
 */
export async function CarrierCta() {
  const { verifiedCarriers, thresholds } = await loadHomepageActivity();
  return (
    <CarrierCtaBand
      verifiedCarriers={verifiedCarriers}
      verifiedCompaniesMin={thresholds.verifiedCompaniesMin}
    />
  );
}

/** The band itself, given the count rather than fetching it. */
export function CarrierCtaBand({
  verifiedCarriers,
  verifiedCompaniesMin,
}: {
  verifiedCarriers: number | null;
  verifiedCompaniesMin: number;
}) {
  const withCount = showCarrierCount(verifiedCarriers, verifiedCompaniesMin);

  return (
    <section className="bg-ground-alt">
      <Container className="py-14 sm:py-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-10">
          <div className="min-w-0">
            <Headline as="h2" strong={c.strong} soft={c.soft} />
            {withCount && verifiedCarriers !== null ? (
              <p className="mt-4 text-[0.9375rem] text-muted">
                {c.count(formatCompanies(verifiedCarriers))}
              </p>
            ) : null}
          </div>

          <div className="flex flex-none flex-wrap gap-3">
            <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
              {c.primary}
            </Link>
            <Link href={ROUTES.verification} className={buttonClasses('secondary', 'md')}>
              {c.secondary}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
