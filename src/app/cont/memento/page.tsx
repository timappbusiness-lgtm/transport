import type { Metadata } from 'next';
import Link from 'next/link';
import { ConversionLine } from '@/components/memento/conversion-line';
import { FleetControls, MementoList } from '@/components/memento/memento-list';
import { RenewForm } from '@/components/memento/renew-form';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { requireAccountContext } from '@/lib/auth/account';
import {
  bucharestToday,
  conversionLine,
  displayPlate,
  formatDay,
  mementoLabel,
  readFleetFilter,
  readFleetSort,
} from '@/lib/memento';
import {
  canManageFleet,
  loadFirmMembers,
  loadMementoEntries,
  loadMementoVehicles,
  loadResponsibleVehicles,
  mementoScope,
} from '@/lib/memento-source';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/uploads/paths';
import { cn } from '@/lib/utils';

const c = mementoCopy.account;

export const metadata: Metadata = { title: c.title };

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

/** The session, the scope, the rows and today — read outside the component. */
async function load(params: Params) {
  const context = await requireAccountContext(ROUTES.accountMemento);
  const scope = mementoScope(context, one(params, 'vedere'));
  const supabase = await createClient();
  const renewIds = (one(params, 'reinnoieste') ?? '').split(',').filter(isUuid).slice(0, 20);
  const [vehicles, responsible, members, renewing] = await Promise.all([
    loadMementoVehicles(supabase, scope, context.user.id),
    scope.kind === 'personal' ? loadResponsibleVehicles(supabase, context.user.id) : Promise.resolve([]),
    scope.kind === 'firma' ? loadFirmMembers(supabase, scope.companyId) : Promise.resolve([]),
    loadMementoEntries(supabase, renewIds),
  ]);
  return { context, scope, vehicles, responsible, members, renewing, today: bucharestToday(new Date()) };
}

/**
 * Memento expirări auto, in the account: a person's cars, or a firm's
 * fleet with its filters, and „Am reînnoit" beside every date.
 *
 * A reminder's link lands here with `?reinnoieste=<ids>`: those dates are
 * at the top, their forms open, so renewing takes the one tap the e-mail
 * promised.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { context, scope, vehicles, responsible, members, renewing, today } = await load(params);
  const filter = readFleetFilter(one(params, 'filtru'));
  const sort = readFleetSort(one(params, 'ordine'));
  const isFirm = scope.kind === 'firma';
  const view = one(params, 'vedere');
  const names = new Map(members.map((member) => [member.userId, member.name]));
  const scopeQuery = isFirm ? '' : '?vedere=personal';
  const line = conversionLine(
    scope.kind,
    vehicles.map((vehicle) => vehicle.vehicleKind),
    isFirm && scope.isCarrier,
  );

  return (
    <div className="flex flex-col gap-6" data-memento-account={scope.kind}>
      <div className="min-w-0">
        <EyebrowPill tone="quiet">{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[58ch] text-body text-muted">{isFirm ? c.ledeFirm : c.ledePersonal}</p>
      </div>

      {canManageFleet(context) ? (
        <nav aria-label="Ce vezi" className="flex flex-wrap gap-2" data-memento-scope>
          {[
            { href: ROUTES.accountMemento, label: `${c.viewFirm} · ${scope.kind === 'firma' ? scope.companyName : (context.activeCompany?.display_name ?? context.activeCompany?.legal_name ?? '')}`, active: isFirm },
            { href: `${ROUTES.accountMemento}?vedere=personal`, label: c.viewPersonal, active: !isFirm },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'rounded-pill border px-3 py-1.5 text-small',
                tab.active ? 'border-foreground bg-foreground text-white' : 'border-border-strong hover:bg-ground-alt',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <p className="max-w-[64ch] rounded-input border border-border bg-ground-alt px-3.5 py-2.5 text-small text-muted" data-memento-declared>
        {c.declared}
        {isFirm && scope.isCarrier ? ` ${c.declaredCarrier}` : ''}
      </p>

      {renewing.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-card border border-border-strong bg-surface p-4 sm:p-5" data-memento-renew-panel>
          <p className="text-body">{mementoCopy.renew.fromReminder}</p>
          <ul className="flex flex-col gap-3">
            {renewing.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2">
                <p className="text-body">
                  <span className="font-mono font-medium">{displayPlate(entry.plate)}</span> ·{' '}
                  {mementoLabel(entry.kind, entry.customName)}
                  {entry.validUntil ? <span className="text-muted"> · {formatDay(entry.validUntil)}</span> : null}
                </p>
                <RenewForm entryId={entry.id} label={mementoLabel(entry.kind, entry.customName)} kind={entry.kind} open />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`${ROUTES.accountMementoAdd}${scopeQuery}`} className={buttonClasses('ink', 'md')} data-memento-add>
          {c.add}
        </Link>
        <Link href={`${ROUTES.accountMementoImport}${scopeQuery}`} className={buttonClasses('secondary', 'md')}>
          {c.import}
        </Link>
        <Link href={`${ROUTES.accountMementoSettings}${scopeQuery}`} className="text-body underline underline-offset-4">
          {c.settings}
        </Link>
      </div>

      {vehicles.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-small text-muted">{c.count(vehicles.length)}</p>
          {isFirm || vehicles.length > 3 ? (
            <FleetControls basePath={ROUTES.accountMemento} view={view} filter={filter} sort={sort} />
          ) : null}
        </div>
      ) : null}

      {vehicles.length === 0 && renewing.length === 0 ? (
        <section className="rounded-card border border-border bg-surface px-5 py-6" data-memento-empty>
          <p className="text-body font-medium">{c.empty}</p>
          <p className="mt-1 text-body text-muted">{c.emptyBody}</p>
        </section>
      ) : (
        <MementoList vehicles={vehicles} today={today} filter={filter} sort={sort} responsibleNames={names} />
      )}

      {responsible.length > 0 ? (
        <section className="flex flex-col gap-3" data-memento-responsible-list>
          <h2 className="text-h3">{c.responsibleSection}</h2>
          <MementoList vehicles={responsible} today={today} filter="toate" sort="urgenta" />
        </section>
      ) : null}

      <ConversionLine kind={line} />
    </div>
  );
}
