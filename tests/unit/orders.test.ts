import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOX_LABELS,
  CONDITION_CHECKLIST,
  CONDITION_STATES,
  ORDER_STATUS_LABELS,
  ORDER_STEPS,
  asideEvents,
  buildTimeline,
  canAct,
  confirmationDeadline,
  formatCode,
  formatWindow,
  isCompleteCode,
  isFinished,
  isLive,
  missingEvidence,
  nextAction,
  normaliseCode,
  orderStatusLabel,
  parseBox,
  stepIndex,
  summariseChecklist,
  validateChecklist,
  type TimelineEvent,
} from '@/lib/orders';

/**
 * The browser's half of the order rules. Every one of them is applied
 * again by `transition_order()` in Postgres, which is what decides —
 * these exist so a button is absent rather than failing, and so the two
 * halves can be compared.
 */

function event(over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: 'e1',
    created_at: '2026-09-25T09:00:00Z',
    from_status: 'order_confirmed',
    to_status: 'pickup_scheduled',
    actor_side: 'carrier',
    actor_name: 'Dispecer',
    note: null,
    ...over,
  };
}

describe('where an order is', () => {
  it('knows the seven steps, in order', () => {
    expect(ORDER_STEPS).toEqual([
      'order_confirmed',
      'pickup_scheduled',
      'vehicle_picked_up',
      'in_transit',
      'delivery_scheduled',
      'vehicle_delivered',
      'order_completed',
    ]);
  });

  it('places each one on the run', () => {
    expect(stepIndex('order_confirmed')).toBe(0);
    expect(stepIndex('order_completed')).toBe(6);
    // Beside the run, not on it.
    expect(stepIndex('cancelled')).toBe(-1);
    expect(stepIndex('disputed')).toBe(-1);
  });

  it('labels the phase 0 spellings too, so no badge renders blank', () => {
    // Nothing writes these any more. A row restored from a dump taken
    // before 20260923100100 would otherwise have no words at all.
    for (const legacy of ['agreed', 'loading', 'delivered', 'invoiced', 'closed']) {
      expect(orderStatusLabel(legacy)).not.toBe(legacy);
      expect(ORDER_STATUS_LABELS[legacy]).toBeTruthy();
    }
  });

  it('falls back to the value rather than to nothing', () => {
    expect(orderStatusLabel('ceva_nou')).toBe('ceva_nou');
  });

  it('separates finished from live, with disputed in neither', () => {
    expect(isFinished('order_completed')).toBe(true);
    expect(isFinished('cancelled')).toBe(true);
    expect(isLive('in_transit')).toBe(true);
    // A dispute is not progress and not an ending: it is a stop.
    expect(isLive('disputed')).toBe(false);
    expect(isFinished('disputed')).toBe(false);
  });
});

describe('what happens next', () => {
  it('offers exactly one action per step', () => {
    for (const step of ORDER_STEPS.slice(0, 6)) {
      const action = nextAction(step);
      expect(action, step).not.toBeNull();
      expect(ORDER_STEPS).toContain(action!.to);
    }
  });

  it('offers nothing once it is finished', () => {
    expect(nextAction('order_completed')).toBeNull();
    expect(nextAction('cancelled')).toBeNull();
    expect(nextAction('disputed')).toBeNull();
  });

  it('never moves backwards', () => {
    for (const step of ORDER_STEPS.slice(0, 6)) {
      const action = nextAction(step)!;
      expect(stepIndex(action.to)).toBe(stepIndex(step) + 1);
    }
  });

  it('puts scheduling with the dispatcher and the road with the driver', () => {
    // The whole reason the `driver` role exists.
    expect(nextAction('order_confirmed')!.side).not.toContain('driver');
    expect(nextAction('in_transit')!.side).not.toContain('driver');
    expect(nextAction('pickup_scheduled')!.side).toContain('driver');
    expect(nextAction('delivery_scheduled')!.side).toContain('driver');
  });

  it('gives the client the confirmation and nobody else', () => {
    const action = nextAction('vehicle_delivered')!;
    expect(action.side).toContain('client');
    expect(action.side).not.toContain('carrier');
    expect(action.side).not.toContain('driver');
  });

  it('says who it is waiting for, so the other side is never left guessing', () => {
    for (const step of ORDER_STEPS.slice(0, 6)) {
      expect(nextAction(step)!.waitingFor).toMatch(/\S/);
    }
  });

  it('lets only the right side press it', () => {
    const action = nextAction('vehicle_delivered');
    expect(canAct(action, 'client')).toBe(true);
    expect(canAct(action, 'carrier')).toBe(false);
    expect(canAct(action, null)).toBe(false);
    expect(canAct(null, 'client')).toBe(false);
  });
});

describe('the evidence a step is short of', () => {
  it('says nothing when a step needs none', () => {
    expect(missingEvidence(nextAction('vehicle_picked_up'), {})).toEqual([]);
  });

  it('counts what is missing, in Romanian', () => {
    const gaps = missingEvidence(nextAction('pickup_scheduled'), { pickup_photo: 2 });
    expect(gaps).toEqual(['încă 2 fotografii la ridicare', 'încă o fișa de stare']);
  });

  it('says nothing once everything is there', () => {
    expect(
      missingEvidence(nextAction('pickup_scheduled'), { pickup_photo: 4, condition_report: 1 }),
    ).toEqual([]);
  });

  it('does not complain about a surplus', () => {
    expect(
      missingEvidence(nextAction('delivery_scheduled'), {
        delivery_photo: 9,
        recipient_confirmation: 2,
      }),
    ).toEqual([]);
  });
});

describe('the timeline', () => {
  it('shows all seven steps, including the ones that have not happened', () => {
    // A timeline that lists only what has happened cannot show what has
    // not, and what has not is why somebody opened the page.
    const rows = buildTimeline('order_confirmed', []);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.state)).toEqual([
      'current', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo',
    ]);
  });

  it('marks what is done, what is now, and what is left', () => {
    const rows = buildTimeline('in_transit', [
      event({ to_status: 'pickup_scheduled' }),
      event({ id: 'e2', to_status: 'vehicle_picked_up', actor_side: 'driver' }),
    ]);
    expect(rows.map((r) => r.state)).toEqual([
      'done', 'done', 'done', 'current', 'todo', 'todo', 'todo',
    ]);
  });

  it('carries who did each step', () => {
    const rows = buildTimeline('vehicle_picked_up', [
      event({ to_status: 'vehicle_picked_up', actor_name: 'Ion Șoferul', actor_side: 'driver' }),
    ]);
    const picked = rows.find((r) => r.status === 'vehicle_picked_up')!;
    expect(picked.who).toBe('Ion Șoferul');
    expect(picked.at).toBe('2026-09-25T09:00:00Z');
  });

  it('names the side when the person has no name', () => {
    const rows = buildTimeline('order_completed', [
      event({ to_status: 'order_completed', actor_name: null, actor_side: 'system' }),
    ]);
    expect(rows.find((r) => r.status === 'order_completed')!.who).toBe('Platforma');
  });

  it('keeps the last of a step that happened twice', () => {
    // A pickup window gets moved; the row should show the time that stands.
    const rows = buildTimeline('pickup_scheduled', [
      event({ id: 'a', created_at: '2026-09-25T09:00:00Z' }),
      event({ id: 'b', created_at: '2026-09-26T09:00:00Z' }),
    ]);
    expect(rows[1]!.at).toBe('2026-09-26T09:00:00Z');
  });

  it('puts a cancelled order’s steps in the past rather than pretending it is running', () => {
    const rows = buildTimeline('cancelled', [event({ to_status: 'pickup_scheduled' })]);
    expect(rows.find((r) => r.status === 'pickup_scheduled')!.state).toBe('done');
    expect(rows.find((r) => r.status === 'in_transit')!.state).toBe('todo');
  });

  it('keeps the things that are not steps out of the run', () => {
    const events = [
      event({ to_status: 'pickup_scheduled' }),
      event({ id: 'c', to_status: 'cancelled', from_status: 'pickup_scheduled', note: 'motiv' }),
      event({
        id: 'd',
        to_status: 'pickup_scheduled',
        from_status: 'pickup_scheduled',
        note: 'Ion · CJ 01 ABC',
      }),
    ];
    const aside = asideEvents(events);
    expect(aside.map((e) => e.id)).toEqual(['c', 'd']);
  });
});

describe('the condition report', () => {
  const complete = {
    zgarieturi: 'ușoare',
    lovituri: 'fără',
    geamuri: 'fără',
    jante: 'ușoare',
    interior: 'fără',
    kilometraj: '184000',
    combustibil: '3',
    chei: 'da',
    acte: 'da',
  };

  it('asks the nine things a driver walks round the car for', () => {
    expect(CONDITION_CHECKLIST).toHaveLength(9);
    expect(CONDITION_CHECKLIST.map((i) => i.key)).toContain('kilometraj');
    expect(CONDITION_CHECKLIST.map((i) => i.key)).toContain('acte');
  });

  it('accepts a complete one', () => {
    expect(validateChecklist(complete)).toEqual({});
  });

  it('refuses a blank line', () => {
    expect(validateChecklist({ ...complete, geamuri: '  ' }).geamuri).toBeTruthy();
  });

  it('refuses a state that is not one of the three', () => {
    expect(validateChecklist({ ...complete, lovituri: 'poate' }).lovituri).toBeTruthy();
    for (const state of CONDITION_STATES) {
      expect(validateChecklist({ ...complete, lovituri: state }).lovituri).toBeUndefined();
    }
  });

  it('refuses a fuel level out of eight', () => {
    expect(validateChecklist({ ...complete, combustibil: '9' }).combustibil).toBeTruthy();
    expect(validateChecklist({ ...complete, combustibil: '0' }).combustibil).toBeUndefined();
    expect(validateChecklist({ ...complete, combustibil: '8' }).combustibil).toBeUndefined();
  });

  it('accepts a lorry that has earned its kilometres', () => {
    // A form that argues with a driver at the kerb about whether their
    // odometer is plausible is a form filled in with zeroes.
    expect(validateChecklist({ ...complete, kilometraj: '1200000' }).kilometraj).toBeUndefined();
    expect(validateChecklist({ ...complete, kilometraj: '9000000' }).kilometraj).toBeTruthy();
  });

  it('accepts a reading typed with spaces', () => {
    expect(validateChecklist({ ...complete, kilometraj: '184 000' }).kilometraj).toBeUndefined();
  });

  it('refuses anything but da or nu for the handovers', () => {
    expect(validateChecklist({ ...complete, chei: 'poate' }).chei).toBeTruthy();
    expect(validateChecklist({ ...complete, acte: 'nu' }).acte).toBeUndefined();
  });

  it('sums up only what is worth saying', () => {
    expect(summariseChecklist({ ...complete, zgarieturi: 'fără', jante: 'fără' })).toBe(
      'Fără observații',
    );
    expect(summariseChecklist(complete)).toBe('Observații: zgârieturi, jante');
  });
});

describe('the handover code', () => {
  it('is read out in two halves', () => {
    expect(formatCode('123456')).toBe('123 456');
  });

  it('shows nothing rather than a wrong thing', () => {
    expect(formatCode(null)).toBe('——— ———');
    expect(formatCode('12')).toBe('——— ———');
  });

  it('forgives the spaces people type', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode('1-2-3-4-5-6')).toBe('123456');
    expect(isCompleteCode('123 456')).toBe(true);
    expect(isCompleteCode('12345')).toBe(false);
  });

  it('stops at six digits rather than letting a seventh through', () => {
    expect(normaliseCode('1234567')).toBe('123456');
  });
});

describe('the windows and the deadline', () => {
  it('writes one day as a range of hours', () => {
    const text = formatWindow('2026-09-25T06:00:00Z', '2026-09-25T09:00:00Z');
    expect(text).toMatch(/25\.09\.2026/);
    expect(text).toMatch(/—/);
  });

  it('writes an open end as „de la"', () => {
    expect(formatWindow('2026-09-25T06:00:00Z', null)).toMatch(/^de la /);
  });

  it('says so when there is no window at all', () => {
    expect(formatWindow(null, null)).toBe('nu este programată');
  });

  it('counts the confirmation window down', () => {
    const delivered = '2026-09-25T06:00:00Z';
    const soon = confirmationDeadline(delivered, 48, new Date('2026-09-25T07:00:00Z'));
    expect(soon!.passed).toBe(false);
    expect(soon!.left).toBe('47 de ore');
  });

  it('writes Romanian plurals the Romanian way', () => {
    const at = '2026-09-25T06:00:00Z';
    expect(confirmationDeadline(at, 48, new Date('2026-09-27T05:00:00Z'))!.left).toBe('o oră');
    expect(confirmationDeadline(at, 48, new Date('2026-09-25T09:00:00Z'))!.left).toBe('45 de ore');
    expect(confirmationDeadline(at, 10, new Date('2026-09-25T13:00:00Z'))!.left).toBe('3 ore');
  });

  it('says the deadline has gone rather than counting backwards', () => {
    const past = confirmationDeadline('2026-09-25T06:00:00Z', 48, new Date('2026-09-30T06:00:00Z'));
    expect(past!.passed).toBe(true);
    expect(past!.left).toBe('termenul a trecut');
  });

  it('has no deadline before delivery', () => {
    expect(confirmationDeadline(null, 48)).toBeNull();
  });
});

describe('the list boxes', () => {
  it('defaults to what is running', () => {
    expect(parseBox(null)).toBe('active');
    expect(parseBox('ceva')).toBe('active');
    expect(parseBox('finalizate')).toBe('finalizate');
    expect(parseBox('anulate')).toBe('anulate');
  });

  it('names all three', () => {
    for (const box of ['active', 'finalizate', 'anulate'] as const) {
      expect(BOX_LABELS[box]).toMatch(/\S/);
    }
  });
});

describe('the browser and the database agree', () => {
  const migration = readFileSync(
    'supabase/migrations/20260923100100_faza2_comanda.sql',
    'utf8',
  );

  it('asks for the same number of photographs', () => {
    // `order_required_photos()` is the rule; this file states it again
    // so a form can count before somebody presses a button. Two copies
    // of a number is two chances to disagree, so they are pinned.
    const fromSql = migration.match(/order_required_photos\(\)\s*\nreturns integer[^$]*\$fn\$ select (\d+)/);
    expect(fromSql, 'order_required_photos() not found').not.toBeNull();

    const pickup = nextAction('pickup_scheduled')!.needs!.find((n) => n.kind === 'pickup_photo')!;
    const delivery = nextAction('delivery_scheduled')!.needs!.find(
      (n) => n.kind === 'delivery_photo',
    )!;
    expect(pickup.count).toBe(Number(fromSql![1]));
    expect(delivery.count).toBe(Number(fromSql![1]));
  });

  it('knows the same seven steps the transition allows', () => {
    // Every step this file offers must be a target the RPC accepts.
    for (const step of ORDER_STEPS.slice(1)) {
      expect(migration, step).toContain(`p_to = '${step}'`);
    }
  });

  it('defaults the confirmation window to what the settings table does', () => {
    expect(migration).toMatch(/auto_complete_hours integer not null default 48/);
  });
});
