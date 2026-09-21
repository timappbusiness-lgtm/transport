import { describe, expect, it } from 'vitest';
import { createPollScheduler, type Timers } from '@/lib/poll-scheduler';

/**
 * The counting, without React and without a browser.
 *
 * What this protects is small and easy to lose: the offer list renders a
 * clarification thread under each offer, and before this each of them
 * set its own interval that refreshed the whole page. Six open threads
 * were six identical requests every fifteen seconds, for one answer.
 */

function fakeTimers() {
  const fns = new Map<number, () => void>();
  let next = 1;
  const timers: Timers = {
    set(fn) {
      const handle = next;
      next += 1;
      fns.set(handle, fn);
      return handle;
    },
    clear(handle) {
      fns.delete(handle as number);
    },
  };
  return {
    timers,
    /** Fires every live timer once. */
    tick() {
      for (const fn of [...fns.values()]) fn();
    },
    get count() {
      return fns.size;
    },
  };
}

describe('one timer, however many subscribers', () => {
  it('starts on the first and stops on the last', () => {
    const clock = fakeTimers();
    const poll = createPollScheduler(15_000, clock.timers);
    expect(poll.running).toBe(false);

    const off1 = poll.subscribe(() => {});
    const off2 = poll.subscribe(() => {});
    expect(clock.count).toBe(1);
    expect(poll.size).toBe(2);

    off1();
    expect(poll.running).toBe(true);
    off2();
    expect(poll.running).toBe(false);
    expect(clock.count).toBe(0);
  });

  it('tells every subscriber on one tick', () => {
    const clock = fakeTimers();
    const poll = createPollScheduler(15_000, clock.timers);
    let a = 0;
    let b = 0;
    poll.subscribe(() => (a += 1));
    poll.subscribe(() => (b += 1));

    clock.tick();
    expect([a, b]).toEqual([1, 1]);
    clock.tick();
    expect([a, b]).toEqual([2, 2]);
  });

  it('does not tell one that has gone', () => {
    const clock = fakeTimers();
    const poll = createPollScheduler(15_000, clock.timers);
    let gone = 0;
    let stays = 0;
    const off = poll.subscribe(() => (gone += 1));
    poll.subscribe(() => (stays += 1));

    off();
    clock.tick();
    expect(gone).toBe(0);
    expect(stays).toBe(1);
  });

  it('survives a subscriber that unsubscribes inside its own tick', () => {
    // A thread that collapses on the answer it just received does
    // exactly this, and walking a set while it changes is how that
    // becomes a crash rather than a re-render.
    const clock = fakeTimers();
    const poll = createPollScheduler(15_000, clock.timers);
    let other = 0;
    const off: (() => void)[] = [];
    off.push(poll.subscribe(() => off[0]?.()));
    poll.subscribe(() => (other += 1));

    expect(() => clock.tick()).not.toThrow();
    expect(other).toBe(1);
    expect(poll.size).toBe(1);
  });

  it('skips the tick while the page is not in front', () => {
    const clock = fakeTimers();
    let visible = false;
    const poll = createPollScheduler(15_000, clock.timers, () => visible);
    let ticks = 0;
    poll.subscribe(() => (ticks += 1));

    clock.tick();
    expect(ticks).toBe(0);

    visible = true;
    clock.tick();
    expect(ticks).toBe(1);
  });

  it('restarts after everybody has left and somebody comes back', () => {
    const clock = fakeTimers();
    const poll = createPollScheduler(15_000, clock.timers);
    poll.subscribe(() => {})();
    expect(poll.running).toBe(false);

    let ticks = 0;
    poll.subscribe(() => (ticks += 1));
    expect(poll.running).toBe(true);
    clock.tick();
    expect(ticks).toBe(1);
  });
});
