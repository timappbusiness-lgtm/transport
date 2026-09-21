import Link from 'next/link';
import { OfferForm } from '@/components/offers/offer-form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES, offerRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import type { AccountContext } from '@/lib/auth/account';
import type { OfferSettings } from '@/lib/offers';
import type { EligibleVehicle, OfferQuota } from '@/lib/offers-source';

const c = offersCopy.entry;

/**
 * The one place that decides whether „Trimite ofertă" appears.
 *
 * Two screens offer it — the public request page and the matches on the
 * carrier dashboard — and a second copy of these six conditions is how
 * they would start disagreeing. Nothing is loaded here: the caller reads
 * the fleet, the ceilings and the quota once and hands them down, so a
 * dashboard with six matches still makes one round trip for each.
 *
 * None of this is the rule. `guard_offer_insert()` refuses a request
 * that is not active, an offer on your own listing and a firm that
 * cannot act; `guard_offer_terms()` refuses the terms and the plan
 * limit; a partial unique index refuses the second pending offer. What
 * this buys is a carrier reading why before typing, rather than after.
 */
export function SendOffer({
  request,
  context,
  vehicles,
  settings,
  quota,
  pendingOfferId,
  priceRange,
  compact = false,
}: {
  request: {
    id: string;
    loading_from: string;
    /** Absent on the public board, where every row is active by definition. */
    status?: string;
  };
  context: AccountContext | null;
  vehicles: readonly EligibleVehicle[];
  settings: OfferSettings;
  quota: OfferQuota | null;
  /** Set when the caller already has a live offer on this request. */
  pendingOfferId: string | null;
  priceRange?: { low: string; high: string } | undefined;
  /** Inside a card on the dashboard: a button, never a paragraph. */
  compact?: boolean;
}) {
  if (context === null) {
    return compact ? null : (
      <Note body={c.signIn} href={ROUTES.signIn} action={c.signInAction} />
    );
  }

  if (request.status !== undefined && request.status !== 'active') {
    return compact ? null : <Note body={c.closed} />;
  }

  if (pendingOfferId !== null) {
    return (
      <Note body={c.already} href={offerRoute(pendingOfferId)} action={c.alreadyAction} />
    );
  }

  const company = context.activeCompany;
  if (company === null) {
    return compact ? null : (
      <Note body={c.needsCompany} href={ROUTES.accountCompanyCreate} action={c.needsCompanyAction} />
    );
  }
  if (company.is_suspended) {
    return <Note body={c.suspended} href={ROUTES.accountCompany} action={c.suspendedAction} />;
  }
  if (company.verification_status !== 'verified') {
    return <Note body={c.unverified} href={ROUTES.accountCompany} action={c.unverifiedAction} />;
  }

  // `allowed === null` is the ordinary case: a plan that names no ceiling
  // has none, which is what `offer_quota()` returns and what the trigger
  // then reads.
  if (quota !== null && quota.allowed !== null && quota.used >= quota.allowed) {
    return (
      <div className="rounded-card border border-warning/45 bg-warning/8 p-4 text-sm">
        <p className="font-medium">{offersCopy.quota.title}</p>
        <p className="mt-1 text-muted">
          {offersCopy.quota.body(quota.planName, quota.allowed)}
        </p>
        <Link href={ROUTES.plans} className="mt-3 inline-block underline underline-offset-4">
          {offersCopy.quota.action}
        </Link>
      </div>
    );
  }

  const left = quota !== null && quota.allowed !== null ? quota.allowed - quota.used : null;

  return (
    <div className="flex flex-col gap-2">
      <OfferForm
        listingId={request.id}
        loadingFrom={request.loading_from}
        vehicles={vehicles}
        needsVehicle={company.company_type !== 'expeditie'}
        settings={settings}
        priceRange={priceRange}
      />
      {/* Only once it is worth saying. „Îți mai rămân 47 de oferte" is
          noise; „Îți mai rămâne o ofertă" changes what somebody does. */}
      {left !== null && left <= 3 ? (
        <p className="text-[0.8125rem] text-muted">{offersCopy.quota.left(left)}</p>
      ) : null}
    </div>
  );
}

function Note({ body, href, action }: { body: string; href?: string; action?: string }) {
  return (
    <div className="rounded-card border border-border bg-ground-alt p-4 text-sm text-muted">
      <p>{body}</p>
      {href !== undefined && action !== undefined ? (
        <Link href={href} className={`${buttonClasses('secondary', 'sm')} mt-3`}>
          {action}
        </Link>
      ) : null}
    </div>
  );
}
