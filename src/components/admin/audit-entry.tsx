'use client';

import { useState } from 'react';
import { auditCopy } from '@/content/jurnal';
import { changedFields, type AuditEntry } from '@/lib/audit';

const c = auditCopy.list;

function when(value: string): string {
  return new Date(value).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/**
 * One entry, with its diff behind a toggle.
 *
 * Collapsed by default because a page of fifty open diffs is a page
 * nobody scans; the header carries what a person scans for — when, who,
 * what, on what — and the diff is one keystroke away.
 */
export function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const changes = changedFields(entry.before, entry.after);

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-sm">{entry.action}</p>
        <p className="text-xs text-muted tabular-nums">{when(entry.created_at)}</p>
      </div>

      <p className="mt-1.5 text-sm text-muted">
        {c.actor}: {entry.actor_name ?? entry.actor_user_id ?? c.system}
        {entry.actor_role === null ? '' : ` (${entry.actor_role})`}
        {entry.entity === null ? '' : ` · ${entry.entity}`}
      </p>

      {entry.entity_id === null ? null : (
        <p className="mt-0.5 break-all font-mono text-xs text-muted">{entry.entity_id}</p>
      )}

      {entry.reason === null ? null : (
        <p className="mt-2 text-sm">
          <span className="text-muted">{c.reason}: </span>
          {entry.reason}
        </p>
      )}

      {changes.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{c.noChanges}</p>
      ) : (
        <>
          <p className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
            >
              {open ? c.hide : `${c.show} (${changes.length})`}
            </button>
          </p>

          {open ? (
            /* Scrolls inside itself rather than pushing the page sideways:
               a JSON value can be longer than a phone is wide. */
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-normal">
                      {c.changes}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-normal">
                      {c.before}
                    </th>
                    <th scope="col" className="py-1 font-normal">
                      {c.after}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.field} className="border-t border-border align-top">
                      <th scope="row" className="py-1.5 pr-3 font-mono font-normal">
                        {change.field}
                      </th>
                      <td className="py-1.5 pr-3 text-muted">{change.before}</td>
                      <td className="py-1.5">{change.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
