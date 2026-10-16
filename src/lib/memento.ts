/**
 * Memento expirări auto: the dates a person keeps for their own vehicles.
 *
 * **Declared, not verified.** Nothing in this file, or anything built on
 * it, says a document is valid in the sense the platform's verification
 * means it. These are dates somebody typed or confirmed from a photo; the
 * screens call them a memento and nothing more. The verified record of a
 * carrier's documents is `documents`, reviewed by staff, and is never
 * read or written from here (see `20261016100000_memento_expirari.sql`).
 *
 * Every date is a calendar day in Europe/Bucharest. The reminder rules
 * here mirror `memento_queue_reminders()` in that migration, so the screen
 * can say when the next one comes and the tests can pin the schedule;
 * the database is the one that actually sends.
 *
 * Free of React and of Supabase.
 */

export const MEMENTO_KINDS = [
  'rca',
  'itp',
  'rovinieta',
  'casco',
  'trusa_medicala',
  'extinctor',
  'revizie',
  'altceva',
] as const;
export type MementoKind = (typeof MEMENTO_KINDS)[number];

/** The four every vehicle is offered first; the rest are a tap away. */
export const MEMENTO_MAIN_KINDS: readonly MementoKind[] = ['rca', 'itp', 'rovinieta', 'casco'];

export const MEMENTO_KIND_LABELS: Record<MementoKind, string> = {
  rca: 'RCA',
  itp: 'ITP',
  rovinieta: 'Rovinietă',
  casco: 'CASCO',
  trusa_medicala: 'Trusă medicală',
  extinctor: 'Extinctor',
  revizie: 'Revizie',
  altceva: 'Altceva',
};

export function isMementoKind(value: unknown): value is MementoKind {
  return typeof value === 'string' && (MEMENTO_KINDS as readonly string[]).includes(value);
}

/** What one entry is called on screen: the kind, or the name given to „Altceva". */
export function mementoLabel(kind: MementoKind, customName?: string | null): string {
  if (kind === 'altceva') return customName?.trim() || MEMENTO_KIND_LABELS.altceva;
  return MEMENTO_KIND_LABELS[kind];
}

export const VEHICLE_KINDS = ['autoturism', 'duba', 'transportor', 'altul'] as const;
export type MementoVehicleKind = (typeof VEHICLE_KINDS)[number];

export const VEHICLE_KIND_LABELS: Record<MementoVehicleKind, string> = {
  autoturism: 'Autoturism',
  duba: 'Dubă',
  transportor: 'Transportor auto',
  altul: 'Altul',
};

// ---------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------

/** „B 123 ABC", „b-123-abc" and „B123ABC" are one plate, stored as the last. */
export function normalisePlate(raw: string): string {
  return raw.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

export function isPlate(raw: string): boolean {
  return /^[A-Z0-9]{2,12}$/.test(normalisePlate(raw));
}

/**
 * A stored plate, the way it is painted: „B123ABC" → „B 123 ABC",
 * „CJ12XYZ" → „CJ 12 XYZ". Anything that is not a Romanian plate in the
 * usual shape is shown as it is.
 */
export function displayPlate(plate: string): string {
  const match = /^([A-Z]{1,2})(\d{2,3})([A-Z]{3})$/.exec(plate);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : plate;
}

// ---------------------------------------------------------------------
// Days, in Bucharest
// ---------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD that is a real calendar day. */
export function isIsoDay(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const BUCHAREST_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today in Bucharest, whatever the server's clock says. At 23:30 UTC it
 * is already tomorrow there, and a date that „expires today" has to say
 * so to the person reading it, not to the machine.
 */
export function bucharestToday(now: Date = new Date()): string {
  return BUCHAREST_DAY.format(now);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Days left until a date; negative once it has passed, 0 on the day. */
export function daysLeft(validUntil: string, today: string): number {
  return daysBetween(today, validUntil);
}

/** „Expiră curând" starts here: the same 30 days the fleet filter uses. */
export const SOON_DAYS = 30;

export type MementoState = 'valabil' | 'curand' | 'expirat';

export function mementoState(days: number): MementoState {
  if (days < 0) return 'expirat';
  if (days <= SOON_DAYS) return 'curand';
  return 'valabil';
}

export const MEMENTO_STATE_LABELS: Record<MementoState, string> = {
  valabil: 'Valabil',
  curand: 'Expiră curând',
  expirat: 'Expirat',
};

/** „N zile", „N de zile" — the Romanian rule for 20 and up. */
function zile(n: number): string {
  const lastTwo = Math.abs(n) % 100;
  return lastTwo >= 1 && lastTwo <= 19 ? `${n} zile` : `${n} de zile`;
}

/**
 * The words for days left, as the reminders use them — the SQL
 * `memento_when()` says the same.
 */
export function whenText(days: number): string {
  if (days < -1) return `a expirat acum ${zile(-days)}`;
  if (days === -1) return 'a expirat ieri';
  if (days === 0) return 'expiră azi';
  if (days === 1) return 'expiră mâine';
  return `expiră în ${zile(days)}`;
}

/** DD.MM.YYYY, the way a Romanian reads a date on a document. */
export function formatDay(day: string | null): string {
  if (day === null || !isIsoDay(day)) return '';
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

// ---------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------

/** The days before a date a reminder goes: a month, a week, the day before, the day. */
export const DEFAULT_REMINDER_DAYS: readonly number[] = [30, 7, 1, 0];

/** Close dates within this many days make one e-mail. */
export const DEFAULT_GROUP_WINDOW = 3;

/** One entry, as the reminder rules see it. */
export interface ReminderEntry {
  id: string;
  validUntil: string;
  /** The Bucharest day the current date was written. */
  dateSetOn: string;
  /** Reminder days for this entry: the account's choice, else the default. */
  days: readonly number[];
  /** Reminders already given for this date. */
  logged: readonly number[];
}

export interface ReminderMarks {
  daysLeft: number;
  /** The reminder due today, if there is one. */
  due: number | null;
  /** The next reminder, when it is within the window and may ride along. */
  soon: number | null;
}

/**
 * What is due for one entry today. The mirror of the `marked` and
 * `flagged` steps of `memento_queue_reminders()`:
 *
 *   - due: the smallest reminder day not below the days left — so a night
 *     the job did not run is caught up the next — unless it was given
 *     already, or its day had passed before the date was even written;
 *   - soon: the next reminder day, if it is only a few days off, never the
 *     day itself (that one is always its own).
 */
export function reminderMarks(entry: ReminderEntry, today: string, window = DEFAULT_GROUP_WINDOW): ReminderMarks {
  const left = daysLeft(entry.validUntil, today);
  const none = { daysLeft: left, due: null, soon: null };
  if (left < 0 || left > 366) return none;
  const span = daysBetween(entry.dateSetOn, entry.validUntil);
  const notBelow = entry.days.filter((d) => d >= left);
  const below = entry.days.filter((d) => d < left);
  const mDue = notBelow.length > 0 ? Math.min(...notBelow) : null;
  const mNext = below.length > 0 ? Math.max(...below) : null;
  const due = mDue !== null && mDue < span && !entry.logged.includes(mDue) ? mDue : null;
  const soon =
    mNext !== null && mNext > 0 && left - mNext <= window && mNext < span && !entry.logged.includes(mNext)
      ? mNext
      : null;
  return { daysLeft: left, due, soon };
}

export interface ReminderBatch {
  /** The entries in today's message, nearest first. */
  entries: { id: string; daysLeft: number; milestones: number[] }[];
  /** One date: the single reminder. Several: the grouped one. */
  template: 'memento_expiry_reminder' | 'memento_expiry_digest';
}

/**
 * Today's message for one person, or null. Sent only when at least one
 * entry is due; entries whose next reminder is near join it, so close
 * dates make one e-mail. A late reminder also takes its own next one when
 * that is only days away, so nobody is told twice in two days.
 */
export function reminderBatch(
  entries: readonly ReminderEntry[],
  today: string,
  window = DEFAULT_GROUP_WINDOW,
): ReminderBatch | null {
  const marked = entries
    .map((entry) => ({ entry, marks: reminderMarks(entry, today, window) }))
    .filter(({ marks }) => marks.due !== null || marks.soon !== null);
  if (!marked.some(({ marks }) => marks.due !== null)) return null;
  const items = marked
    .map(({ entry, marks }) => {
      let milestones: number[];
      if (marks.due !== null && marks.soon !== null && marks.due > marks.daysLeft) {
        milestones = [marks.due, marks.soon];
      } else if (marks.due !== null) {
        milestones = [marks.due];
      } else {
        milestones = [marks.soon!];
      }
      return { id: entry.id, daysLeft: marks.daysLeft, milestones };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return { entries: items, template: items.length === 1 ? 'memento_expiry_reminder' : 'memento_expiry_digest' };
}

/**
 * The day the next reminder for this date goes, for the line under an
 * entry („Următorul memento: 23.10.2026"). Null when none is left.
 */
export function nextReminderDay(
  validUntil: string,
  today: string,
  days: readonly number[] = DEFAULT_REMINDER_DAYS,
): string | null {
  const left = daysLeft(validUntil, today);
  const upcoming = days.filter((d) => d <= left).sort((a, b) => b - a);
  const next = upcoming[0];
  return next === undefined ? null : addDays(validUntil, -next);
}

/**
 * Reminder days as somebody typed them: „30, 7, 1, 0" → [30, 7, 1, 0].
 * Duplicates go, the order is largest first, at most eight, 0 to 365.
 * Null when the text is not that.
 */
export function parseReminderDays(raw: string): number[] | null {
  const parts = raw.split(/[\s,;]+/).filter((p) => p !== '');
  if (parts.length > 8) return null;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 365) return null;
    if (!numbers.includes(n)) numbers.push(n);
  }
  return numbers.sort((a, b) => b - a);
}

// ---------------------------------------------------------------------
// The fleet view
// ---------------------------------------------------------------------

export type FleetFilter = 'toate' | '30' | 'expirate';
export type FleetSort = 'urgenta' | 'numar';

export function readFleetFilter(value: string | undefined | null): FleetFilter {
  return value === '30' || value === 'expirate' ? value : 'toate';
}

export function readFleetSort(value: string | undefined | null): FleetSort {
  return value === 'numar' ? 'numar' : 'urgenta';
}

export interface FleetEntry {
  validUntil: string | null;
}

export interface FleetVehicle {
  plate: string;
  entries: readonly FleetEntry[];
}

/** The nearest date of a vehicle's entries, as days left; null without dates. */
export function soonestDays(vehicle: FleetVehicle, today: string): number | null {
  const all = vehicle.entries
    .filter((e): e is { validUntil: string } => e.validUntil !== null)
    .map((e) => daysLeft(e.validUntil, today));
  return all.length === 0 ? null : Math.min(...all);
}

/**
 * The fleet, filtered and sorted. „Expiră în 30 de zile" keeps vehicles
 * with a date between today and thirty days from now; „Expirate" those
 * with a date already passed. Sorted by the nearest date, or by plate.
 */
export function fleetView<V extends FleetVehicle>(
  vehicles: readonly V[],
  filter: FleetFilter,
  sort: FleetSort,
  today: string,
): V[] {
  const kept = vehicles.filter((vehicle) => {
    if (filter === 'toate') return true;
    const lefts = vehicle.entries
      .filter((e): e is { validUntil: string } => e.validUntil !== null)
      .map((e) => daysLeft(e.validUntil, today));
    if (filter === 'expirate') return lefts.some((d) => d < 0);
    return lefts.some((d) => d >= 0 && d <= SOON_DAYS);
  });
  return [...kept].sort((a, b) => {
    if (sort === 'numar') return a.plate.localeCompare(b.plate, 'ro');
    const da = soonestDays(a, today) ?? Number.POSITIVE_INFINITY;
    const db = soonestDays(b, today) ?? Number.POSITIVE_INFINITY;
    return da - db || a.plate.localeCompare(b.plate, 'ro');
  });
}

/**
 * The one calm line of conversion copy a memento screen may carry.
 * A person: a request. A firm with vans or car transporters: requests
 * on the platform. A firm with only cars: nothing — it is not a carrier
 * and the memento is all it came for.
 */
export function conversionLine(
  scope: 'personal' | 'firma',
  vehicleKinds: readonly (MementoVehicleKind | null)[],
  isCarrier: boolean,
): 'cerere' | 'transport' | null {
  if (scope === 'personal') return 'cerere';
  if (isCarrier) return null;
  return vehicleKinds.some((kind) => kind === 'duba' || kind === 'transportor') ? 'transport' : null;
}
