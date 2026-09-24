/**
 * Romanian formatting for the contract: dates, times, amounts, day
 * counts, plates.
 *
 * Written out by hand rather than left to `Intl.NumberFormat('ro-RO')`,
 * whose grouping for four-digit amounts has changed between ICU versions
 * (1200 vs 1.200). A contract drawn in the edge function and the same
 * contract checked in a unit test under Node must print the same figure,
 * and a contract drawn again next year must print what it printed today.
 * The time zone is the one place `Intl` is used: converting an instant
 * to Bucharest wall time needs the tz database, and both runtimes carry it.
 *
 * Pure TypeScript: the Next unit tests import this file.
 */

const TIME_ZONE = 'Europe/Bucharest';

/** What the contract prints where a value is not known. */
export const NOT_STATED = 'nemenționat';

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` read as a calendar date, never shifted by a time zone. */
function calendarDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * An instant from Postgres JSON. `to_jsonb(timestamptz)` writes six
 * fractional digits; they are cut to three before parsing so no runtime
 * has to be generous about them.
 */
function instant(value: string): Date | null {
  const trimmed = value.trim().replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T');
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

const bucharestParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function wallTime(date: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = Object.fromEntries(
    bucharestParts.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
  };
}

/**
 * `24.09.2026`. A calendar date prints as itself; an instant prints as
 * the day it was in Bucharest.
 */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const calendar = calendarDate(value);
  if (calendar) return `${pad(calendar.d)}.${pad(calendar.m)}.${calendar.y}`;
  const date = instant(value);
  if (!date) return null;
  const t = wallTime(date);
  return `${pad(t.d)}.${pad(t.m)}.${t.y}`;
}

/** `24.09.2026, ora 14:05` (Bucharest time). */
export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  if (calendarDate(value)) return formatDate(value);
  const date = instant(value);
  if (!date) return null;
  const t = wallTime(date);
  return `${pad(t.d)}.${pad(t.m)}.${t.y}, ora ${pad(t.hh)}:${pad(t.mm)}`;
}

/** The day an instant or a date falls on in Bucharest, as `YYYY-MM-DD`, for comparing. */
function dayKey(value: string): string | null {
  const calendar = calendarDate(value);
  if (calendar) return `${calendar.y}-${pad(calendar.m)}-${pad(calendar.d)}`;
  const date = instant(value);
  if (!date) return null;
  const t = wallTime(date);
  return `${t.y}-${pad(t.m)}-${pad(t.d)}`;
}

/**
 * A window: `între 01.10.2026 și 03.10.2026`, or one date when both ends
 * are the same day or only one is known (`din 01.10.2026`, `până la
 * 03.10.2026`).
 */
export function formatWindow(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const a = formatDate(from);
  const b = formatDate(to);
  if (a && b) {
    if (from && to && dayKey(from) === dayKey(to)) return a;
    return `între ${a} și ${b}`;
  }
  if (a) return `din ${a}`;
  if (b) return `până la ${b}`;
  return null;
}

/** `1.234.567` — groups of three with a dot, as Romanian writes them. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * `2.400,00 lei`, `1.250,50 EUR`. Two decimals always: a contract states
 * a price, not an approximation of one.
 */
export function formatMoney(value: number | null, currency: string | null | undefined): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const whole = groupThousands(String(Math.floor(cents / 100)));
  const fraction = pad(cents % 100);
  const unit = currency === 'RON' || !currency ? 'lei' : currency;
  return `${negative ? '−' : ''}${whole},${fraction} ${unit}`;
}

/**
 * `1 zi`, `15 zile`, `30 de zile`, `101 zile`. Romanian puts „de" between
 * a number and its noun when the number ends in 20–99 or 00 (and is not
 * zero or one).
 */
export function formatDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isFinite(days)) return null;
  const n = Math.trunc(days);
  if (n === 1) return '1 zi';
  const rest = n % 100;
  const de = n !== 0 && (rest === 0 || rest >= 20);
  return `${groupThousands(String(n))}${de ? ' de' : ''} zile`;
}

/** `2.400 kg`. */
export function formatKg(kg: number | null | undefined): string | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return null;
  return `${groupThousands(String(Math.round(kg)))} kg`;
}

/** "TM01CRD" -> "TM 01 CRD" when it has the Romanian shape; otherwise as stored. */
export function formatPlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{1,2})(\d{2,3})([A-Z]{3})$/.exec(clean);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate.trim();
}

/** `da`, `nu`, or null when the question was not answered. */
export function yesNo(value: boolean | null | undefined): string | null {
  if (value === true) return 'da';
  if (value === false) return 'nu';
  return null;
}

/** The value, or the words for a value nobody stated. */
export function orNotStated(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : NOT_STATED;
}
