import Link from 'next/link';
import { DocumentHistory } from '@/components/account/document-history';
import { DocumentsScreen } from '@/components/account/documents-screen';
import { ReviewQueue } from '@/components/admin/review-queue';
import { CarrierHome } from '@/components/app/dashboard/carrier';
import { navContextOf } from '@/components/app/nav-context';
import { TopBar } from '@/components/app/top-bar';
import { CompletenessCard } from '@/components/firma/completeness-card';
import { CoverageTab } from '@/components/firma/coverage-tab';
import { ProfileTabs } from '@/components/firma/profile-tabs';
import { Composer } from '@/components/messages/composer';
import { ConversationTitle } from '@/components/messages/conversation-title';
import { MessageActions } from '@/components/messages/message-actions';
import { ThreadView } from '@/components/messages/thread-view';
import { ReceivedOffers } from '@/components/offers/received-offers';
import { ComparisonView, EvidenceGallery } from '@/components/orders/evidence-gallery';
import { ORDER_GRID } from '@/components/orders/order-grid';
import { OrderTimeline } from '@/components/orders/order-timeline';
import { OrdersWidget } from '@/components/orders/orders-widget';
import { RatingsWidget } from '@/components/ratings/ratings-widget';
import { MyRequestCard } from '@/components/requests/my-request-card';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, myRequestRoute, transportRoute } from '@/config/routes';
import { VERIFICATION_LABELS, accountCopy } from '@/content/account';
import { adminReviewCopy } from '@/content/admin';
import { appCopy } from '@/content/app';
import { requestsCopy } from '@/content/cereri';
import { ordersCopy } from '@/content/comenzi';
import { firmaCopy } from '@/content/firma';
import { inscriereCopy } from '@/content/inscriere';
import { messagesCopy } from '@/content/mesaje';
import { offersCopy } from '@/content/oferte';
import { completeness, tabsFor } from '@/lib/company-profile';
import { publishActions } from '@/lib/navigation';
import { orderStatusLabel } from '@/lib/orders';
import {
  ACTIVE_ORDERS,
  CARRIER_DASHBOARD,
  CONVERSATION_ID,
  COUNTERPARTY_NAME,
  DOCUMENT_HISTORY,
  DOCUMENT_KINDS,
  DOCUMENT_LABELS,
  DOCUMENT_REQUIREMENTS,
  DOCUMENT_VEHICLES,
  ELIGIBLE_VEHICLES,
  EVIDENCE,
  EVIDENCE_URLS,
  LONG_FROM,
  LONG_TO,
  MESSAGES,
  MESSAGE_URLS,
  MY_REQUESTS,
  OFFERS,
  OFFERS_LISTING_ID,
  OFFER_QUOTA,
  OFFER_SETTINGS,
  OFFER_THREADS,
  ORDER_EVENTS,
  ORDER_STATUS,
  ORDER_TITLE,
  PENDING_COMPANIES,
  PENDING_DOCUMENTS,
  PENDING_OFFERS,
  PENDING_RATINGS,
  PROBA_COMPANY,
  PROBA_CONTEXT,
  PROBA_NOW,
  REQUEST_PHOTOS,
  REQUEST_PHOTO_URLS,
} from '@/components/proba/fixtures';
import { ProbaAccountShell, ProbaAdminShell } from '@/components/proba/shells';

/**
 * The account and staff screens, rendered from samples inside a copy of
 * their shell.
 *
 * What sits inside each shell is the page's own markup around the
 * component — its heading, its wrapper, its gaps — copied from the page
 * file named above each function. The components themselves are the real
 * ones, unchanged.
 */

const ORDER_ID = '00000000-0000-4000-8000-000000000950';
const LINKED_CONVERSATION_ID = '00000000-0000-4000-8000-000000000502';

/** `src/app/cont/cereri/page.tsx` */
export function CereriMeleSection() {
  const c = requestsCopy.mine;
  return (
    <ProbaAccountShell pathname={ROUTES.accountRequests}>
      <div className="flex flex-col gap-8">
        <TopBar title={c.title} actions={[{ href: ROUTES.newRequest, label: c.publish }]} />
        <ul className="flex flex-col gap-4">
          {MY_REQUESTS.map((request, index) => (
            <MyRequestCard
              key={request.id}
              request={request}
              today={PROBA_NOW.slice(0, 10)}
              carrierCount={index === 0 ? 1248 : null}
              offerCount={index === 0 ? 12 : 0}
            />
          ))}
        </ul>
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/cont/cereri/[id]/page.tsx`, the offers half of it. */
export function OferteSection() {
  return (
    <ProbaAccountShell pathname={myRequestRoute(OFFERS_LISTING_ID)}>
      <div className="flex flex-col gap-6">
        <TopBar
          title={`${LONG_FROM} — ${LONG_TO}`}
          crumbs={[{ href: ROUTES.accountRequests, label: requestsCopy.mine.title }]}
          actions={[]}
        />
        <section aria-labelledby="oferte" className="flex flex-col gap-4">
          <h2 id="oferte" className="text-h3">
            {offersCopy.received.title}
          </h2>
          <ReceivedOffers
            listingId={OFFERS_LISTING_ID}
            offers={OFFERS}
            threads={OFFER_THREADS}
            now={PROBA_NOW}
          />
        </section>
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/cont/mesaje/[id]/page.tsx` */
export function MesajeSection() {
  const c = messagesCopy.thread;
  return (
    <ProbaAccountShell pathname={`${ROUTES.accountMessages}/${CONVERSATION_ID}`}>
      <div className="flex min-h-[70vh] flex-col gap-4">
        <div>
          <p className="text-body">
            <Link href={ROUTES.accountMessages} className="text-muted underline-offset-4 hover:underline">
              ← {c.back}
            </Link>
          </p>
          <ConversationTitle name={COUNTERPARTY_NAME} kind="oferta" />
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
            <span className="text-muted">
              {LONG_FROM} → {LONG_TO}
            </span>
            <Link href={ROUTES.accountOffers} className="link-accent">
              {c.context.oferta}
            </Link>
            <Link
              href={`${ROUTES.accountMessages}/${LINKED_CONVERSATION_ID}`}
              className="text-muted underline underline-offset-4"
            >
              {c.linked}
            </Link>
            <MessageActions
              conversationId={CONVERSATION_ID}
              messages={MESSAGES.filter((m) => !m.mine).map((m) => ({ id: m.id, at: m.created_at }))}
              counterpartyUserId="00000000-0000-4000-8000-000000000011"
              blockId={null}
            />
          </div>
        </div>

        <div className="flex-1">
          <ThreadView conversationId={CONVERSATION_ID} messages={MESSAGES} urls={MESSAGE_URLS} />
        </div>

        <Composer conversationId={CONVERSATION_ID} />
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/cont/firma/documente/page.tsx`, with the history opened. */
export function ActeSection() {
  const c = inscriereCopy.documents;
  const missing = DOCUMENT_REQUIREMENTS.filter(
    (row) => row.isBlocking && !['ok', 'in_review'].includes(row.state),
  );
  return (
    <ProbaAccountShell pathname={ROUTES.accountDocuments}>
      <div className="flex max-w-[48rem] flex-col gap-6">
        <div>
          <EyebrowPill>{c.eyebrow}</EyebrowPill>
          <h1 className="mt-2 text-h2">{c.titleCompany}</h1>
          <p className="mt-2 max-w-[56ch] text-body text-muted">{c.lede}</p>
        </div>

        <DocumentsScreen
          companyId={PROBA_COMPANY.id}
          requirements={DOCUMENT_REQUIREMENTS}
          vehicles={DOCUMENT_VEHICLES}
          focusVehicleId={null}
          kinds={DOCUMENT_KINDS}
        />

        <p className="text-small text-muted">{c.stillMissing(missing.map((row) => row.label).join(', '))}</p>

        <details open className="rounded-card border border-border bg-surface p-5">
          <summary className="cursor-pointer text-body font-medium">{c.history}</summary>
          <div className="mt-4">
            <DocumentHistory rows={DOCUMENT_HISTORY} labels={DOCUMENT_LABELS} />
          </div>
        </details>
      </div>
    </ProbaAccountShell>
  );
}

/**
 * `src/app/cont/transporturi/[id]/page.tsx`: the timeline and the
 * photographs. The action column beside them is the page's own markup
 * around `order-actions.tsx` and is not drawn; the grid keeps its track,
 * so the left column is as wide as on the real page.
 */
export function ComandaSection() {
  const pickupPhotos = EVIDENCE.filter((row) => row.kind === 'pickup_photo');
  return (
    <ProbaAccountShell pathname={transportRoute(ORDER_ID)}>
      <div className="flex flex-col gap-6">
        <TopBar
          title={ORDER_TITLE}
          crumbs={[{ href: ROUTES.accountTransports, label: ordersCopy.list.title }]}
          actions={[]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="neutral">{orderStatusLabel(ORDER_STATUS)}</StatusBadge>
          <StatusBadge tone="warning">{ordersCopy.list.flagged}</StatusBadge>
        </div>

        <div className={ORDER_GRID}>
          <div className="contents lg:flex lg:flex-col lg:gap-6">
            <div className="order-1 lg:order-none">
              <OrderTimeline status={ORDER_STATUS} events={ORDER_EVENTS} />
            </div>

            <div className="order-4 flex flex-col gap-6 lg:order-none">
              <ComparisonView
                title={ordersCopy.evidence.compareTitle}
                leftLabel={ordersCopy.evidence.fromClient}
                rightLabel={ordersCopy.evidence.kinds.pickup_photo ?? ''}
                left={REQUEST_PHOTOS}
                right={pickupPhotos}
                urls={EVIDENCE_URLS}
                publicUrls={REQUEST_PHOTO_URLS}
              />
              <EvidenceGallery rows={EVIDENCE} urls={EVIDENCE_URLS} />
            </div>
          </div>
        </div>
      </div>
    </ProbaAccountShell>
  );
}

/**
 * `src/app/cont/firma/page.tsx` on the coverage tab, with a county scope:
 * forty-two checkboxes and then the save bar that sticks to the bottom of
 * a phone. What this section is for is whether that bar stops above the
 * fixed bottom menu or slides under it.
 */
export function ContMobilSection() {
  const company = PROBA_COMPANY;
  const progress = completeness({
    companyType: company.company_type,
    contactPhone: company.contact_phone,
    contactEmail: company.contact_email,
    city: company.city,
    county: company.county,
    coverageScope: company.coverage_scope,
    coverageCounties: company.coverage_counties,
    coverageCountries: company.coverage_countries,
    vehicleTypesAccepted: company.vehicle_types_accepted,
    equipment: company.equipment,
    services: company.services,
    publicDescription: company.public_description,
    logoPath: company.logo_path,
    publicProfileEnabled: company.public_profile_enabled,
    vehiclesTotal: 7,
  });

  return (
    <ProbaAccountShell pathname={ROUTES.accountCompany}>
      <div className="flex flex-col gap-6">
        <div>
          <EyebrowPill>
            {accountCopy.company.status}: {VERIFICATION_LABELS[company.verification_status]}
          </EyebrowPill>
          <h1 className="mt-2 text-h2">{firmaCopy.title}</h1>
          <p className="mt-2 max-w-[62ch] text-body text-muted">{firmaCopy.lede}</p>
        </div>

        <CompletenessCard completeness={progress} />

        <ProfileTabs tabs={tabsFor(company.company_type)} active="acoperire" />

        <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
          <CoverageTab company={company} />
        </section>
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/cont/(acasa)/page.tsx` for a verified carrier with everything pending at once. */
export function DashboardSection() {
  const firstName = PROBA_CONTEXT.profile?.full_name?.split(' ')[0] ?? null;
  return (
    <ProbaAccountShell pathname={ROUTES.account}>
      <div className="flex flex-col gap-8">
        <TopBar
          title={appCopy.home.greeting(firstName)}
          actions={publishActions(navContextOf(PROBA_CONTEXT))}
        />
        <OrdersWidget orders={ACTIVE_ORDERS} side="carrier" />
        <RatingsWidget pending={PENDING_RATINGS} />
        <CarrierHome
          company={PROBA_COMPANY}
          context={PROBA_CONTEXT}
          data={CARRIER_DASHBOARD}
          contactsLimit={5000}
          offering={{
            vehicles: ELIGIBLE_VEHICLES,
            settings: OFFER_SETTINGS,
            quota: OFFER_QUOTA,
            pending: PENDING_OFFERS,
            own: [],
          }}
        />
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/admin/documente/page.tsx` */
export function AdminActeSection() {
  const c = adminReviewCopy;
  return (
    <ProbaAdminShell>
      <div className="flex flex-col gap-8">
        <div>
          <EyebrowPill>Staff</EyebrowPill>
          <h1 className="mt-2 text-h2">{c.title}</h1>
          <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
        </div>

        <ReviewQueue documents={PENDING_DOCUMENTS} companies={PENDING_COMPANIES} />
      </div>
    </ProbaAdminShell>
  );
}
