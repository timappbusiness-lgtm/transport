/**
 * What the model said about a document, in the shape the documents
 * screen reads — and the two guesses built on it: which requirement a
 * gallery photo is, and which vehicle it belongs to.
 *
 * Every guess is shown as a guess, pre-selected and changeable: the
 * carrier confirms the type and the date, and a person on our side
 * approves. The model never decides anything.
 *
 * Free of React and of Supabase.
 */

export type DocumentReading =
  | {
      status: 'read';
      /** The type the model recognised, or null when it was not sure. */
      kind: string | null;
      /** YYYY-MM-DD, or null when no date was legible. */
      validUntil: string | null;
      plate: string | null;
      confidence: number | null;
      /** The model thinks this is not the type it was uploaded as. */
      mismatch: boolean;
    }
  | { status: 'unreadable' }
  | { status: 'failed'; message: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readDocumentAnswer(status: number | null, data: unknown): DocumentReading {
  const body = (data && typeof data === 'object' ? data : {}) as {
    ok?: boolean;
    reason?: string;
    kind_mismatch?: boolean;
    extracted?: {
      detected_kind?: unknown;
      valid_until?: unknown;
      plate_number?: unknown;
      confidence?: unknown;
    };
  };
  if (status === 422 || body.reason === 'unreadable') return { status: 'unreadable' };
  if (status !== 200 || body.ok !== true || !body.extracted) return { status: 'failed', message: null };
  const e = body.extracted;
  return {
    status: 'read',
    kind: typeof e.detected_kind === 'string' ? e.detected_kind : null,
    validUntil: typeof e.valid_until === 'string' && DATE.test(e.valid_until) ? e.valid_until : null,
    plate: typeof e.plate_number === 'string' && e.plate_number.trim() !== '' ? e.plate_number : null,
    confidence: typeof e.confidence === 'number' ? e.confidence : null,
    mismatch: body.kind_mismatch === true,
  };
}

/** „B 123 ABC", „b-123-abc" and „B123ABC" are the same plate. */
export function samePlate(a: string, b: string): boolean {
  const clean = (value: string) => value.replace(/[^0-9a-z]/gi, '').toUpperCase();
  return clean(a) !== '' && clean(a) === clean(b);
}

/** The vehicle a photographed document names, when exactly one matches. */
export function vehicleForPlate(
  plate: string | null,
  vehicles: readonly { id: string; plate: string }[],
): string | null {
  if (plate === null) return null;
  const matches = vehicles.filter((vehicle) => samePlate(vehicle.plate, plate));
  return matches.length === 1 ? matches[0]!.id : null;
}

export interface Requirement {
  scope: 'company' | 'vehicle';
  kind: string;
}

/**
 * The requirement a gallery photo should be filed under.
 *
 * The recognised type when it is one this firm is asked for; for a vehicle
 * document, the vehicle whose plate the model read — or the only vehicle,
 * when there is one — and nothing when that is a guess too far. The
 * person sees both pre-selected and changes what is wrong.
 */
export function suggestAssignment(
  reading: DocumentReading,
  requirements: readonly Requirement[],
  vehicles: readonly { id: string; plate: string }[],
): { kind: string | null; vehicleId: string | null } {
  if (reading.status !== 'read' || reading.kind === null) return { kind: null, vehicleId: null };
  const requirement = requirements.find((row) => row.kind === reading.kind);
  if (requirement === undefined) return { kind: null, vehicleId: null };
  if (requirement.scope === 'company') return { kind: requirement.kind, vehicleId: null };
  const vehicleId = vehicleForPlate(reading.plate, vehicles) ?? (vehicles.length === 1 ? vehicles[0]!.id : null);
  return { kind: requirement.kind, vehicleId };
}

/** „2027-03-25" → „25.03.2027", the way it is written on the document. */
export function formatDateRo(iso: string | null): string {
  if (iso === null || !DATE.test(iso)) return '';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

/** A date the person typed, if it is one. */
export function isIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
