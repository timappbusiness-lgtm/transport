import {
  AdminAuditFilters,
  AdminListingFilters,
  AdminOfferFilters,
  AdminOrderFilters,
  AdminRatingFilters,
  type FilterOption,
} from '@/components/admin/list-filters';
import { HYPHEN_COMPANY, LONG_COMPANY } from '@/components/proba/fixtures';
import { ProbaAdminShell } from '@/components/proba/shells';
import { OFFER_STATUS_LABELS, OFFER_STATUS_ORDER } from '@/lib/offers';
import { ORDER_STEPS, orderStatusLabel, type OrderStatus } from '@/lib/orders';

/**
 * The five staff lists' search panels, against the harness's own address.
 *
 * The lists need a session and a database; their panels need neither.
 * Each section draws the list's real panel with `action` pointing back
 * here and `sectiune` carried along, so a chip removed or a search made
 * lands on this section again with the new address — the whole round
 * trip the list makes, minus the rows.
 *
 * Only the keys the list reads are taken from the address, and dates
 * only when they are dates: the same filtering the pages do before they
 * draw a chip.
 */

export const ADMIN_FILTER_LISTS = {
  'admin-oferte': ['stare', 'firma', 'de-la', 'pana-la'],
  'admin-transporturi': ['stare', 'firma', 'dispute', 'de-la', 'pana-la'],
  'admin-anunturi': ['fel', 'stare', 'firma', 'sesizate', 'de-la', 'pana-la', 'ascunse'],
  'admin-evaluari': ['nota', 'firma', 'dispute', 'ascunse'],
  'admin-jurnal': ['actiune', 'entitate', 'autor', 'de-la', 'pana-la'],
} as const;

export type AdminFilterList = keyof typeof ADMIN_FILTER_LISTS;

type Params = Record<string, string | string[] | undefined>;

const HARNESS = '/proba/ecrane';

const COMPANIES: FilterOption[] = [
  { value: '00000000-0000-4000-8000-000000000901', label: `${LONG_COMPANY} (48)` },
  { value: '00000000-0000-4000-8000-000000000902', label: `${HYPHEN_COMPANY} (7)` },
  { value: '00000000-0000-4000-8000-000000000903', label: 'Transauto Ardeal SRL (1)' },
];

const FACETS = (values: readonly string[]): FilterOption[] =>
  values.map((value, index) => ({ value, label: `${value} (${(index + 1) * 13})` }));

function applied(list: AdminFilterList, params: Params): Record<string, string> {
  const out: Record<string, string> = { sectiune: list };
  for (const key of ADMIN_FILTER_LISTS[list]) {
    const raw = params[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!value) continue;
    if ((key === 'de-la' || key === 'pana-la') && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    if (key === 'fel' && value !== 'trasee') continue;
    out[key] = value;
  }
  return out;
}

export function AdminFiltersSection({ list, params }: { list: AdminFilterList; params: Params }) {
  const values = applied(list, params);
  const view = values.fel === 'trasee' ? '&fel=trasee' : '';
  const common = {
    action: HARNESS,
    resetHref: `${HARNESS}?sectiune=${list}${view}`,
    params: values,
    canReset: Object.keys(values).some((key) => key !== 'sectiune' && key !== 'fel'),
    hidden: (
      <>
        <input type="hidden" name="sectiune" value={list} />
        {values.fel ? <input type="hidden" name="fel" value={values.fel} /> : null}
      </>
    ),
  };

  return (
    <ProbaAdminShell>
      <div className="flex flex-col gap-6" data-proba-lista={list}>
        {list === 'admin-oferte' ? (
          <AdminOfferFilters
            {...common}
            statuses={OFFER_STATUS_ORDER.map((value) => ({ value, label: OFFER_STATUS_LABELS[value] }))}
            companies={COMPANIES}
          />
        ) : null}
        {list === 'admin-transporturi' ? (
          <AdminOrderFilters
            {...common}
            statuses={[...ORDER_STEPS, 'disputed', 'cancelled'].map((value) => ({
              value,
              label: orderStatusLabel(value as OrderStatus),
            }))}
            companies={COMPANIES}
          />
        ) : null}
        {list === 'admin-anunturi' ? (
          <AdminListingFilters
            {...common}
            statuses={['active', 'assigned', 'completed', 'cancelled', 'expired', 'suspended'].map(
              (value) => ({ value, label: value }),
            )}
            companies={COMPANIES}
          >
            <span className="text-small text-muted">1.284 rezultate</span>
          </AdminListingFilters>
        ) : null}
        {list === 'admin-evaluari' ? (
          <AdminRatingFilters {...common} companies={COMPANIES}>
            <span className="text-small text-muted">312 evaluări</span>
          </AdminRatingFilters>
        ) : null}
        {list === 'admin-jurnal' ? (
          <AdminAuditFilters
            {...common}
            actions={FACETS(['offer.accept', 'order.dispute.resolve', 'listing.hide'])}
            entities={FACETS(['offers', 'orders', 'listings'])}
          />
        ) : null}
      </div>
    </ProbaAdminShell>
  );
}
