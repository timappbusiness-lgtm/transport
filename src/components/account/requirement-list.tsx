import { StatusBadge, type StatusTone } from '@/components/ui/primitives';
import {
  DISPLAY_STATUS,
  REQUIREMENT_STATE,
  documentDisplayStatus,
  isRequirementState,
} from '@/lib/documents';
import { formatDateRo } from '@/lib/format';

export interface RequirementRow {
  kind: string | null;
  label_ro: string | null;
  is_blocking: boolean | null;
  state: string | null;
  valid_until: string | null;
}

/**
 * One line per required document: what the platform holds for it now.
 *
 * An approved document shows its display status rather than the word
 * "approved", so "expires in twelve days" is visible while it is still a
 * renewal and not yet a suspension.
 */
export function RequirementList({ rows }: { rows: RequirementRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Niciun document cerut.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const state = isRequirementState(row.state) ? REQUIREMENT_STATE[row.state] : null;
        const display = row.state === 'ok' ? documentDisplayStatus(row.valid_until) : null;
        // A missing optional document is not a problem; do not paint it red.
        const optionalMissing = !row.is_blocking && row.state === 'missing';
        const badge: { label: string; tone: StatusTone } | null = display
          ? DISPLAY_STATUS[display]
          : optionalMissing
            ? { label: 'Neîncărcat', tone: 'neutral' }
            : state;

        return (
          <li
            key={row.kind}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.label_ro}</p>
              <p className="text-xs text-muted">
                {row.is_blocking ? 'Obligatoriu' : 'Opțional'}
                {row.valid_until ? ` · valabil până la ${formatDateRo(row.valid_until)}` : ''}
              </p>
            </div>
            {badge ? <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge> : null}
          </li>
        );
      })}
    </ul>
  );
}
