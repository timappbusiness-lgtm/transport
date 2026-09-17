/**
 * The handful of glyphs the design draws by hand. Decorative: every one is
 * aria-hidden and sits next to text that carries the meaning.
 */

type IconProps = { className?: string; size?: number };

export function ArrowRight({ className, size = 15 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RouteArrow({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
      <path d="M0 5h13M10 1.5 13.5 5 10 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ className, size = 12 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Warning({ className }: IconProps) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5 13 12H1L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5.8v2.6M7 10.1v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Car({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 34 22" fill="none" aria-hidden="true">
      <path d="M4 15h26M6.5 15V11l3.5-4.5h13L27 11v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="11" cy="17.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="23" cy="17.5" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Two cars stacked on a platform over a road line — the brand mark.
 *
 * Every stroke is `currentColor`, so it works on the dark header bar and on
 * a light surface without a second variant. It used to name colour tokens
 * directly, which made it invisible the moment it sat on a dark ground.
 */
export function BrandMark({ className }: IconProps) {
  return (
    <svg className={className} width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M2.5 23h21" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <path d="M2.5 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 18.5h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 9.5h20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 9.5V6.5l2.5-3h8l2.5 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6 18.5v-3l2.5-3h8l2.5 3v3" stroke="currentColor" strokeOpacity=".6" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
