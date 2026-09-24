import { PricingBody } from '@/app/abonamente/page';
import { DepartureCard } from '@/components/departures/departure-card';
import { CompanyCard } from '@/components/directory/company-card';
import { DirectoryFiltersForm } from '@/components/directory/filters-form';
import { CompanyProfileBody } from '@/components/directory/profile-body';
import { BoardRequestCard } from '@/components/requests/board-card';
import { RequestCard } from '@/components/requests/request-card';
import { RatingCard } from '@/components/ratings/rating-card';
import { appCopy } from '@/content/app';
import { requestsCopy } from '@/content/cereri';
import { departuresCopy } from '@/content/departures';
import { directoryCopy } from '@/content/directory';
import { ratingsCopy } from '@/content/evaluari';
import { parseFilters } from '@/lib/directory';
import type { PlanAction } from '@/components/plans/plan-card';
import type { Plan } from '@/lib/plans';
import { formatCompanies } from '@/lib/trust';
import {
  BOARD_REQUESTS,
  COMPANY_PROFILE,
  DEPARTURES,
  DIRECTORY,
  LONG_FROM,
  LONG_TO,
  PLANS,
  PRICING_SETTINGS,
  PROBA_COMPANY,
  PROBA_NOW,
  RATINGS,
} from '@/components/proba/fixtures';

/**
 * The public boards, rendered from samples.
 *
 * Each wrapper below copies the container classes of the page it stands
 * for — `/cereri`, `/trasee`, `/firme`, a firm's profile — so a card here
 * is exactly as wide as it is there. When one of those pages changes its
 * container, the copy here has to follow.
 */

/** `src/app/cereri/(panou)/page.tsx`, `/trasee` and `/firme` all use this one. */
const BOARD = 'mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14';

/** `CompanyProfileBody`'s own container, for the ratings shown outside it. */
const PROFILE = 'mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14';

const NOW = new Date(PROBA_NOW);

export function CereriSection() {
  const c = requestsCopy.board;
  return (
    <div className={BOARD}>
      <section aria-label={c.title}>
        <p className="mb-4 text-small text-muted">{c.count(BOARD_REQUESTS.length)}</p>
        <ul className="flex flex-col gap-4">
          {BOARD_REQUESTS.map((request, index) => (
            <BoardRequestCard
              key={request.id}
              request={request}
              now={NOW}
              // The detour line „potrivite cu firma mea" adds, on the
              // card whose localities are already the longest.
              {...(index === 1
                ? { note: appCopy.carrier.matches.detour(148, 150, LONG_FROM, LONG_TO) }
                : {})}
            />
          ))}
        </ul>
      </section>

      {/* The same rows as the homepage feed draws them. */}
      <section aria-labelledby="proba-feed" className="mt-12">
        <h2 id="proba-feed" className="text-h3">
          Cardurile de pe prima pagină
        </h2>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOARD_REQUESTS.map((request) => (
            <RequestCard key={request.id} request={request} now={NOW} />
          ))}
        </ul>
      </section>
    </div>
  );
}

export function TraseeSection() {
  const c = departuresCopy.board;
  return (
    <div className={BOARD}>
      <section aria-label={c.title}>
        <p className="mb-4 text-small text-muted">{c.count(DEPARTURES.length)}</p>
        <ul className="flex flex-col gap-4">
          {DEPARTURES.map((departure) => (
            <DepartureCard key={departure.truck_listing_id} departure={departure} now={NOW} />
          ))}
        </ul>
      </section>
    </div>
  );
}

export function FirmeSection() {
  const c = directoryCopy.page;
  return (
    <>
      <div className={BOARD}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <aside className="rounded-card border border-border bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-4 text-body font-medium">{c.filters.legend}</h2>
            <DirectoryFiltersForm
              filters={parseFilters({})}
              counties={['Bistrița-Năsăud', 'Buzău', 'Caraș-Severin', 'Mehedinți', 'Satu Mare']}
            />
          </aside>

          <section aria-label={c.meta.title}>
            <p className="mb-4 text-body text-muted">{c.count(formatCompanies(DIRECTORY.length))}</p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {DIRECTORY.map((company) => (
                <li key={company.slug} className="min-w-0">
                  <CompanyCard company={company} logoUrl={null} detailed />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* The profile of the firm with the longest name, as `/firme/[slug]` draws it. */}
      <CompanyProfileBody profile={COMPANY_PROFILE} signedIn ratings={RATINGS} />
    </>
  );
}

export function EvaluariSection() {
  return (
    <div className={PROFILE}>
      <section aria-labelledby="proba-evaluari">
        <h2 id="proba-evaluari" className="text-h3">
          {ratingsCopy.profile.latest}
        </h2>
        <div className="mt-2">
          {RATINGS.map((rating) => (
            <RatingCard key={rating.id} rating={rating} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The pricing page itself, through the body it exports for exactly this:
 * the cards, the comparison table and the questions, from samples.
 */
export function AbonamenteSection() {
  return (
    <PricingBody
      plans={PLANS}
      settings={PRICING_SETTINGS}
      audience="carrier"
      months={12}
      actionFor={sampleAction}
    />
  );
}

/** What `actionFor` in the pricing page answers for a signed-in owner on a trial. */
function sampleAction(plan: Plan): PlanAction {
  if (plan.monthlyPrice === 0) return { kind: 'free' };
  if (plan.highlight) return { kind: 'current' };
  return { kind: 'request', companyId: PROBA_COMPANY.id };
}
