import { Icon } from '@/components/ui/icon';
import { StatusBadge, type StatusTone } from '@/components/ui/primitives';
import { iconForStatus, type StatusKind } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * A company's documents, drawn as a file rather than as a table.
 *
 * The rows were a plain list with a hairline between them, which said
 * „five unrelated facts". They are one thing — the folder a dispatcher
 * opens before ringing a firm — and the drawing now says so: a single
 * rule runs down the left of the whole block, each row hangs off it at a
 * tick, and the row that needs attention is tinted rather than merely
 * labelled.
 *
 * Plate and date are mono and tabular so a column of dates lines up on
 * the decimal point of the day.
 */

export interface DocumentRow {
  /** „ITP · TM 04 EXE" — the document, and the plate when it has one. */
  label: string;
  /** Expiry, already formatted. */
  value: string;
  tone: StatusTone;
  /** The word beside the chip: „valabil", „expiră curând", „expirat". */
  state: string;
}

/** Which glyph a tone gets. Chips carry an icon and a word, never colour alone. */
const TONE_ICON: Record<StatusTone, StatusKind> = {
  success: 'valid',
  warning: 'expiring_soon',
  danger: 'expired',
  neutral: 'in_review',
};

export function DocumentFile({
  rows,
  className,
}: {
  rows: readonly DocumentRow[];
  className?: string | undefined;
}) {
  return (
    <ul className={cn('relative min-w-0 pl-4', className)}>
      {/* The spine: one rule for the whole file, stopping at the last
          tick rather than running past it into nothing. */}
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-0 top-3 w-px bg-border"
      />
      {rows.map((row) => {
        const attention = row.tone === 'warning' || row.tone === 'danger';
        return (
          <li
            key={row.label}
            className={cn(
              'relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-tight py-2.5 pl-3 pr-2',
              // The row that needs something done to it. A tint, not a
              // banner: this is a sample of a folder, not an alarm.
              attention && 'bg-warning/6',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-[-1px] top-1/2 h-px w-3 -translate-y-1/2',
                attention ? 'bg-warning/50' : 'bg-border',
              )}
            />
            {/* Label and date share a line and take what they need; the
                chip drops below them when the card is narrow. The label
                was being truncated to „Licență c…" because the chip grew
                an icon and the row divided the remainder three ways. */}
            <span className="flex min-w-0 flex-1 basis-[11rem] flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 flex-1 font-mono text-small text-muted">{row.label}</span>
              <span
                className={cn(
                  'flex-none font-mono text-small tabular-nums',
                  attention ? 'font-medium text-foreground' : 'text-foreground',
                )}
              >
                {row.value}
              </span>
            </span>
            <StatusBadge tone={row.tone} className="flex-none">
              <Icon as={iconForStatus(TONE_ICON[row.tone])} size="sm" />
              {row.state}
            </StatusBadge>
          </li>
        );
      })}
    </ul>
  );
}
