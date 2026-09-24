import { TabLink } from '@/components/ui/tab';
import { requestsCopy } from '@/content/cereri';

/**
 * A carrier's two views of the request board, and what is new on it.
 *
 * „Potrivite cu firma mea" is where the board opens for a carrier —
 * coverage, vehicle types, equipment and routes, newest first — and
 * „Toate cererile" is one click away. Both are addresses, so a shared or
 * bookmarked board opens on the view it was left on.
 *
 * The line beside them — „12 cereri noi de la ultima vizită" — is the same
 * number as the badge in the header, and absent at zero: a line that says
 * „0 cereri noi" is a line people learn to skip.
 *
 * Shared by the board and the browser-test harness, so the harness draws
 * exactly what the page does.
 */
export function BoardView({
  mine,
  mineHref,
  allHref,
  news,
}: {
  mine: boolean;
  mineHref: string;
  allHref: string;
  /** `newRequestsLine(count)`, or null at zero. */
  news: string | null;
}) {
  const c = requestsCopy.view;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label={c.label} data-board-view className="flex flex-wrap gap-2">
        <TabLink href={mineHref} active={mine} size="sm">
          {c.mine}
        </TabLink>
        <TabLink href={allHref} active={!mine} size="sm">
          {c.all}
        </TabLink>
      </nav>
      {news !== null ? (
        <p data-board-news className="text-small font-medium text-accent">
          {news}
        </p>
      ) : null}
    </div>
  );
}
