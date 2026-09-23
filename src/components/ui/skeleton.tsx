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

/** A board: the title, the filter card with its three fields, the list. */
export function BoardSkeleton({ label, cards = 4 }: { label: string; cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <SkeletonRegion label={label}>
        <Bone className="h-10 w-72 max-w-full" />
        <Bone className="mt-4 h-4 w-96 max-w-full" />
        <div className="mt-8 rounded-card border border-border bg-surface p-5 shadow-card">
          <div className="grid gap-3 sm:grid-cols-3">
            <Bone className="h-10 w-full rounded-input" />
            <Bone className="h-10 w-full rounded-input" />
            <Bone className="h-10 w-full rounded-input" />
          </div>
          <Bone className="mt-4 h-10 w-full rounded-input" />
        </div>
        <ul className="mt-8 flex flex-col gap-4">
          {Array.from({ length: cards }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </ul>
      </SkeletonRegion>
    </div>
  );
}

/** A detail page: the title, a block of facts, the side panel. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <SkeletonRegion label={label}>
        <Bone className="h-4 w-32" />
        <Bone className="mt-6 h-10 w-4/5" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex justify-between gap-4">
                <Bone className="h-4 w-28" />
                <Bone className="h-4 w-40" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
            <Bone className="h-5 w-40" />
            <Bone className="h-4 w-full" />
            <Bone className="h-10 w-full rounded-pill" />
          </div>
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
