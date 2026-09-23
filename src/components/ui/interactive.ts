import { cn } from '@/lib/utils';

/**
 * How anything clickable answers the pointer — one definition.
 *
 * Every motion here is a transform or an opacity, and nothing else:
 *
 *   - a card lifts by two pixels on hover and settles on press;
 *   - its raised shadow is a layer on `::before` that fades in, rather
 *     than a `box-shadow` that animates, because an animated shadow is a
 *     repaint on every frame and a faded layer is not;
 *   - a button presses in by 2% (see `buttonClasses`).
 *
 * `motion-safe:` on every movement, and the reduced-motion block in
 * globals.css takes the fades to a single frame. Colour changes — a
 * border darkening, a background tint — happen at once: they are state,
 * not motion.
 */

/** A card that is one big link. The link inside it stretches over it. */
export const CARD_INTERACTIVE = cn(
  'group relative rounded-card border border-border bg-surface shadow-card',
  // The raised shadow, as a layer that fades in.
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-card before:shadow-raised before:opacity-0 before:content-['']",
  'before:transition-opacity before:duration-(--duration-calm) before:ease-(--ease-soft)',
  'hover:border-border-strong hover:before:opacity-100',
  // The lift, and the press that undoes it.
  'transition-transform duration-(--duration-calm) ease-(--ease-soft)',
  'motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 active:before:opacity-0',
  // Keyboard: the link inside is focused, the card says so.
  'has-[a:focus-visible]:border-accent',
);

/**
 * The action drawn on a card — „Vezi cererea" — as the eye's target. It
 * is `aria-hidden` beside a stretched link, so it is a picture of a
 * button; this is what it looks like.
 */
export const CARD_ACTION =
  'rounded-input border border-accent-border px-3 py-1.5 text-small font-medium text-accent group-hover:bg-accent-subtle';
