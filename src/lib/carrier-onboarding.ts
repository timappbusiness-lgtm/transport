/**
 * The company file, as steps somebody can count.
 *
 * Where a carrier stands between „I have an account" and „I can send an
 * offer" is `carrier-journey.ts` now: it knows about the vehicles and the
 * documents as well as the firm's status, which is what lets a screen
 * send somebody to the one step that is missing.
 *
 * Free of React and of Supabase.
 */

// ---------------------------------------------------------------------
// The company file, as steps somebody can count
// ---------------------------------------------------------------------

/**
 * The file, named in the order it is filled in.
 *
 * It was five tabs with no numbers on them, which is a menu rather than a
 * path: nothing on screen said how much was left. The steps are the tabs
 * — no screen was added and none was removed — with a number, and with
 * one line each saying why the question is asked. A dispatcher who is
 * given a reason fills a field in; one who is not, closes the tab.
 *
 * „Documente" is not on this list. It is its own screen, one document at
 * a time, because that is the step people do with a telephone in one hand
 * and a folder in the other.
 */
export const COMPANY_FILE_STEPS = ['identitate', 'acoperire', 'dotari', 'alerte', 'public'] as const;

export type CompanyFileStep = (typeof COMPANY_FILE_STEPS)[number];

/**
 * „Pasul 2 din 4".
 *
 * The total is the number of steps this firm actually has, not the
 * number the list can hold: a forwarder has no equipment step, and
 * telling it there are five when it will ever see four is a small lie
 * that makes the last step look broken.
 */
export function stepPosition(
  step: CompanyFileStep,
  steps: readonly CompanyFileStep[],
): { current: number; total: number } | null {
  const index = steps.indexOf(step);
  if (index < 0) return null;
  return { current: index + 1, total: steps.length };
}
