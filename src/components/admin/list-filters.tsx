import type { ReactNode } from 'react';
import { FilterCheck, FilterField, FilterPanel } from '@/components/ui/filter-panel';
import { ordersCopy } from '@/content/comenzi';
import { ratingsCopy } from '@/content/evaluari';
import { filtersCopy } from '@/content/filtre';
import { auditCopy } from '@/content/jurnal';
import { messagesCopy } from '@/content/mesaje';
import { offersCopy } from '@/content/oferte';
import {
  checkChipDef,
  chipsFromParams,
  periodChipDefs,
  type ParamChipDef,
} from '@/lib/filter-disclosure';

/**
 * The staff lists' filters: the shared search panel, five times.
 *
 * Each list keeps at most three filters on screen — the ones the team
 * opens it for — and puts the rest under „Mai multe filtre", closed,
 * with a removable chip for each one that is set. They used to be four
 * to six fields in a row with nothing hidden; now they read the same way
 * as the boards and the directory.
 *
 * The page validates the address and passes what it applied as `params`,
 * by URL key: the fields show it and the chips are drawn from it, so a
 * malformed date the page ignored draws no chip claiming otherwise.
 * `action` and `resetHref` are props so the browser tests' harness can
 * render these, unchanged, against its own address.
 */

const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

export interface FilterOption {
  value: string;
  label: string;
}

interface ListFiltersProps {
  /** Where the form submits and where chips point: the list itself. */
  action: string;
  /** The list with nothing narrowing it — the view kept. */
  resetHref: string;
  /**
   * What the page applied, by URL key, without the page number — plus
   * any view key a chip must keep (`fel` on the listings).
   */
  params: Readonly<Record<string, string>>;
  /** Anything narrowed, a page past the first included. */
  canReset: boolean;
  /** View keys the form must carry through. */
  hidden?: ReactNode;
  /** After the buttons: a total, an export. */
  children?: ReactNode;
}

function ListFilters({
  title,
  screen,
  applyLabel,
  defs,
  simple,
  simpleClassName,
  advanced,
  action,
  resetHref,
  params,
  canReset,
  hidden,
  children,
}: ListFiltersProps & {
  title: string;
  screen: string;
  applyLabel: string;
  defs: readonly ParamChipDef[];
  simple: ReactNode;
  simpleClassName?: string;
  advanced: ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-4 text-body font-medium">{title}</h2>
      <FilterPanel
        action={action}
        screen={screen}
        hidden={hidden}
        simpleClassName={simpleClassName}
        chips={chipsFromParams(action, params, defs)}
        canReset={canReset}
        resetHref={resetHref}
        labels={{
          more: filtersCopy.more,
          active: filtersCopy.active,
          apply: applyLabel,
          clear: filtersCopy.clear,
        }}
        simple={simple}
        advanced={advanced}
      >
        {children}
      </FilterPanel>
    </div>
  );
}

function Select({
  id,
  name,
  label,
  any,
  options,
  params,
}: {
  id: string;
  name: string;
  label: string;
  any: string;
  options: readonly FilterOption[];
  params: Readonly<Record<string, string>>;
}) {
  return (
    <FilterField id={id} label={label}>
      <select id={id} name={name} defaultValue={params[name] ?? ''} className={CONTROL}>
        <option value="">{any}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FilterField>
  );
}

/** „De la" and „Până la", side by side inside the panel. */
function Period({
  prefix,
  from,
  to,
  params,
}: {
  prefix: string;
  from: string;
  to: string;
  params: Readonly<Record<string, string>>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FilterField id={`${prefix}-from`} label={from}>
        <input
          id={`${prefix}-from`}
          name="de-la"
          type="date"
          defaultValue={params['de-la'] ?? ''}
          className={CONTROL}
        />
      </FilterField>
      <FilterField id={`${prefix}-to`} label={to}>
        <input
          id={`${prefix}-to`}
          name="pana-la"
          type="date"
          defaultValue={params['pana-la'] ?? ''}
          className={CONTROL}
        />
      </FilterField>
    </div>
  );
}

/** /admin/oferte: state and sender on screen; the period waits. */
export function AdminOfferFilters({
  statuses,
  companies,
  ...props
}: ListFiltersProps & { statuses: readonly FilterOption[]; companies: readonly FilterOption[] }) {
  const c = offersCopy.admin.filters;
  return (
    <ListFilters
      {...props}
      title={c.title}
      screen="admin-oferte"
      applyLabel={c.apply}
      defs={periodChipDefs(c.from, c.to)}
      simpleClassName="grid gap-3 sm:grid-cols-2"
      simple={
        <>
          <Select id="ao-status" name="stare" label={c.status} any={c.any} options={statuses} params={props.params} />
          <Select id="ao-company" name="firma" label={c.company} any={c.any} options={companies} params={props.params} />
        </>
      }
      advanced={<Period prefix="ao" from={c.from} to={c.to} params={props.params} />}
    />
  );
}

/** /admin/transporturi: state, carrier and „doar disputele"; the period waits. */
export function AdminOrderFilters({
  statuses,
  companies,
  ...props
}: ListFiltersProps & { statuses: readonly FilterOption[]; companies: readonly FilterOption[] }) {
  const c = ordersCopy.admin.filters;
  return (
    <ListFilters
      {...props}
      title={c.title}
      screen="admin-transporturi"
      applyLabel={c.apply}
      defs={periodChipDefs(c.from, c.to)}
      simple={
        <>
          <Select id="at-status" name="stare" label={c.status} any={c.any} options={statuses} params={props.params} />
          <Select id="at-company" name="firma" label={c.company} any={c.any} options={companies} params={props.params} />
          <FilterCheck
            id="at-disputed"
            name="dispute"
            label={c.disputed}
            defaultChecked={props.params.dispute === 'da'}
          />
        </>
      }
      advanced={<Period prefix="at" from={c.from} to={c.to} params={props.params} />}
    />
  );
}

/**
 * /admin/anunturi: state, firm and „doar sesizate" — what moderation
 * opens it for. The period and „doar ascunse" wait. The „cereri /
 * trasee" switch above is the view, not a filter: it rides in `hidden`
 * and in `params`, so every chip keeps it.
 */
export function AdminListingFilters({
  statuses,
  companies,
  ...props
}: ListFiltersProps & { statuses: readonly FilterOption[]; companies: readonly FilterOption[] }) {
  const c = messagesCopy.admin.listings.filters;
  return (
    <ListFilters
      {...props}
      title={c.title}
      screen="admin-anunturi"
      applyLabel={c.apply}
      defs={[...periodChipDefs(c.from, c.to), checkChipDef('ascunse', c.hidden)]}
      simple={
        <>
          <Select id="al-status" name="stare" label={c.status} any={c.any} options={statuses} params={props.params} />
          <Select id="al-company" name="firma" label={c.company} any={c.any} options={companies} params={props.params} />
          <FilterCheck
            id="al-reported"
            name="sesizate"
            label={c.reported}
            defaultChecked={props.params.sesizate === 'da'}
          />
        </>
      }
      advanced={
        <>
          <Period prefix="al" from={c.from} to={c.to} params={props.params} />
          <FilterCheck
            id="al-hidden"
            name="ascunse"
            label={c.hidden}
            defaultChecked={props.params.ascunse === 'da'}
          />
        </>
      }
    />
  );
}

/**
 * /admin/evaluari: score, firm and „doar după dispute" on screen;
 * „doar ascunse" — reviewing what was already moderated — waits.
 */
export function AdminRatingFilters({
  companies,
  ...props
}: ListFiltersProps & { companies: readonly FilterOption[] }) {
  const c = ratingsCopy.admin.filters;
  const scores = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: String(n) }));
  return (
    <ListFilters
      {...props}
      title={c.title}
      screen="admin-evaluari"
      applyLabel={c.apply}
      defs={[checkChipDef('ascunse', c.hidden)]}
      simple={
        <>
          <Select id="ar-score" name="nota" label={c.score} any={c.any} options={scores} params={props.params} />
          {/* The same list the orders screen filters by: a firm with
              orders is a firm that can have ratings. */}
          <Select id="ar-company" name="firma" label={c.company} any={c.any} options={companies} params={props.params} />
          <FilterCheck
            id="ar-dispute"
            name="dispute"
            label={c.afterDispute}
            defaultChecked={props.params.dispute === 'da'}
          />
        </>
      }
      advanced={
        <FilterCheck
          id="ar-hidden"
          name="ascunse"
          label={c.hidden}
          defaultChecked={props.params.ascunse === 'da'}
        />
      }
    />
  );
}

/** /admin/jurnal: what, on what, by whom — the three an entry answers. The period waits. */
export function AdminAuditFilters({
  actions,
  entities,
  ...props
}: ListFiltersProps & { actions: readonly FilterOption[]; entities: readonly FilterOption[] }) {
  const c = auditCopy.filters;
  return (
    <ListFilters
      {...props}
      title={c.title}
      screen="admin-jurnal"
      applyLabel={c.apply}
      defs={periodChipDefs(c.from, c.to)}
      simple={
        <>
          <Select id="ja-action" name="actiune" label={c.action} any={c.any} options={actions} params={props.params} />
          <Select id="ja-entity" name="entitate" label={c.entity} any={c.any} options={entities} params={props.params} />
          <FilterField id="ja-actor" label={c.actor} hint={c.actorHint}>
            <input
              id="ja-actor"
              name="autor"
              defaultValue={props.params.autor ?? ''}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={`${CONTROL} font-mono text-small`}
            />
          </FilterField>
        </>
      }
      advanced={<Period prefix="ja" from={c.from} to={c.to} params={props.params} />}
    />
  );
}
