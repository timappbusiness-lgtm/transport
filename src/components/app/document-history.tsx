import { Badge, type Tone } from './badge';
import { DISPLAY_STATUS, DOCUMENT_STATUS_LABELS, documentDisplayStatus } from '@/lib/documents';
import { formatDateRo } from '@/lib/format';
import type { Database } from '@/lib/supabase/database.types';

type DocumentStatus = Database['public']['Enums']['document_status'];

export interface HistoryRow {
  id: string;
  kind: string;
  status: DocumentStatus;
  valid_until: string | null;
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_TONE: Record<DocumentStatus, Tone> = {
  uploaded: 'neutral',
  parsing: 'neutral',
  pending: 'neutral',
  approved: 'ok',
  rejected: 'danger',
  expired: 'danger',
  replaced: 'neutral',
};

export function DocumentHistory({ rows, labels }: { rows: HistoryRow[]; labels: Record<string, string> }) {
  if (rows.length === 0) return <p className="text-sm text-muted">Niciun document încărcat încă.</p>;
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Document</th>
            <th scope="col" className="py-2 pr-3 font-medium">Încărcat</th>
            <th scope="col" className="py-2 pr-3 font-medium">Valabil până la</th>
            <th scope="col" className="py-2 font-medium">Stare</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((d) => {
            const display = d.status === 'approved' ? documentDisplayStatus(d.valid_until) : null;
            return (
              <tr key={d.id}>
                <td className="py-2.5 pr-3">
                  {labels[d.kind] ?? d.kind}
                  {d.status === 'rejected' && d.rejection_reason ? (
                    <span className="block text-xs text-danger">Motiv: {d.rejection_reason}</span>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{formatDateRo(d.created_at)}</td>
                <td className="py-2.5 pr-3 font-mono text-xs tabular-nums">{formatDateRo(d.valid_until)}</td>
                <td className="py-2.5">
                  {display ? (
                    <Badge tone={DISPLAY_STATUS[display].tone}>{DISPLAY_STATUS[display].label}</Badge>
                  ) : (
                    <Badge tone={STATUS_TONE[d.status]}>{DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
