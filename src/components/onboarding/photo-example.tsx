/**
 * What a usable photograph of a document looks like.
 *
 * Drawn rather than photographed, for two reasons: a real photograph of
 * a real licence is somebody's data, and a drawing can show the one
 * thing that matters — all four corners inside the frame — without any.
 *
 * Every value is a token. `aria-label` carries the meaning, because the
 * drawing is the instruction and not decoration beside one.
 */
export function PhotoExample({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="Document fotografiat pe o masă, cu toate cele patru colțuri în cadru"
      className={className}
    >
      {/* The table. */}
      <rect x="0" y="0" width="320" height="180" rx="10" className="fill-ground-alt" />

      {/* The sheet, slightly turned, the way a document lies on a table. */}
      <g transform="rotate(-3 160 92)">
        <rect
          x="74"
          y="30"
          width="172"
          height="124"
          rx="4"
          className="fill-surface stroke-border-strong"
          strokeWidth="1.5"
        />
        {/* Writing, as rules. Nothing legible: it is not a real document. */}
        <rect x="90" y="48" width="78" height="7" rx="2" className="fill-ink-soft" />
        <rect x="90" y="68" width="140" height="5" rx="2" className="fill-border-strong" />
        <rect x="90" y="82" width="140" height="5" rx="2" className="fill-border-strong" />
        <rect x="90" y="96" width="108" height="5" rx="2" className="fill-border-strong" />
        <rect x="90" y="124" width="60" height="16" rx="3" className="fill-border" />
      </g>

      {/* The viewfinder: four corners, well outside the sheet, which is
          the whole instruction — leave room around it. */}
      {[
        [40, 16, 1, 1],
        [280, 16, -1, 1],
        [40, 164, 1, -1],
        [280, 164, -1, -1],
      ].map(([x, y, dx, dy]) => (
        <path
          key={`${x}-${y}`}
          d={`M ${x! + dx! * 22} ${y} H ${x} V ${y! + dy! * 22}`}
          className="stroke-accent"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </svg>
  );
}
