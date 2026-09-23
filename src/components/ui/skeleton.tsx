import { cn } from '@/lib/utils';

/**
 * What a screen looks like while its rows are on the way.
 *
 * Shaped like the content it stands in for — a board card is a tile, two
 * lines and a button, so its skeleton is a tile, two lines and a button
 * — because a skeleton that matches the layout is one the page settles
 * into without jumping, and a spinner alone says nothing about what is
 * coming or how much of it.
 *
 * The pulse is an opacity animation, and the reduced-motion block in
 * globals.css holds it on a single frame. A screen reader hears one
 * sentence, once, instead of a dozen grey boxes.
 *
 * Only on the two boards and the account home, each in its own route
 * group. A `loading.tsx` makes everything under it stream, and a page
 * that streams has already sent its 200 when it calls `notFound()` — so
 * a missing request or a conversation that is not yours would answer
 * 200. A detail page decides its 404 first, and has no skeleton.
 */

export function Bone({ className }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-tight bg-ground-alt', className)}
    />
  );
}

/** The region a skeleton fills, announced once. */
export function SkeletonRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <div role="status" aria-busy="true" data-skeleton className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A board card: the category tile, the route, the load line, the action. */
export function CardSkeleton() {
  return (
    <li className="flex gap-3 rounded-card border border-border bg-surface p-4 shadow-card sm:gap-4 sm:p-5">
      <Bone className="h-12 w-16 flex-none rounded-input sm:h-16 sm:w-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <Bone className="h-5 w-3/5" />
          <Bone className="h-5 w-16 rounded-pill" />
        </div>
        <Bone className="h-3.5 w-4/5" />
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-6 w-28 rounded-pill" />
          <Bone className="h-8 w-24 rounded-input" />
        </div>
      </div>
    </li>
  );
}

/**
 * A board: its real heading and lede, the filter card, the list.
 *
 * The heading and the lede are the page's own words, not grey bars:
 * they are static copy, the lede is what a phone paints as its largest
 * element, and drawing it here means it is on screen at the first paint
 * instead of after the rows. They are paragraphs rather than an `<h1>`,
 * so the page never holds two headings while the rows stream in, and
 * they are hidden from a screen reader, which hears the status once.
 */
export function BoardSkeleton({
  label,
  title,
  lede,
  cards = 4,
}: {
  label: string;
  title: string;
  lede: string;
  cards?: number;
}) {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <SkeletonRegion label={label}>
        <div aria-hidden="true" className="max-w-[46rem]">
          <p className="font-display text-h1 text-balance">{title}</p>
          <p className="mt-3 text-body-lg text-muted">{lede}</p>
        </div>
        <div className="mt-8 flex flex-col gap-8">
          <div className="rounded-card border border-border bg-surface p-5 shadow-card">
            <div className="grid gap-3 sm:grid-cols-3">
              <Bone className="h-10 w-full rounded-input" />
              <Bone className="h-10 w-full rounded-input" />
              <Bone className="h-10 w-full rounded-input" />
            </div>
            <Bone className="mt-4 h-10 w-full rounded-input" />
          </div>
          <ul className="flex flex-col gap-4">
            {Array.from({ length: cards }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </ul>
        </div>
      </SkeletonRegion>
    </div>
  );
}

/** The dashboard: the „ce ai de făcut acum" block, then two widgets. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="flex flex-col gap-8">
      <Bone className="h-8 w-48" />
      <div className="flex flex-col gap-3">
        <Bone className="h-5 w-44" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Bone className="h-24 w-full rounded-card" />
          <Bone className="h-24 w-full rounded-card" />
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        <CardSkeleton />
        <CardSkeleton />
      </ul>
    </SkeletonRegion>
  );
}
