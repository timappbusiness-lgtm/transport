import { Badge } from './badge';
import { DISPLAY_STATUS, REQUIREMENT_STATE, documentDisplayStatus, isRequirementState } from '@/lib/documents';
import { formatDateRo } from '@/lib/format';

export interface RequirementRow {
  kind: string | null;
  label_ro: string | null;
  is_blocking: boolean | null;
  state: string | null;
  valid_until: string | null;
}

/**
 * One line per required document: what the platform holds for it now. An
 * approved document shows its display status, so "expires in 12 days" is
 * visible before it becomes a suspension.
 */
export function RequirementList({ rows }: { rows: RequirementRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Niciun document cerut.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const state = isRequirementState(r.state) ? REQUIREMENT_STATE[r.state] : null;
        const display = r.state === 'ok' ? documentDisplayStatus(r.valid_until) : null;
        // A missing optional document is not a problem; do not paint it red.
        const optionalMissing = !r.is_blocking && r.state === 'missing';
        const badge = display
          ? DISPLAY_STATUS[display]
          : optionalMissing
            ? { label: 'Neîncărcat', tone: 'neutral' as const }
            : state;
        return (
          <li key={r.kind} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.label_ro}</p>
              <p className="text-xs text-muted">
                {r.is_blocking ? 'Obligatoriu' : 'Opțional'}
                {r.valid_until ? ` · valabil până la ${formatDateRo(r.valid_until)}` : ''}
              </p>
            </div>
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
          </li>
        );
      })}
    </ul>
  );
}
