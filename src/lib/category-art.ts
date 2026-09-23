import type { CargoCategory } from './departures';
import { OFFERED_CATEGORIES, RETIRED_CATEGORIES } from './vehicle-categories';

/**
 * Which drawing and which soft ground each vehicle category gets.
 *
 * Two tables and one fallback, all here, so a category cannot end up with
 * a drawing and no tint or a tint and no drawing. The drawings themselves
 * are in `src/components/ui/category-art.tsx`; this file only says which
 * is which, so it can be tested without React.
 *
 * Six tint families for ten categories: the eye groups „things with four
 * seats", „things on two wheels", „things that are towed" before it reads
 * a label, and ten distinct pastels would be a board of noise. The warm
 * families — sand, clay, sage — sit on the things people are most attached
 * to: the caravan, the classic, the motorcycle.
 */

/** Every category the platform offers has exactly one drawing. */
export const CATEGORY_ART = [
  'autoturism',
  'autoutilitara',
  'microbuz',
  'motocicleta',
  'atv_quad',
  'rulota',
  'remorca',
  'cvadriciclu',
  'istoric',
  'altele',
] as const satisfies readonly CargoCategory[];

export type ArtCategory = (typeof CATEGORY_ART)[number];

export type TintFamily = 'petrol' | 'sand' | 'sage' | 'sky' | 'clay' | 'stone';

export const CATEGORY_TINT: Record<ArtCategory, TintFamily> = {
  autoturism: 'petrol',
  autoutilitara: 'sky',
  microbuz: 'sky',
  motocicleta: 'clay',
  atv_quad: 'sage',
  rulota: 'sand',
  remorca: 'stone',
  cvadriciclu: 'sage',
  istoric: 'sand',
  altele: 'stone',
};

/**
 * The tint as a class, written out in full so Tailwind can see it.
 *
 * A class assembled from `bg-tint-${family}` is a class the compiler
 * never finds, and the card would render on nothing.
 */
export const TINT_CLASS: Record<TintFamily, string> = {
  petrol: 'bg-tint-petrol',
  sand: 'bg-tint-sand',
  sage: 'bg-tint-sage',
  sky: 'bg-tint-sky',
  clay: 'bg-tint-clay',
  stone: 'bg-tint-stone',
};

/**
 * The drawing a category is shown with.
 *
 * A retired category — a lorry, a boat, a tractor unit — is still a real
 * listing and still renders; it gets „altceva", the drawing for a thing
 * the platform does not name. It never gets a drawing of a lorry, because
 * that would be the platform advertising a niche it has left.
 */
export function artFor(category: CargoCategory): ArtCategory {
  return (CATEGORY_ART as readonly string[]).includes(category)
    ? (category as ArtCategory)
    : 'altele';
}

export function tintFor(category: CargoCategory): string {
  return TINT_CLASS[CATEGORY_TINT[artFor(category)]];
}

/** For the tests: the two lists this map must agree with. */
export const CATEGORY_LISTS = { offered: OFFERED_CATEGORIES, retired: RETIRED_CATEGORIES };
