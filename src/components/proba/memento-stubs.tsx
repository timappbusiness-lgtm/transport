'use client';

import type { MementoImportResult, MementoPhotoReading, MementoState, MementoVehicleState } from '@/app/cont/memento/actions';
import { MementoCsvImport } from '@/components/memento/csv-import';
import { MementoEntryEditor } from '@/components/memento/entry-editor';
import { MementoList } from '@/components/memento/memento-list';
import { MementoVehicleForm } from '@/components/memento/vehicle-form';
import { mementoCopy } from '@/content/memento';
import { formatDay, isPlate, normalisePlate, type FleetFilter, type FleetSort } from '@/lib/memento';
import type { CsvRow } from '@/lib/memento-csv';
import type { MementoEntry, MementoVehicle } from '@/lib/memento-source';

/**
 * The memento's screens with stand-ins for the server: the actions answer
 * as the database would for a successful call, so the browser tests see
 * the real forms do what they do without a session. Answered by nothing
 * outside `/proba/ecrane`.
 */

/** Where the harness posts a photo; the browser test answers it with `page.route`. */
export const PROBA_MEMENTO_UPLOAD_URL = '/__proba/memento';

async function renewStub(_prev: MementoState, formData: FormData): Promise<MementoState> {
  const date = String(formData.get('valid_until') ?? '');
  if (date === '') return { fieldErrors: { valid_until: mementoCopy.renew.needDate } };
  return { notice: mementoCopy.renew.done('Documentul', formatDay(date)) };
}

export function ProbaMementoList(props: {
  vehicles: MementoVehicle[];
  today: string;
  filter: FleetFilter;
  sort: FleetSort;
  names: [string, string][];
}) {
  return (
    <MementoList
      vehicles={props.vehicles}
      today={props.today}
      filter={props.filter}
      sort={props.sort}
      responsibleNames={new Map(props.names)}
      renewAction={renewStub}
    />
  );
}

async function vehicleStub(_prev: MementoVehicleState, formData: FormData): Promise<MementoVehicleState> {
  const raw = String(formData.get('plate') ?? '');
  if (!isPlate(raw)) return { fieldErrors: { plate: mementoCopy.landing.needPlate } };
  const plate = normalisePlate(raw);
  return { created: { id: String(formData.get('id')), plate }, notice: `${plate} a fost adăugat în memento.` };
}

export function ProbaMementoVehicleForm({ scope }: { scope: 'personal' | 'firma' }) {
  return <MementoVehicleForm scope={scope} action={vehicleStub} />;
}

async function entryStub(_prev: MementoState, formData: FormData): Promise<MementoState> {
  const date = String(formData.get('valid_until') ?? '');
  if (date === '') return { fieldErrors: { valid_until: 'Scrie data până la care este valabil.' } };
  return { notice: `${mementoCopy.vehicle.saved} ${formatDay(date)}` };
}

export function ProbaMementoEntryEditor({ ai, entry }: { ai: boolean; entry: MementoEntry | null }) {
  const readPhoto = async (): Promise<MementoPhotoReading> =>
    ai ? { status: 'read', validUntil: '2027-03-15', reference: 'RO/25/ABC123' } : { status: 'unavailable' };
  return (
    <MementoEntryEditor
      vehicleId="ab000000-0000-4000-8000-000000000001"
      folder="f0000000-0000-4000-8000-000000000001"
      entry={entry}
      takenKinds={entry ? [] : ['rca']}
      action={entryStub}
      readPhoto={readPhoto}
      uploadUrl={PROBA_MEMENTO_UPLOAD_URL}
    />
  );
}

async function importStub(_scope: 'personal' | 'firma', rows: readonly CsvRow[]): Promise<MementoImportResult> {
  return {
    ok: true,
    added: rows.length,
    updated: 0,
    dates: rows.reduce((sum, row) => sum + Object.keys(row.dates).length, 0),
  };
}

export function ProbaMementoImport() {
  return <MementoCsvImport scope="firma" maxRows={300} importRows={importStub} />;
}
