import type { Database } from './supabase/database.types';

/**
 * The order, as the screens read it.
 *
 * Free of React and of the database, because the same three questions
 * get asked on six screens and the answers must not drift: where is this
 * order, what happens next, and whose turn is it.
 *
 * Every rule here is applied again by `transition_order()` in Postgres,
 * which is what actually decides. What this buys is a button that is
 * absent rather than a button that fails.
 */

export type OrderStatus = Database['public']['Enums']['transport_status'];
export type EvidenceKind = Database['public']['Enums']['order_evidence_kind'];

/**
 * The seven steps, in order.
 *
 * `transport_status` carries five more: `cancelled` and `disputed`,
 * which sit beside the run rather than in it, and `agreed`, `loading`,
 * `delivered`, `invoiced` and `closed` — the phase 0 spelling, migrated
 * away in 20260923100100 and never written again. Postgres cannot drop
 * an enum value, so they are listed nowhere and handled everywhere by
 * falling through to the label map.
 */
export const ORDER_STEPS: readonly OrderStatus[] = [
  'order_confirmed',
  'pickup_scheduled',
  'vehicle_picked_up',
  'in_transit',
  'delivery_scheduled',
  'vehicle_delivered',
  'order_completed',
];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  order_confirmed: 'Confirmată',
  pickup_scheduled: 'Ridicare programată',
  vehicle_picked_up: 'Vehicul ridicat',
  in_transit: 'Pe drum',
  delivery_scheduled: 'Livrare programată',
  vehicle_delivered: 'Livrat',
  order_completed: 'Finalizată',
  cancelled: 'Anulată',
  disputed: 'În dispută',
  // The phase 0 spelling. Nothing writes these; a row restored from an
  // old dump would otherwise render a blank badge.
  agreed: 'Confirmată',
  loading: 'La încărcare',
  delivered: 'Livrat',
  invoiced: 'Facturată',
  closed: 'Finalizată',
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/** Which side of the order the reader is on. Decided by the database. */
export type OrderSide = 'client' | 'carrier' | 'driver' | 'staff';

export function isFinished(status: string): boolean {
  return status === 'order_completed' || status === 'cancelled' || status === 'closed';
}

export function isLive(status: string): boolean {
  return !isFinished(status) && status !== 'disputed';
}

/** How far along the run a status is, for the progress bar. -1 when it is not on it. */
export function stepIndex(status: string): number {
  return ORDER_STEPS.indexOf(status as OrderStatus);
}

// ---------------------------------------------------------------------
// What happens next
// ---------------------------------------------------------------------

export interface NextAction {
  /** The status the button moves the order to. */
  to: OrderStatus;
  label: string;
  /** Who may press it. Anybody else sees `blockedFor` instead. */
  side: readonly OrderSide[];
  /** Said to whoever may not press it, so the screen is never mute. */
  waitingFor: string;
  /** Evidence the database will count before it allows the step. */
  needs?: { kind: EvidenceKind; count: number; label: string }[];
}

const REQUIRED_PHOTOS = 4;

/**
 * The single next step, or null when the order is finished.
 *
 * One next action, never a menu: an order is a line, and a screen that
 * offers three buttons at once is a screen where somebody presses the
 * wrong one at the kerb.
 */
export function nextAction(status: string): NextAction | null {
  switch (status) {
    case 'order_confirmed':
      return {
        to: 'pickup_scheduled',
        label: 'Programează ridicarea',
        side: ['carrier', 'staff'],
        waitingFor: 'Transportatorul programează ridicarea.',
      };
    case 'pickup_scheduled':
      return {
        to: 'vehicle_picked_up',
        label: 'Am ridicat vehiculul',
        side: ['carrier', 'driver', 'staff'],
        waitingFor: 'Șoferul confirmă ridicarea, cu fotografii și fișa de stare.',
        needs: [
          { kind: 'pickup_photo', count: REQUIRED_PHOTOS, label: 'fotografii la ridicare' },
          { kind: 'condition_report', count: 1, label: 'fișa de stare' },
        ],
      };
    case 'vehicle_picked_up':
      return {
        to: 'in_transit',
        label: 'Am pornit la drum',
        side: ['carrier', 'driver', 'staff'],
        waitingFor: 'Șoferul pornește la drum.',
      };
    case 'in_transit':
      return {
        to: 'delivery_scheduled',
        label: 'Programează livrarea',
        side: ['carrier', 'staff'],
        waitingFor: 'Transportatorul programează livrarea.',
      };
    case 'delivery_scheduled':
      return {
        to: 'vehicle_delivered',
        label: 'Am livrat vehiculul',
        side: ['carrier', 'driver', 'staff'],
        waitingFor: 'Șoferul confirmă livrarea, cu fotografii și codul clientului.',
        needs: [
          { kind: 'delivery_photo', count: REQUIRED_PHOTOS, label: 'fotografii la livrare' },
          { kind: 'recipient_confirmation', count: 1, label: 'confirmarea persoanei care primește' },
        ],
      };
    case 'vehicle_delivered':
      return {
        to: 'order_completed',
        label: 'Confirm livrarea',
        side: ['client', 'staff'],
        waitingFor: 'Clientul verifică fotografiile și confirmă livrarea.',
      };
    default:
      return null;
  }
}

/** Whether this reader may press the next button. */
export function canAct(action: NextAction | null, side: OrderSide | null): boolean {
  if (action === null || side === null) return false;
  return action.side.includes(side);
}

/**
 * What is still missing before the next step is allowed.
 *
 * The same counting `transition_order()` does, so the screen can say
 * „mai ai nevoie de două fotografii" before somebody presses a button
 * and is told the same thing by the database.
 */
export function missingEvidence(
  action: NextAction | null,
  have: Readonly<Record<string, number>>,
): string[] {
  if (action?.needs === undefined) return [];
  const gaps: string[] = [];
  for (const need of action.needs) {
    const short = need.count - (have[need.kind] ?? 0);
    if (short > 0) gaps.push(short === 1 ? `încă o ${need.label}` : `încă ${short} ${need.label}`);
  }
  return gaps;
}

// ---------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------

export interface TimelineEvent {
  id: string;
  created_at: string;
  from_status: string | null;
  to_status: string;
  actor_side: string;
  actor_name: string | null;
  note: string | null;
}

export interface TimelineRow {
  status: OrderStatus;
  label: string;
  state: 'done' | 'current' | 'todo';
  at: string | null;
  who: string | null;
  note: string | null;
}

const SIDE_LABELS: Record<string, string> = {
  client: 'Clientul',
  carrier: 'Transportatorul',
  driver: 'Șoferul',
  staff: 'Echipa platformei',
  system: 'Platforma',
};

export function sideLabel(side: string): string {
  return SIDE_LABELS[side] ?? side;
}

/**
 * The seven steps with what actually happened against each.
 *
 * Built from the events rather than from the timestamps on the order:
 * the columns say when something happened and the events say who did
 * it, and „cine" is the half that matters when two people remember the
 * handover differently.
 *
 * A step with no event is still a row. A timeline that only lists what
 * has happened cannot show what has not, and what has not is the thing
 * somebody opened the page to find out.
 */
export function buildTimeline(status: string, events: readonly TimelineEvent[]): TimelineRow[] {
  const latest = new Map<string, TimelineEvent>();
  for (const event of events) {
    // The last one wins: a window can be re-scheduled, and the row
    // should show the time that stands.
    latest.set(event.to_status, event);
  }

  const current = stepIndex(status);
  return ORDER_STEPS.map((step, index) => {
    const event = latest.get(step);
    const state: TimelineRow['state'] =
      current < 0 ? (event ? 'done' : 'todo')
      : index < current ? 'done'
      : index === current ? 'current'
      : 'todo';

    return {
      status: step,
      label: ORDER_STATUS_LABELS[step] ?? step,
      state,
      at: event?.created_at ?? null,
      who: event ? (event.actor_name ?? sideLabel(event.actor_side)) : null,
      note: event?.note ?? null,
    };
  });
}

/** The events that are not one of the seven steps: a cancellation, a dispute, a crew change. */
export function asideEvents(events: readonly TimelineEvent[]): TimelineEvent[] {
  return events.filter(
    (event) =>
      !ORDER_STEPS.includes(event.to_status as OrderStatus) ||
      event.from_status === event.to_status,
  );
}

// ---------------------------------------------------------------------
// The condition report
// ---------------------------------------------------------------------

export interface ChecklistItem {
  key: string;
  label: string;
  kind: 'state' | 'number' | 'yesno';
}

/**
 * What a driver walks round the car and writes down.
 *
 * Nine lines, in the order somebody actually does it: round the
 * outside, then the wheels, then inside, then the two things that are
 * handed over. The regulatory words stay Romanian.
 */
export const CONDITION_CHECKLIST: readonly ChecklistItem[] = [
  { key: 'zgarieturi', label: 'Zgârieturi', kind: 'state' },
  { key: 'lovituri', label: 'Lovituri', kind: 'state' },
  { key: 'geamuri', label: 'Geamuri', kind: 'state' },
  { key: 'jante', label: 'Jante', kind: 'state' },
  { key: 'interior', label: 'Interior', kind: 'state' },
  { key: 'kilometraj', label: 'Kilometraj', kind: 'number' },
  { key: 'combustibil', label: 'Nivel combustibil (/8)', kind: 'number' },
  { key: 'chei', label: 'Chei predate', kind: 'yesno' },
  { key: 'acte', label: 'Acte predate', kind: 'yesno' },
];

export const CONDITION_STATES = ['fără', 'ușoare', 'vizibile'] as const;
export type ConditionState = (typeof CONDITION_STATES)[number];

export type ChecklistValues = Record<string, string>;

/**
 * Every line answered, and the two numbers sane.
 *
 * „Sane" is deliberately loose: a kilometre reading of 1.2 million is a
 * lorry that has earned it, and a form that argues with a driver at the
 * kerb about whether their odometer is plausible is a form that gets
 * filled in with zeroes.
 */
export function validateChecklist(values: ChecklistValues): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const item of CONDITION_CHECKLIST) {
    const raw = (values[item.key] ?? '').trim();
    if (raw === '') {
      errors[item.key] = 'Completează.';
      continue;
    }
    if (item.kind === 'state' && !CONDITION_STATES.includes(raw as ConditionState)) {
      errors[item.key] = 'Alege una dintre variante.';
    }
    if (item.kind === 'number') {
      const value = Number(raw.replace(/\s/g, ''));
      if (!Number.isFinite(value) || value < 0) {
        errors[item.key] = 'Scrie un număr.';
      } else if (item.key === 'combustibil' && value > 8) {
        errors[item.key] = 'Nivelul se scrie din opt (0–8).';
      } else if (item.key === 'kilometraj' && value > 3_000_000) {
        errors[item.key] = 'Verifică cifra.';
      }
    }
    if (item.kind === 'yesno' && raw !== 'da' && raw !== 'nu') {
      errors[item.key] = 'Da sau nu.';
    }
  }
  return errors;
}

/** The checklist as one line, for a card that has no room for nine. */
export function summariseChecklist(values: ChecklistValues): string {
  const damage = CONDITION_CHECKLIST.filter(
    (item) => item.kind === 'state' && (values[item.key] ?? 'fără') !== 'fără',
  ).map((item) => item.label.toLowerCase());

  if (damage.length === 0) return 'Fără observații';
  return `Observații: ${damage.join(', ')}`;
}

// ---------------------------------------------------------------------
// The handover code
// ---------------------------------------------------------------------

/** „123456" as „123 456": six digits are read out loud, not typed from memory. */
export function formatCode(code: string | null): string {
  if (code === null || !/^\d{6}$/.test(code)) return '——— ———';
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** What the driver typed, with the spaces people add. */
export function normaliseCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

export function isCompleteCode(input: string): boolean {
  return /^\d{6}$/.test(normaliseCode(input));
}

// ---------------------------------------------------------------------
// Dates and deadlines
// ---------------------------------------------------------------------

/** „25.09.2026, 14:30", which is how a time is read here. */
export function formatMoment(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A window as one phrase: „25.09, 09:00 — 12:00" or „25.09, de la 09:00". */
export function formatWindow(from: string | null, to: string | null): string {
  if (from === null) return 'nu este programată';
  const start = formatMoment(from);
  if (to === null) return `de la ${start}`;
  const sameDay = from.slice(0, 10) === to.slice(0, 10);
  if (!sameDay) return `${start} — ${formatMoment(to)}`;
  const end = new Date(to).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} — ${end}`;
}

/**
 * How long the client has left to confirm or dispute.
 *
 * `now` is a parameter so the server and the browser answer the same
 * question and a test can ask it without waiting two days.
 */
export function confirmationDeadline(
  deliveredAt: string | null,
  hours: number,
  now: Date = new Date(),
): { at: Date; left: string; passed: boolean } | null {
  if (deliveredAt === null) return null;
  const at = new Date(new Date(deliveredAt).getTime() + hours * 3_600_000);
  const ms = at.getTime() - now.getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return { at, left: 'termenul a trecut', passed: true };

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return { at, left: plural(minutes, 'minut', 'minute', 'un'), passed: false };

  // Hours right up to two days, not one. The window is 48 hours by
  // default, so switching to days at 24 would tell somebody with 47
  // hours left that they have „o zi" — which is both wrong and the
  // wrong way round, since it reads as less time than they have.
  const hoursLeft = Math.floor(minutes / 60);
  if (hoursLeft < 48) return { at, left: plural(hoursLeft, 'oră', 'ore'), passed: false };
  return { at, left: plural(Math.floor(hoursLeft / 24), 'zi', 'zile'), passed: false };
}

/**
 * Romanian counts differently at one and from twenty up.
 *
 * „o oră", „3 ore", „20 de ore" — the „de" from twenty is the part
 * everybody forgets, and a deadline written „20 ore" reads as a
 * translation.
 */
function plural(n: number, one: string, many: string, article = 'o'): string {
  if (n === 1) return `${article} ${one}`;
  if (n < 20) return `${n} ${many}`;
  return `${n} de ${many}`;
}

// ---------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------

export type OrderBox = 'active' | 'finalizate' | 'anulate';

export const BOX_LABELS: Record<OrderBox, string> = {
  active: 'Active',
  finalizate: 'Finalizate',
  anulate: 'Anulate și dispute',
};

export function parseBox(value: string | null): OrderBox {
  return value === 'finalizate' || value === 'anulate' ? value : 'active';
}
