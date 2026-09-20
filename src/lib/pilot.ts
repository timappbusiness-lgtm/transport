/**
 * The two exit criteria, and how far off them we are.
 *
 * `docs/04-roadmap.md` has said since it was written that the MVP is done
 * when **20 verified carriers and 5 forwarders use the platform weekly,
 * without us in the loop**. Until now that was a sentence in a document
 * and a number nobody could read: the data was in five tables and nothing
 * put it together, which is the definition of a criterion nobody checks.
 *
 * Everything here is arithmetic over what `pilot_overview()` and
 * `pilot_weekly_activity()` return, kept out of the page so it can be
 * tested without a database.
 */

export interface PilotOverview {
  verified_carriers: number;
  verified_forwarders: number;
  carriers_weekly: number;
  forwarders_weekly: number;
  carriers_target: number;
  forwarders_target: number;
  documents_pending: number;
  oldest_pending_hours: number | null;
  notifications_failed_24h: number;
  median_hours_to_first_contact: number | null;
  staff_interventions: number;
}

export interface PilotWeek {
  week_start: string;
  active_carriers: number;
  active_forwarders: number;
  requests_published: number;
  departures_published: number;
}

export interface Progress {
  current: number;
  target: number;
  /** 0–1, capped. Only ever used to draw a bar. */
  ratio: number;
  met: boolean;
  /** How many more are needed. Zero once the target is met. */
  remaining: number;
}

export function progress(current: number, target: number): Progress {
  const safeTarget = Math.max(0, target);
  const safeCurrent = Math.max(0, current);
  return {
    current: safeCurrent,
    target: safeTarget,
    ratio: safeTarget === 0 ? 1 : Math.min(1, safeCurrent / safeTarget),
    met: safeCurrent >= safeTarget,
    remaining: Math.max(0, safeTarget - safeCurrent),
  };
}

/**
 * How a duration in hours reads to a person.
 *
 * Hours up to two days, then days: „37 h" is a number somebody has to
 * divide, and „o zi și jumătate" is the thing they wanted to know.
 */
export function humanHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return 'sub o oră';
  if (hours < 48) {
    const rounded = Math.round(hours);
    return rounded === 1 ? 'o oră' : `${rounded} ore`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'o zi' : `${days} de zile`;
}

/**
 * Romanian grammar for a count of things.
 *
 * The rule that catches people out: from 20 upwards the noun takes „de".
 * Twenty-one carriers is „21 de transportatori", not „21 transportatori".
 */
export function countRo(n: number, singular: string, plural: string): string {
  if (n === 1) return `1 ${singular}`;
  const lastTwo = n % 100;
  return lastTwo >= 20 || lastTwo === 0 ? `${n} de ${plural}` : `${n} ${plural}`;
}

/** The weeks in the order a chart reads them, oldest first. */
export function chronological(weeks: readonly PilotWeek[]): PilotWeek[] {
  return [...weeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
}

/** The tallest bar a chart has to fit, never zero. */
export function chartCeiling(weeks: readonly PilotWeek[]): number {
  const highest = weeks.reduce(
    (max, week) => Math.max(max, week.active_carriers, week.active_forwarders),
    0,
  );
  return Math.max(1, highest);
}

/**
 * Whether the pilot has run long enough to say anything.
 *
 * Two weeks of data is not a trend, and a dashboard that draws one from
 * it invites a decision nobody should be making yet.
 */
export function enoughHistory(weeks: readonly PilotWeek[]): boolean {
  return weeks.filter((w) => w.active_carriers > 0 || w.active_forwarders > 0).length >= 4;
}

/** The default window: eight whole weeks back, ending today. */
export function defaultRange(today: Date): { from: string; to: string } {
  const to = new Date(today);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 55);
  return { from: iso(from), to: iso(to) };
}

export function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A date from a query string, or null. Never a `new Date('')`. */
export function parseIsoDate(value: string | undefined): string | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}
