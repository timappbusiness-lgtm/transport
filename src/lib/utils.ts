import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The type scale, as tailwind-merge needs to be told about it.
 *
 * This list is not decoration. `twMerge` groups utilities so that a later
 * one beats an earlier one in the same group, and it works that out from
 * the class name. It knows `text-body` is a font size and `text-white` is a
 * colour because both are in its built-in table; it has never heard of
 * `text-h1`, so it guesses — and it guesses that `text-h1` and
 * `text-white` are the same kind of thing and keeps only the last.
 *
 * The result is silent and looks like a CSS problem. Two examples from
 * the hour this was found: the hero's `<h1>` rendered at 15px because
 * `text-white` displaced `text-display`, and the primary button on the
 * dark sections drew white text on a white pill because `text-body` from
 * the size table displaced `text-foreground` from the variant.
 *
 * So every custom step in `globals.css` is named here. A step added there
 * and not here breaks quietly in whichever component first puts it beside
 * a colour, which is why `tests/unit/design-tokens.test.ts` reads both
 * lists and fails when they disagree.
 */
export const TEXT_SCALE = [
  'display',
  'h1',
  'h2',
  'h3',
  'body-lg',
  'body',
  'small',
  'label',
  'figure-lg',
  'figure',
  'figure-sm',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': TEXT_SCALE.map((step) => `text-${step}`),
    },
  },
});

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
