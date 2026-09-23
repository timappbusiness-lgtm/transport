/**
 * Where somebody is in a multi-step form, held in the URL.
 *
 * A step kept in `useState` is forgotten by a refresh, by the back button,
 * by a shared link and by every trip through sign-in — the person lands on
 * step one with their answers still there and no idea why. In the URL it
 * survives all of them, and the browser's own history moves between steps.
 *
 * The URL is not trusted, though. `?pas=contact` on an empty form would
 * show a contact step with nothing above it, so a requested step is only
 * honoured when every step before it is complete; otherwise the person is
 * taken to the first one that is not.
 */

/** The query parameter every stepped form uses. One name, everywhere. */
export const STEP_PARAM = 'pas';

export interface StepDefinition<S extends string> {
  /** In order. The first is where a form with no `?pas=` starts. */
  steps: readonly S[];
  /** What the URL says for each step: readable, stable, Romanian. */
  slugs: Readonly<Record<S, string>>;
}

/**
 * The step a URL asks for, or null when it asks for none or for one that
 * does not exist. Accepts the slug (`?pas=vehicul`) or the position
 * (`?pas=2`), because a person typing the address will try the number.
 */
export function parseStep<S extends string>(
  raw: string | null | undefined,
  definition: StepDefinition<S>,
): S | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === '') return null;

  if (/^\d{1,2}$/.test(value)) {
    const index = Number(value) - 1;
    return definition.steps[index] ?? null;
  }
  for (const step of definition.steps) {
    if (definition.slugs[step] === value) return step;
  }
  return null;
}

/**
 * The step to show: the one asked for, unless an earlier step is not done,
 * in which case the first step that is not. Never a step past the first
 * gap — that is the form with nothing above it.
 */
export function reachableStep<S extends string>(
  requested: S,
  steps: readonly S[],
  isComplete: (step: S) => boolean,
): S {
  const target = steps.indexOf(requested);
  if (target === -1) return steps[0]!;
  for (let index = 0; index < target; index += 1) {
    const step = steps[index]!;
    if (!isComplete(step)) return step;
  }
  return requested;
}

/**
 * The same URL with the step set, every other parameter kept — a link from
 * the price calculator carries its choices in the query, and moving to step
 * two must not throw them away. The first step is written as no parameter
 * at all, so the plain address and step one are the same page.
 */
export function withStep<S extends string>(
  search: string,
  step: S,
  definition: StepDefinition<S>,
): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (step === definition.steps[0]) params.delete(STEP_PARAM);
  else params.set(STEP_PARAM, definition.slugs[step]);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}
