import { ConversionLine } from '@/components/memento/conversion-line';
import { FleetControls } from '@/components/memento/memento-list';
import {
  ProbaMementoEntryEditor,
  ProbaMementoImport,
  ProbaMementoList,
  ProbaMementoVehicleForm,
} from '@/components/proba/memento-stubs';
import { ProbaAccountShell } from '@/components/proba/shells';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { addDays, bucharestToday, MEMENTO_KINDS, readFleetFilter, readFleetSort, type MementoKind } from '@/lib/memento';
import type { MementoEntry, MementoVehicle } from '@/lib/memento-source';

/**
 * The memento's screens for the layout sweeps and the browser tests, with
 * sample vehicles whose dates are counted from today — so „expiră în 30 de
 * zile" always has something to keep and something to leave out. Every
 * plate here is invented.
 */

const c = mementoCopy.account;

/** Today, read once per request, outside any component's render. */
function probaToday(): string {
  return bucharestToday(new Date());
}

function entry(vehicleId: string, kind: MementoKind, today: string, days: number | null, extra: Partial<MementoEntry> = {}): MementoEntry {
  return {
    // One per vehicle and kind, the same on every request.
    id: `ac000000-00${String(MEMENTO_KINDS.indexOf(kind)).padStart(2, '0')}-4000-8000-${vehicleId.slice(-12)}`,
    vehicleId,
    kind,
    customName: null,
    validUntil: days === null ? null : addDays(today, days),
    dueKm: null,
    reference: null,
    note: null,
    photoPath: null,
    dateSetOn: addDays(today, -200),
    ...extra,
  };
}

function vehicle(id: string, plate: string, make: string | null, model: string | null, entries: MementoEntry[], extra: Partial<MementoVehicle> = {}): MementoVehicle {
  return {
    id,
    ownerUserId: null,
    ownerCompanyId: 'fc000000-0000-4000-8000-000000000001',
    plate,
    make,
    model,
    vehicleKind: null,
    responsibleUserId: null,
    entries,
    ...extra,
  };
}

export function personalFixtures(today: string): MementoVehicle[] {
  const a = 'ab000000-0000-4000-8000-000000000001';
  const b = 'ab000000-0000-4000-8000-000000000002';
  return [
    vehicle(a, 'B123ABC', 'Dacia', 'Logan', [
      entry(a, 'rca', today, 5),
      entry(a, 'itp', today, 120),
      entry(a, 'rovinieta', today, -3),
      entry(a, 'casco', today, 29),
    ], { ownerUserId: 'f0000000-0000-4000-8000-000000000006', ownerCompanyId: null }),
    vehicle(b, 'CJ45XYZ', null, null, [], { ownerUserId: 'f0000000-0000-4000-8000-000000000006', ownerCompanyId: null }),
  ];
}

export function fleetFixtures(today: string): MementoVehicle[] {
  const ids = Array.from({ length: 5 }, (_, i) => `ab000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`);
  return [
    vehicle(ids[0]!, 'TM10AAA', 'Ford', 'Transit', [entry(ids[0]!, 'rca', today, 200), entry(ids[0]!, 'itp', today, 400)], { vehicleKind: 'duba' }),
    vehicle(ids[1]!, 'B20BBB', 'Mercedes-Benz', 'Sprinter 519 CDI transportor dublu etaj', [
      entry(ids[1]!, 'rca', today, 12),
      entry(ids[1]!, 'itp', today, 60),
      entry(ids[1]!, 'altceva', today, 90, { customName: 'Autorizație transport agabaritic' }),
    ], { vehicleKind: 'transportor', responsibleUserId: 'f0000000-0000-4000-8000-00000000000e' }),
    vehicle(ids[2]!, 'CJ30CCC', 'Iveco', 'Daily', [entry(ids[2]!, 'itp', today, -10)]),
    vehicle(ids[3]!, 'AR40DDD', 'Renault', 'Master', [entry(ids[3]!, 'revizie', today, null, { dueKm: 150000 })]),
    vehicle(ids[4]!, 'IS50EEE', 'Volkswagen', 'Crafter', [entry(ids[4]!, 'rovinieta', today, 30), entry(ids[4]!, 'extinctor', today, 31)]),
  ];
}

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function Header({ title, lede }: { title: string; lede: string }) {
  return (
    <div>
      <EyebrowPill tone="quiet">{c.eyebrow}</EyebrowPill>
      <h1 className="mt-2 text-h2">{title}</h1>
      <p className="mt-2 max-w-[58ch] text-body text-muted">{lede}</p>
    </div>
  );
}

/** `src/app/cont/memento/page.tsx`, a person's own cars. */
export function MementoPersonalSection() {
  const today = probaToday();
  return (
    <ProbaAccountShell pathname={ROUTES.accountMemento}>
      <div className="flex flex-col gap-6" data-memento-account="personal">
        <Header title={c.title} lede={c.ledePersonal} />
        <p className="rounded-input border border-border bg-ground-alt px-3.5 py-2.5 text-small text-muted" data-memento-declared>
          {c.declared}
        </p>
        <ProbaMementoList vehicles={personalFixtures(today)} today={today} filter="toate" sort="urgenta" names={[]} />
        <ConversionLine kind="cerere" />
      </div>
    </ProbaAccountShell>
  );
}

/** The same page for a firm: the fleet, its filters and the responsible person. */
export function MementoFleetSection({ params }: { params: Params }) {
  const today = probaToday();
  const filter = readFleetFilter(one(params, 'filtru'));
  const sort = readFleetSort(one(params, 'ordine'));
  return (
    <ProbaAccountShell pathname={ROUTES.accountMemento}>
      <div className="flex flex-col gap-6" data-memento-account="firma">
        <Header title={c.title} lede={c.ledeFirm} />
        <p className="rounded-input border border-border bg-ground-alt px-3.5 py-2.5 text-small text-muted" data-memento-declared>
          {c.declared} {c.declaredCarrier}
        </p>
        <FleetControls basePath="/proba/ecrane" view={undefined} filter={filter} sort={sort} keep={{ sectiune: 'memento-flota' }} />
        <ProbaMementoList
          vehicles={fleetFixtures(today)}
          today={today}
          filter={filter}
          sort={sort}
          names={[['f0000000-0000-4000-8000-00000000000e', 'Ion Popescu-Rădulescu']]}
        />
        <ConversionLine kind="transport" />
      </div>
    </ProbaAccountShell>
  );
}

/** `src/app/cont/memento/adauga/page.tsx`, the form that empties for the next vehicle. */
export function MementoAddSection({ params }: { params: Params }) {
  const scope = one(params, 'vedere') === 'personal' ? 'personal' : 'firma';
  return (
    <ProbaAccountShell pathname={ROUTES.accountMemento}>
      <div className="flex max-w-[48rem] flex-col gap-6">
        <Header title={c.add} lede={scope === 'firma' ? c.viewFirm : c.viewPersonal} />
        <section className="rounded-card border border-border bg-surface p-5">
          <ProbaMementoVehicleForm scope={scope} />
        </section>
      </div>
    </ProbaAccountShell>
  );
}

/** One date with its photo: `?ai=nu` is a platform without the reading configured. */
export function MementoPhotoSection({ params }: { params: Params }) {
  const ai = one(params, 'ai') !== 'nu';
  return (
    <ProbaAccountShell pathname={ROUTES.accountMemento}>
      <div className="flex max-w-[52rem] flex-col gap-6">
        <Header title="B 123 ABC" lede="Dacia Logan" />
        <section className="rounded-card border border-border bg-surface p-5" data-memento-add-entry>
          <h2 className="mb-4 text-body font-medium">{mementoCopy.vehicle.addDocument}</h2>
          <ProbaMementoEntryEditor ai={ai} entry={null} />
        </section>
      </div>
    </ProbaAccountShell>
  );
}

export function MementoImportSection() {
  return (
    <ProbaAccountShell pathname={ROUTES.accountMemento}>
      <div className="flex max-w-[48rem] flex-col gap-6">
        <Header title={mementoCopy.import.title} lede={mementoCopy.import.lede} />
        <section className="rounded-card border border-border bg-surface p-5">
          <ProbaMementoImport />
        </section>
      </div>
    </ProbaAccountShell>
  );
}
