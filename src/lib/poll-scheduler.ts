/**
 * One timer, however many things are watching.
 *
 * The offer list renders a clarification thread under each offer, and
 * each of them wants to know when a new message arrives. Left to
 * themselves they each set an interval that refreshes the whole page —
 * six open threads, six identical requests every fifteen seconds, for
 * one answer. This lets them share: the timer starts with the first
 * subscriber and stops with the last.
 *
 * Free of React and of the browser, so the counting can be tested
 * without either. The component supplies the tick.
 */

type Handle = unknown;

export interface Timers {
  set: (fn: () => void, ms: number) => Handle;
  clear: (handle: Handle) => void;
}

const REAL_TIMERS: Timers = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export interface PollScheduler {
  /** Adds a listener and returns the function that removes it. */
  subscribe(tick: () => void): () => void;
  /** How many listeners are attached. For tests, and for nothing else. */
  readonly size: number;
  /** Whether the timer is currently running. Likewise. */
  readonly running: boolean;
}

export function createPollScheduler(
  intervalMs: number,
  timers: Timers = REAL_TIMERS,
  /**
   * Asked before every tick. The browser passes „is this tab in front",
   * because polling a page nobody is looking at is work nobody asked
   * for. Called lazily so a module evaluated during server rendering
   * never touches `document`.
   */
  shouldTick: () => boolean = () => true,
): PollScheduler {
  const listeners = new Set<() => void>();
  let handle: Handle = null;

  function start() {
    if (handle !== null) return;
    handle = timers.set(() => {
      if (!shouldTick()) return;
      // Copied first: a listener that unsubscribes during its own tick
      // would otherwise change the set while it is being walked.
      for (const listener of [...listeners]) listener();
    }, intervalMs);
  }

  function stop() {
    if (handle === null) return;
    timers.clear(handle);
    handle = null;
  }

  return {
    subscribe(tick) {
      listeners.add(tick);
      start();
      return () => {
        listeners.delete(tick);
        if (listeners.size === 0) stop();
      };
    },
    get size() {
      return listeners.size;
    },
    get running() {
      return handle !== null;
    },
  };
}
