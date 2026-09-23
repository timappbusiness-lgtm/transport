import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { iconForContent, iconForFact, iconForStatus } from '@/lib/icons';
import { SendOffer } from '@/components/offers/send-offer';
import { PushPermissionCard } from '@/components/push/permission-card';
import { RequestCard } from '@/components/requests/request-card';
import { Checklist, type ChecklistStep } from '@/components/account/checklist';
import { buttonClasses } from '@/components/ui/button';
import { Card, DataRow } from '@/components/ui/primitives';
import { ROUTES, vehicleRoute } from '@/config/routes';
import { appCopy } from '@/content/app';
import type { AccountContext, Company } from '@/lib/auth/account';
import type { CarrierDashboard } from '@/lib/dashboard-source';
import type { DetourFit } from '@/lib/matching';
import type { OfferSettings } from '@/lib/offers';
import type { EligibleVehicle, OfferQuota } from '@/lib/offers-source';
import { formatNumber, pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = appCopy.carrier;
const h = appCopy.home;

/**
 * What a carrier needs to see when they open the application.
 *
 * Two questions, in order: what is blocking or about to block, and what
 * work is available. Everything else — the counts, the quick actions — sits
 * below those.
 *
 * A widget with no data is not rendered at all. A dashboard of zeros reads
 * as a broken account rather than a quiet week, and there is nothing to act
 * on in a zero.
 */
export function CarrierHome({
  company,
  context,
  data,
  contactsLimit,
  offering,
}: {
  company: Company;
  context: AccountContext;
  data: CarrierDashboard;
  /** null means unlimited, and then there is nothing to count against. */
  contactsLimit: number | null;
  /**
   * What a match card needs to offer „Trimite ofertă", read once for the
   * whole page. null while the feature is off, and then the cards are
   * what they were: something to read and click through to.
   */
  offering: {
    vehicles: readonly EligibleVehicle[];
    settings: OfferSettings;
    quota: OfferQuota | null;
    /** Request id → the live offer already on it. */
    pending: Record<string, string>;
    /**
     * Matches that are this firm's own requests. Subcontracting puts
     * them here, and an offer on your own listing is refused, so they
     * get no button rather than one that always fails.
     */
    own: readonly string[];
  } | null;
}) {
  const verified = company.verification_status === 'verified';
  const attention = hasAttention(data);
  const now = new Date(data.now);

  return (
    <div className="flex flex-col gap-8">
      {/* One block at the top answering one question, and everything
          else under it. The verification checklist used to sit above
          this heading as a second, unlabelled „what to do now" — two
          lists of pending work with one heading between them. */}
      <section aria-labelledby="atentie">
        <h2 id="atentie" className="text-h3">
          {h.needsAttention}
        </h2>

        {!verified ? (
          <div className="mt-3">
            <Checklist title={c.checklist.title} steps={steps(company, data)} />
            <p className="mt-2 text-small text-muted">{c.checklist.lede}</p>
          </div>
        ) : null}

        {attention ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.pendingBookings.length > 0 ? (
              <Attention
                icon={<Icon as={iconForFact('window')} size="md" />}
                title={c.bookings.title}
                href={ROUTES.accountDepartures}
                action={c.bookings.action}
              >
                <ul className="flex flex-col gap-1">
                  {data.pendingBookings.slice(0, 3).map((booking) => (
                    <li key={booking.id} className="flex flex-wrap gap-x-2 text-small">
                      <span className="text-foreground">
                        {booking.fromCity} → {booking.toCity}
                      </span>
                      <span className="text-muted">
                        {pluralRo(booking.slots, 'loc', 'locuri', 'un')}
                      </span>
                      <Countdown expiresAt={booking.expiresAt} now={now} />
                    </li>
                  ))}
                </ul>
              </Attention>
            ) : null}

            {data.documentsExpiring > 0 || data.documentsRejected > 0 ? (
              <Attention
                icon={<Icon as={iconForStatus('expiring_soon')} size="md" />}
                title={c.documents.title}
                href={ROUTES.accountDocuments}
                action={c.documents.action}
              >
                <ul className="flex flex-col gap-1 text-small">
                  {data.documentsExpiring > 0 ? (
                    <li>{c.documents.expiring(pluralRo(data.documentsExpiring, 'document', 'documente', 'un'))}</li>
                  ) : null}
                  {data.documentsRejected > 0 ? (
                    <li>{c.documents.rejected(pluralRo(data.documentsRejected, 'document', 'documente', 'un'))}</li>
                  ) : null}
                </ul>
              </Attention>
            ) : null}

            {data.vehiclesBlocked > 0 ? (
              <Attention
                icon={<Icon as={iconForContent('comanda')} size="md" />}
                title={c.vehicles.title}
                href={ROUTES.accountFleet}
                action={c.vehicles.action}
              >
                <p className="text-small">
                  {c.vehicles.body(pluralRo(data.vehiclesBlocked, 'vehicul', 'vehicule', 'un'))}
                </p>
              </Attention>
            ) : null}
          </div>
        ) : verified ? (
          <p className="mt-3 text-body text-muted">{h.nothingToDo}</p>
        ) : null}
      </section>

      {/* A carrier looking at requests matched to their firm is a carrier
          who would rather hear about the next one than come back to check.
          The card asks here and nowhere else on this page. */}
      <PushPermissionCard audience="carrier" trigger={data.matches.length > 0} />

      {data.matches.length > 0 ? (
        <section aria-labelledby="potriviri">
          <h2 id="potriviri" className="text-h3">
            {c.matches.title}
          </h2>
          <p className="mt-1 text-small text-muted">{c.matches.lede}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.matches.map((request) => (
              <li key={request.id} className="flex min-w-0 flex-col">
                <RequestCard request={request} now={now} as="div" />
                <MatchReasons
                  reasons={data.matchReasons[request.id] ?? []}
                  detour={data.detours[request.id]}
                />
                {offering !== null && !offering.own.includes(request.id) ? (
                  <div className="mt-3">
                    <SendOffer
                      request={{ id: request.id, loading_from: request.loading_from }}
                      context={context}
                      vehicles={offering.vehicles}
                      settings={offering.settings}
                      quota={offering.quota}
                      pendingOfferId={offering.pending[request.id] ?? null}
                      compact
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.activeRoutes > 0 ? (
        <section aria-labelledby="activitate">
          <h2 id="activitate" className="text-h3">
            {h.activity}
          </h2>
          <Card className="mt-3 px-5 py-2">
            {/* The three counts this card is for, in the accent. */}
            <DataRow label={c.activity.routes} value={formatNumber(data.activeRoutes)} tone="accent" />
            {data.seatsTotal > 0 ? (
              <DataRow
                label={c.activity.seats}
                value={`${formatNumber(data.seatsTaken)} / ${formatNumber(data.seatsTotal)}`}
                tone="accent"
              />
            ) : null}
            <DataRow
              label={c.activity.contacts}
              value={
                contactsLimit === null
                  ? formatNumber(data.contactsThisMonth)
                  : `${formatNumber(data.contactsThisMonth)} / ${formatNumber(contactsLimit)}`
              }
              tone="accent"
            />
          </Card>
        </section>
      ) : null}

      <section aria-labelledby="actiuni">
        <h2 id="actiuni" className="text-h3">
          {h.quickActions}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`${ROUTES.accountDepartureNew}?directie=tur`}
            // The bar's „Publică" is this screen's primary; a second
            // filled button for the same thing splits the eye.
            className={buttonClasses('secondary', 'sm')}
          >
            {c.actions.tur}
          </Link>
          <Link
            href={`${ROUTES.accountDepartureNew}?directie=retur`}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.actions.retur}
          </Link>
          <Link href={ROUTES.accountFleet} className={buttonClasses('secondary', 'sm')}>
            {c.actions.vehicle}
          </Link>
          <Link href={ROUTES.accountDocuments} className={buttonClasses('secondary', 'sm')}>
            {c.actions.document}
          </Link>
        </div>
      </section>
    </div>
  );
}

function hasAttention(data: CarrierDashboard): boolean {
  return (
    data.pendingBookings.length > 0 ||
    data.documentsExpiring > 0 ||
    data.documentsRejected > 0 ||
    data.vehiclesBlocked > 0
  );
}

function Attention({
  icon,
  title,
  href,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-4">
      <p className="flex items-center gap-2 text-body font-medium">
        <span aria-hidden="true" className="text-warning">
          {icon}
        </span>
        {title}
      </p>
      <div className="mt-2 flex-1 text-muted">{children}</div>
      <p className="mt-3">
        <Link
          href={href}
          className="text-small link-accent"
        >
          {action}
        </Link>
      </p>
    </Card>
  );
}

/**
 * How long a reservation has left.
 *
 * Measured against the moment the data was read, not the moment of render:
 * a ticking countdown would need a client component on a dashboard that
 * otherwise needs none, and "expiră în 3 ore" is as actionable as
 * "02:59:41".
 */
function Countdown({ expiresAt, now }: { expiresAt: string | null; now: Date }) {
  if (!expiresAt) return null;

  const left = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(left)) return null;

  if (left <= 0) {
    return <span className="text-danger">{c.bookings.expired}</span>;
  }

  const hours = Math.floor(left / 3_600_000);
  const label =
    hours >= 1
      ? pluralRo(hours, 'oră', 'ore')
      : pluralRo(Math.max(Math.floor(left / 60_000), 1), 'minut', 'minute', 'un');

  return (
    // Under three hours it is ink and heavier, not amber: the warning
    // colour measures 3.64:1 as text on white, under AA. The weight
    // says „soon"; the words say how soon.
    <span className={cn(hours < 3 ? 'font-medium text-foreground' : 'text-muted')}>
      {c.bookings.expiresIn(label)}
    </span>
  );
}

/**
 * The checklist, from data rather than from a list of "în curând".
 *
 * Every step here is built now: company details, documents, vehicles and
 * the review itself all exist, so the checklist can finally say where the
 * company actually is instead of showing four locked rows.
 */
function steps(company: Company, data: CarrierDashboard): ChecklistStep[] {
  const companyDone = company.verification_status !== 'draft';
  const documentsDone = data.documentsMissing === 0 && data.documentsRejected === 0;
  const vehiclesDone = data.vehiclesActive > 0 && data.vehiclesBlocked === 0;
  const submitted = company.verification_status === 'pending';
  const verified = company.verification_status === 'verified';

  return [
    { key: 'company', label: 'Date firmă', state: companyDone ? 'done' : 'current' },
    {
      key: 'documents',
      label: 'Documente firmă',
      state: documentsDone ? 'done' : companyDone ? 'current' : 'soon',
    },
    {
      key: 'vehicles',
      label: 'Vehicule și documente',
      state: vehiclesDone ? 'done' : documentsDone ? 'current' : 'soon',
    },
    {
      key: 'verification',
      label: 'Verificare',
      state: verified ? 'done' : submitted ? 'current' : 'soon',
    },
    {
      key: 'publish',
      label: 'Publică primul traseu',
      state: data.activeRoutes > 0 ? 'done' : verified ? 'current' : 'soon',
    },
  ];
}

/** Unused today; kept so a vehicle row can link straight to its page. */
export const vehicleHref = vehicleRoute;

/**
 * Why this card is on this dashboard.
 *
 * Only reasons that can be backed up: `matchReasons` returns a code for
 * each test the request actually passed, and a chip is never invented to
 * fill the row. A card with no chips is a card matched on coverage alone,
 * which is true and does not need saying twice.
 */
function MatchReasons({
  reasons,
  detour,
}: {
  reasons: readonly string[];
  detour: DetourFit | undefined;
}) {
  if (reasons.length === 0 && detour === undefined) return null;

  return (
    <>
      {reasons.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <li
              key={reason}
              className="rounded-pill border border-border bg-ground-alt px-2.5 py-1 text-small text-muted"
            >
              {c.matches.reasons[reason] ?? reason}
            </li>
          ))}
        </ul>
      ) : null}

      {/* A whole sentence rather than a pill: it carries two numbers and
          a route name, and a pill that wraps to three lines on a phone is
          not a pill. */}
      {detour !== undefined ? (
        <p className="mt-2 text-small text-muted">
          {c.matches.detour(detour.detourKm, detour.toleranceKm, detour.fromCity, detour.toCity)}
        </p>
      ) : null}
    </>
  );
}
