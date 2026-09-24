import { StatusBadge } from '@/components/ui/primitives';
import { kindLabel } from '@/lib/messages';

/**
 * The conversation's heading: who it is with, and what it is about.
 *
 * Its own component so the page and the layout harness draw the same one:
 * a copy of the markup in the harness kept the old version after the page
 * was fixed, and a sweep that measures a copy measures nothing.
 *
 * The name is a box of its own that may break anywhere. A firm name with
 * a 30-letter run and no spaces pushed the whole conversation 48px past a
 * phone's edge when it was a bare text node in the flex row.
 */
export function ConversationTitle({ name, kind }: { name: string | null; kind: string }) {
  return (
    <h1 className="mt-2 flex flex-wrap items-center gap-2 text-h2">
      <span className="min-w-0 [overflow-wrap:anywhere]">{name ?? '—'}</span>
      <StatusBadge tone="neutral">{kindLabel(kind)}</StatusBadge>
    </h1>
  );
}
