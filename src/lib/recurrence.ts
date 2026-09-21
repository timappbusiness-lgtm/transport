/**
 * Regula de repetare, fără React și fără SQL.
 *
 * Aceeași socoteală ca `recurrence_dates()` din migrare. Nu este o a
 * doua implementare pentru că nu avea încotro: ecranul trebuie să arate
 * „următoarele plecări" înainte ca seria să existe, iar jobul de noapte
 * nu poate fi chemat ca să afle asta. Ultimele teste din
 * `tests/unit/recurrence.test.ts` compară cele două pe aceleași
 * intrări, ca ziua în care una se schimbă să fie ziua în care se află
 * că mai există una.
 *
 * **Zile, nu momente.** O plecare are o zi. Dacă aritmetica s-ar face
 * pe `Date` cu ore, noaptea de 30 martie — când România trece la ora de
 * vară și ziua are 23 de ore — ar produce fie o zi în plus, fie una în
 * minus, în funcție de cum cade rotunjirea. Lucrând pe `YYYY-MM-DD` și
 * pe UTC la prânz, ora de vară nu are unde să intre.
 */

export type RecurrenceKind = 'saptamanal' | 'la_n_zile';

export const WEEKDAY_LABELS: readonly string[] = [
  'Duminică',
  'Luni',
  'Marți',
  'Miercuri',
  'Joi',
  'Vineri',
  'Sâmbătă',
];

/** Scurt, pentru bifele din formular. */
export const WEEKDAY_SHORT: readonly string[] = ['D', 'L', 'Ma', 'Mi', 'J', 'V', 'S'];

export interface RecurrenceRule {
  kind: RecurrenceKind;
  /** 0 = duminică … 6 = sâmbătă, ca `extract(dow)` în Postgres. */
  weekdays: readonly number[];
  everyNDays: number | null;
  startsOn: string;
  endsOn: string;
}

/** Prânz UTC: destul de departe de ambele margini ale oricărui fus. */
function atNoon(iso: string): number {
  return Date.parse(`${iso}T12:00:00.000Z`);
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

export function addDays(iso: string, days: number): string {
  return toIso(atNoon(iso) + days * DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((atNoon(to) - atNoon(from)) / DAY);
}

/** 0 = duminică, ca în Postgres. `getUTCDay()` numără la fel. */
export function weekdayOf(iso: string): number {
  return new Date(atNoon(iso)).getUTCDay();
}

/**
 * Datele pe care le cere regula, între două margini.
 *
 * `limit` există pentru că o regulă scrisă greșit — „la fiecare zi,
 * până în 2030" — altfel ar desena o mie de pastile pe un ecran.
 */
export function expand(rule: RecurrenceRule, until?: string, limit = 100): string[] {
  const last = until === undefined ? rule.endsOn : min(until, rule.endsOn);
  if (daysBetween(rule.startsOn, last) < 0) return [];

  const out: string[] = [];
  const total = daysBetween(rule.startsOn, last);

  for (let offset = 0; offset <= total && out.length < limit; offset += 1) {
    const day = addDays(rule.startsOn, offset);
    if (matches(rule, day, offset)) out.push(day);
  }
  return out;
}

function matches(rule: RecurrenceRule, day: string, offset: number): boolean {
  if (rule.kind === 'saptamanal') return rule.weekdays.includes(weekdayOf(day));
  const step = Math.max(rule.everyNDays ?? 1, 1);
  return offset % step === 0;
}

function min(a: string, b: string): string {
  return a < b ? a : b;
}

/** Următoarele `count` date, de azi înainte. Pentru ecran. */
export function upcoming(rule: RecurrenceRule, today: string, count = 5): string[] {
  const from = rule.startsOn < today ? today : rule.startsOn;
  return expand({ ...rule, startsOn: from }, rule.endsOn, count);
}

// ---------------------------------------------------------------------
// Ce se scrie pe ecran
// ---------------------------------------------------------------------

/** „În fiecare marți și joi" / „La fiecare 3 zile". */
export function describe(rule: RecurrenceRule): string {
  if (rule.kind === 'la_n_zile') {
    const n = rule.everyNDays ?? 1;
    return n === 1 ? 'În fiecare zi' : `La fiecare ${n} zile`;
  }

  const days = [...rule.weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d]?.toLowerCase() ?? '');
  if (days.length === 0) return 'Fără zile alese';
  if (days.length === 1) return `În fiecare ${days[0]}`;

  const last = days[days.length - 1];
  return `În fiecare ${days.slice(0, -1).join(', ')} și ${last}`;
}

export const MAX_SERIES_DAYS = 365;
export const MAX_EVERY_N = 90;

export type RuleErrors = Partial<Record<'weekdays' | 'everyNDays' | 'endsOn' | 'kind', string>>;

/**
 * Ce refuzăm înainte să întrebăm baza.
 *
 * Baza refuză și ea — `route_series_rule_ck` și
 * `create_route_series()` — iar acolo este regula. Aici este doar o
 * propoziție citibilă înainte ca omul să apese.
 */
export function validateRule(rule: RecurrenceRule, today: string): RuleErrors {
  const errors: RuleErrors = {};

  if (rule.kind === 'saptamanal') {
    if (rule.weekdays.length === 0) errors.weekdays = 'Alege cel puțin o zi din săptămână.';
    if (rule.weekdays.some((d) => d < 0 || d > 6)) errors.weekdays = 'Zi nevalidă.';
  } else {
    const n = rule.everyNDays;
    if (n === null || !Number.isInteger(n) || n < 1) {
      errors.everyNDays = 'Scrie la câte zile se repetă.';
    } else if (n > MAX_EVERY_N) {
      errors.everyNDays = `Cel mult ${MAX_EVERY_N} de zile.`;
    }
  }

  if (daysBetween(today, rule.endsOn) < 0) {
    errors.endsOn = 'Data de sfârșit este în trecut.';
  } else if (daysBetween(today, rule.endsOn) > MAX_SERIES_DAYS) {
    errors.endsOn = 'O serie ține cel mult un an. Vei putea să o prelungești.';
  } else if (daysBetween(rule.startsOn, rule.endsOn) < 0) {
    errors.endsOn = 'Sfârșitul este înaintea începutului.';
  }

  return errors;
}

export function ruleHasErrors(errors: RuleErrors): boolean {
  return Object.keys(errors).length > 0;
}
