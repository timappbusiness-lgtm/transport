import type { ReactNode } from 'react';
import type { CargoCategory } from '@/lib/departures';
import { artFor, tintFor, type ArtCategory } from '@/lib/category-art';
import { cn } from '@/lib/utils';

/**
 * A line drawing of each kind of vehicle the platform carries.
 *
 * The same family as the transporter behind the hero: inline SVG on
 * `currentColor`, two stroke weights — heavy for the body that makes the
 * silhouette, light for glazing and trim — round caps, and a soft shadow
 * so each one sits on a ground instead of floating. One detail per
 * drawing is in the accent, which is the thread that ties ten small
 * pictures to one brand.
 *
 * `currentColor` is ink on a light card and white on a dark section; the
 * accent detail switches to the accent's pale step inside
 * `[data-surface=dark]`, where the base accent would be lost. Nothing
 * here is a hex.
 *
 * Drawings, not photographs and not pictograms: nothing that could be
 * mistaken for a real customer's vehicle, and nothing that could read as
 * an official mark.
 */

const HEAVY = 2.2;
const LIGHT = 1.2;

/** The accent detail's class: base on light, pale step on dark. */
const ACCENT = 'stroke-accent in-data-[surface=dark]:stroke-accent-on-dark';
const ACCENT_FILL = 'fill-accent in-data-[surface=dark]:fill-accent-on-dark';

function Ground({ cx = 32, rx = 26 }: { cx?: number; rx?: number }) {
  return <ellipse cx={cx} cy="36" rx={rx} ry="2.2" className="fill-current" opacity="0.1" />;
}

function Wheel({ cx, cy = 31, r = 4 }: { cx: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="fill-current" />
      <circle cx={cx} cy={cy} r={r * 0.42} className={ACCENT_FILL} />
    </g>
  );
}

/** Body in the heavy weight, trim in the light one. */
function Body({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={HEAVY} />;
}
function Trim({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={LIGHT} opacity="0.7" />;
}
function Detail({ d }: { d: string }) {
  return <path d={d} fill="none" className={ACCENT} strokeWidth={LIGHT + 0.4} />;
}

const DRAWINGS: Record<ArtCategory, ReactNode> = {
  // A hatchback: the wedge, the glasshouse, a headlamp in the accent.
  autoturism: (
    <>
      <Ground />
      <Body d="M7 30v-6.5l5.5-1.6 7-7.4h17.5l8 7.2 9 1.8v6.5" />
      <Body d="M7 30h3.5M22 30h19.5M53.5 30h2.5" />
      <Trim d="M21.5 22.5l4.8-5.1h9.6l5.6 5.1zM31 17.4v5.1" />
      <Detail d="M53 25.6h2.4" />
      <Wheel cx={16} />
      <Wheel cx={47.5} />
    </>
  ),
  // A panel van: tall box, short bonnet, one window, a sliding-door line.
  autoutilitara: (
    <>
      <Ground />
      <Body d="M5 30V13.5h35.5l7.5 8 9 2V30" />
      <Body d="M5 30h4M20 30h19M51 30h6" />
      <Trim d="M40.5 13.5v9h7.2M28 15.5v13" />
      <Detail d="M55 26h2" />
      <Wheel cx={14.5} />
      <Wheel cx={45} />
    </>
  ),
  // A minibus: long, a row of windows, the door at the front.
  microbuz: (
    <>
      <Ground rx={28} />
      <Body d="M4 30V12.5h47l7 6.5v11" />
      <Body d="M4 30h4.5M19.5 30h23.5M54 30h4" />
      <Trim d="M8 15.5h8.5v6H8zM19.5 15.5H28v6h-8.5zM31 15.5h8.5v6H31zM42.5 15.5H51l5 5.5H42.5z" />
      <Detail d="M56 25h2" />
      <Wheel cx={14} />
      <Wheel cx={48.5} />
    </>
  ),
  // A motorcycle: two wheels, the fork up to the bars, tank and seat.
  motocicleta: (
    <>
      <Ground />
      <circle cx="14" cy="28" r="6.5" fill="none" stroke="currentColor" strokeWidth={HEAVY} />
      <circle cx="50" cy="28" r="6.5" fill="none" stroke="currentColor" strokeWidth={HEAVY} />
      {/* frame: rear wheel to seat, seat to tank, tank down to the engine */}
      <Body d="M14 28l7-9.5h9.5l3-3.5h8M24 28h10l4-9.5M50 28l-6-14.5" />
      {/* bars across the top of the fork, the seat pad behind the tank */}
      <Trim d="M41 13.5h6.5M20 18.5h10" />
      <Detail d="M46.5 18.2l2.2-.9" />
      <circle cx="14" cy="28" r="1.6" className={ACCENT_FILL} />
      <circle cx="50" cy="28" r="1.6" className={ACCENT_FILL} />
    </>
  ),
  // An ATV: fat wheels under fenders, a saddle, the bars on a column.
  atv_quad: (
    <>
      <Ground rx={24} />
      {/* fenders over both wheels, joined by the body */}
      <Body d="M8.5 27c0-5 3.5-8.5 7.5-8.5s7.5 3.5 7.5 8.5M39.5 27c0-5 3.5-8.5 7.5-8.5s7.5 3.5 7.5 8.5M23.5 22h16" />
      {/* the saddle and the steering column up to the bars */}
      <Body d="M22 18.5h11.5l3-3M40 22l3-9" />
      <Trim d="M40 12.5h6M26 18.5v3.5" />
      <Detail d="M53.5 21.5l2-.8" />
      <Wheel cx={16} cy={29.5} r={5.5} />
      <Wheel cx={47} cy={29.5} r={5.5} />
    </>
  ),
  // A caravan: rounded box, a window, the door, one axle and a drawbar.
  rulota: (
    <>
      <Ground cx={30} />
      <Body d="M10 29V16.5c0-3 2.5-5 5.5-5h29c3.5 0 6 2.5 6 5.5V29z" />
      <Body d="M50.5 26h7.5" />
      <Trim d="M17 16.5h12v6H17zM36 15.5h7.5V29" />
      <Detail d="M40.5 21.5h1.6" />
      <Wheel cx={29} cy={31} />
      <circle cx="58.5" cy="26" r="1.4" className="fill-current" />
    </>
  ),
  // A trailer: a flat deck with low rails, two wheels, the drawbar.
  remorca: (
    <>
      <Ground cx={28} rx={24} />
      <Body d="M6 26h40M46 26l12-3" />
      <Trim d="M6 26v-6h40v6M16 20v6M26 20v6M36 20v6" />
      <Detail d="M57.5 23.3l1.8-.5" />
      <Wheel cx={20} cy={30} r={3.6} />
      <Wheel cx={30} cy={30} r={3.6} />
    </>
  ),
  // A quadricycle: short, tall, rounded — a microcar, small wheels.
  cvadriciclu: (
    <>
      <Ground rx={20} />
      <Body d="M15 30v-8c0-5 3-9.5 9-10.5h11c5.5 0 9.5 4 10.5 9l2.5 1.5V30" />
      <Body d="M15 30h2.5M28 30h9M47.5 30h.5" />
      <Trim d="M22.5 20.5c.5-3 2.5-5.5 5.5-5.5h5.5c3 0 5 2.5 5.5 5.5z" />
      <Detail d="M46 25.5h1.8" />
      <Wheel cx={23} cy={31} r={3.6} />
      <Wheel cx={42.5} cy={31} r={3.6} />
    </>
  ),
  // A classic: long bonnet, flowing wings, a running board, spoked wheels.
  istoric: (
    <>
      <Ground rx={28} />
      <Body d="M5 29c0-4 3-6 7-6h8.5l4.5-7.5h12l5 7.5h12c4 0 6 2.5 6 6" />
      <Body d="M11 29.5c1-4 3.5-6 6.5-6M40 29.5c1-4 3.5-6 6.5-6" />
      <Trim d="M26.5 17.2h9.6l3.6 5.6H22.8zM21 29.5h19" />
      <Detail d="M58.5 25.5h1.8" />
      <g>
        <circle cx="16" cy="31" r="4.2" fill="none" stroke="currentColor" strokeWidth={HEAVY} />
        <circle cx="45" cy="31" r="4.2" fill="none" stroke="currentColor" strokeWidth={HEAVY} />
        <path d="M16 27.3v7.4M12.3 31h7.4M45 27.3v7.4M41.3 31h7.4" stroke="currentColor" strokeWidth={LIGHT} opacity="0.7" />
        <circle cx="16" cy="31" r="1.3" className={ACCENT_FILL} />
        <circle cx="45" cy="31" r="1.3" className={ACCENT_FILL} />
      </g>
    </>
  ),
  // Something else: a strapped crate on a low skid. Not a question mark
  // — the thing is real, the platform simply has no word for it.
  altele: (
    <>
      <Ground rx={20} />
      <Body d="M19 29V14h26v15z" />
      <Body d="M15 29h34" />
      <Trim d="M19 14l26 15M45 14L19 29" />
      <Detail d="M28 14v15M36 14v15" />
      <circle cx="20" cy="31.5" r="1.8" className="fill-current" />
      <circle cx="44" cy="31.5" r="1.8" className="fill-current" />
    </>
  ),
};

/**
 * The drawing on its own. Decorative by default — it sits beside the
 * category's name, which is what a screen reader should hear. Pass
 * `label` where the drawing stands alone.
 */
export function CategoryArt({
  category,
  label,
  className,
}: {
  category: CargoCategory;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const art = artFor(category);
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-category-art={art}
      className={cn('text-foreground', className)}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {DRAWINGS[art]}
    </svg>
  );
}

/**
 * The drawing on its category's soft ground: the visual anchor at the
 * leading edge of a card. The eye finds „the van" or „the caravan" in a
 * column of cards before it reads a word.
 */
const TILE_SIZE = {
  sm: { box: 'h-10 w-14', art: 'h-7 w-11' },
  md: { box: 'h-14 w-20', art: 'h-10 w-16' },
  lg: { box: 'h-20 w-28', art: 'h-14 w-22' },
  // A board card: compact on a phone, where the route needs the width,
  // and a size up from `sm` where there is room for it.
  card: { box: 'h-12 w-16 sm:h-16 sm:w-24', art: 'h-8 w-13 sm:h-11 sm:w-18' },
} as const;

export function CategoryTile({
  category,
  size = 'md',
  className,
}: {
  category: CargoCategory;
  size?: keyof typeof TILE_SIZE;
  className?: string | undefined;
}) {
  return (
    <span
      data-category-tile={artFor(category)}
      className={cn(
        'flex flex-none items-center justify-center rounded-input',
        tintFor(category),
        TILE_SIZE[size].box,
        className,
      )}
    >
      <CategoryArt category={category} className={TILE_SIZE[size].art} />
    </span>
  );
}
