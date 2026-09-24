import { HeaderBrandView } from '@/components/layout/header-brand';
import { HeaderNavView, type HeaderUser } from '@/components/layout/header-menu';
import { HEADER_BAR } from '@/components/layout/header-shell';
import { BoardView } from '@/components/requests/board-view';
import { BoardRequestCard } from '@/components/requests/board-card';
import { ROUTES, requestRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { newRequestsLine } from '@/lib/board-news';
import { gateHref } from '@/lib/carrier-journey';
import {
  headerBar,
  headerMenu,
  publishMenu,
  type NavContext,
  type NavCounts,
} from '@/lib/navigation';
import { BOARD_REQUESTS, PROBA_NOW } from '@/components/proba/fixtures';

/**
 * The signed-in header, for every kind of account, without a session.
 *
 * The header needs a session to know who is looking, and neither CI nor
 * the sandbox has one. What the browser tests check — which entries, in
 * which order, which button, which badge, and that none of it spills out
 * of the bar at any width — is decided by `headerBar`, `headerMenu` and
 * `publishMenu` and drawn by `HeaderNavView`. This draws exactly those,
 * for a context written out here instead of read from the database.
 *
 * `?rol=` picks the account, `?noi=` the count of new requests since the
 * carrier's last visit, `?pagina=` the page the header thinks it is on.
 */

/** Long enough that the name has to give way at every width. */
export const PROBA_LONG_NAME = 'Constantin-Alexandru Popescu-Ionescu';

interface ProbaRole {
  context: NavContext;
  counts: (fresh: number) => NavCounts;
}

export const PROBA_ROLES = {
  transportator: {
    context: { accountType: 'company', companyType: 'transport', role: 'owner', isStaff: false },
    counts: (fresh) => ({ messages: 3, offers: 1, documents: 2, newRequests: fresh }),
  },
  expeditor: {
    context: { accountType: 'company', companyType: 'expeditie', role: 'owner', isStaff: false },
    counts: () => ({ messages: 3, offers: 4 }),
  },
  persoana: {
    context: { accountType: 'individual', companyType: null, role: null, isStaff: false },
    counts: () => ({ messages: 1, offers: 2 }),
  },
  sofer: {
    context: { accountType: 'company', companyType: 'transport', role: 'driver', isStaff: false },
    counts: () => ({ messages: 1, offers: 0 }),
  },
  staff: {
    context: { accountType: 'individual', companyType: null, role: null, isStaff: true },
    counts: () => ({ messages: 0, offers: 0 }),
  },
} satisfies Record<string, ProbaRole>;

export type ProbaRoleName = keyof typeof PROBA_ROLES;

export function probaRole(raw: string | undefined): ProbaRoleName {
  return raw !== undefined && raw in PROBA_ROLES ? (raw as ProbaRoleName) : 'transportator';
}

/** What `SiteHeader` hands the header, for one of the roles above. */
export function probaHeaderUser(role: ProbaRoleName, fresh: number): HeaderUser {
  const { context, counts } = PROBA_ROLES[role];
  const numbers = counts(fresh);
  return {
    name: PROBA_LONG_NAME,
    bar: headerBar(context, numbers),
    items: headerMenu(context, numbers),
    publish: publishMenu(context),
  };
}

export function AntetSection({
  role,
  fresh,
  pathname,
}: {
  role: ProbaRoleName;
  fresh: number;
  pathname: string;
}) {
  return (
    // The site's own header is sticky above this one; this one stays in
    // the flow, so the two never overlap at the top of the page.
    <div data-proba-antet={role} className="relative z-30 px-3 pt-3 sm:px-5 sm:pt-4">
      <header data-surface="dark" className={HEADER_BAR}>
        <HeaderBrandView signedIn pathname={pathname} />
        <HeaderNavView user={probaHeaderUser(role, fresh)} pathname={pathname} />
      </header>
    </div>
  );
}

/** `src/app/cereri/(panou)/page.tsx`'s container. */
const BOARD = 'mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14';

/**
 * The request board as a carrier sees it: their view first, what is new
 * since the last visit, and „Trimite ofertă" on every card — the first
 * one for a verified firm, the second as the gate of a firm whose
 * documents are still missing.
 */
export function CereriTransportatorSection({ fresh, all }: { fresh: number; all: boolean }) {
  const here = `?sectiune=cereri-transportator&noi=${fresh}`;
  const now = new Date(PROBA_NOW);
  const [first, second, ...rest] = BOARD_REQUESTS;
  return (
    <div className={BOARD}>
      <section aria-label={requestsCopy.board.title}>
        <BoardView
          mine={!all}
          mineHref={here}
          allHref={`${here}&doar=toate`}
          news={newRequestsLine(fresh)}
        />
        <ul className="flex flex-col gap-4">
          {first ? (
            <BoardRequestCard
              request={first}
              now={now}
              offerHref={`${requestRoute(first.id)}#oferta`}
            />
          ) : null}
          {second ? (
            <BoardRequestCard
              request={second}
              now={now}
              offerHref={gateHref('documents', 'oferta', requestRoute(second.id)) ?? ROUTES.requests}
            />
          ) : null}
          {rest.map((request) => (
            <BoardRequestCard
              key={request.id}
              request={request}
              now={now}
              offerHref={`${requestRoute(request.id)}#oferta`}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
