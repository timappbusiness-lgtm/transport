import { toCsv } from './data-export';

/**
 * Reading `audit_log`.
 *
 * Every decision the platform makes has been written here since phase 0
 * — who, what, on what, before, after, why — and it could only be read
 * by opening a SQL console. What was missing is not the data but the
 * reading: two jsonb blobs side by side are not an answer to „ce s-a
 * schimbat", and nobody audits what they cannot skim.
 *
 * Free of React and of the database, so the diff a screen shows and the
 * diff a CSV carries are the same diff.
 */

export interface AuditEntry {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface AuditFacet {
  kind: 'action' | 'entity';
  value: string;
  occurrences: number;
}

/** One field that changed, with both sides as a person would read them. */
export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

/** Columns that change on every write and say nothing about the decision. */
const NOISE = new Set(['updated_at', 'created_at', 'profile_updated_at']);

/**
 * What changed between the two sides.
 *
 * Only the fields that differ, and never the timestamps every update
 * touches: a diff whose first three lines are `updated_at` is a diff
 * people stop opening. An insert has no `before` and a delete no
 * `after`; both are shown as one-sided rather than as „everything
 * changed".
 */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
  const a = asRecord(before);
  const b = asRecord(after);
  if (a === null && b === null) return [];

  const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const changes: FieldChange[] = [];

  for (const key of [...keys].sort()) {
    if (NOISE.has(key)) continue;
    const left = display(a?.[key]);
    const right = display(b?.[key]);
    if (left === right) continue;
    changes.push({ field: key, before: left, after: right });
  }
  return changes;
}

/** Whether there is a diff worth opening at all. */
export function hasDiff(entry: AuditEntry): boolean {
  return changedFields(entry.before, entry.after).length > 0;
}

/**
 * A value as a line of text.
 *
 * Nulls read as „—" rather than as the word null, arrays as a comma
 * list, and anything else as its JSON — which for a nested object is
 * honest about being unreadable instead of silently flattening it.
 */
export function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'da' : 'nu';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(display).join(', ');
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * The filtered range as a CSV.
 *
 * One line per entry with the changed fields folded into a single cell,
 * because a CSV whose column set depends on which rows came back is a
 * CSV that opens differently every time. `toCsv` is the one from the
 * data export, so the encoding and the BOM are the same everywhere.
 */
export function auditCsv(entries: readonly AuditEntry[]): string {
  return toCsv(
    entries.map((entry) => ({
      data: entry.created_at,
      actiune: entry.action,
      entitate: entry.entity ?? '',
      id_entitate: entry.entity_id ?? '',
      actor: entry.actor_name ?? entry.actor_user_id ?? '',
      rol: entry.actor_role ?? '',
      motiv: entry.reason ?? '',
      modificari: changedFields(entry.before, entry.after)
        .map((change) => `${change.field}: ${change.before} → ${change.after}`)
        .join(' | '),
    })),
  );
}

/** `jurnal-2026-09-21.csv`, in the timezone people here live in. */
export function auditCsvName(now: Date): string {
  const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' }).format(now);
  return `jurnal-${stamp}.csv`;
}

const OFFSET_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Bucharest',
  timeZoneName: 'longOffset',
});

/**
 * Midnight in Bucharest on a given day, as an instant.
 *
 * The offset has to be looked up per date rather than hardcoded:
 * Romania is UTC+3 in summer and UTC+2 in winter, so a fixed `+03:00`
 * would put every winter query's boundary an hour into the previous
 * day — quietly, and only for half the year.
 *
 * Takes `YYYY-MM-DD`. Returns an RFC 3339 string Postgres reads as a
 * `timestamptz`.
 */
export function bucharestMidnight(day: string): string {
  const parts = OFFSET_FORMAT.formatToParts(new Date(`${day}T12:00:00Z`));
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  // "GMT+03:00" — and plain "GMT" at an offset of zero, which Romania
  // never has but the format allows.
  const offset = name.replace('GMT', '') || '+00:00';
  return `${day}T00:00:00${offset}`;
}

/** The day after, so „până la 21" includes the whole of the 21st. */
export function bucharestNextMidnight(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return bucharestMidnight(next.toISOString().slice(0, 10));
}
