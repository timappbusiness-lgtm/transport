'use client';

import Link from 'next/link';

import { useActionState, useId, useState } from 'react';
import { handleReportAction, type ReportAdminState } from '@/app/admin/sesizari/actions';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { reportsCopy } from '@/content/sesizari';
import {
  REPORT_KIND_LABELS,
  reportTarget,
  REPORT_STATUS_LABELS,
  reportedEntity,
  type ReportRow as Row,
} from '@/lib/reports';

const EMPTY: ReportAdminState = {};
const c = reportsCopy;

const TONES = {
  open: 'warning',
  investigating: 'neutral',
  resolved: 'success',
  dismissed: 'neutral',
} as const;

function when(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * One report, and everything that can be done to it.
 *
 * The resolution box is open whenever the report is not closed, rather
 * than appearing after a click: the sentence is mandatory before
 * „Rezolvă" does anything, and a required field that only appears once
 * you press the button is a field people meet as an error.
 */
export function ReportRow({ row }: { row: Row }) {
  const [state, action, pending] = useActionState(handleReportAction, EMPTY);
  const [open, setOpen] = useState(row.status === 'open' || row.status === 'investigating');
  const id = useId();

  const entity = reportedEntity(row);
  const closed = row.status === 'resolved' || row.status === 'dismissed';
  const target = reportTarget(row);

  return (
    <li className="rounded-card border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3">{row.reason}</h3>
          <p className="mt-1 text-xs text-muted">
            {REPORT_KIND_LABELS[row.kind]} · {c.row.opened} {when(row.created_at)}
            {closed ? ` · ${c.row.closed} ${when(row.resolved_at)}` : ''}
          </p>
          {/* Unde se duce echipa pentru felul ăsta de sesizare. O
              sesizare fără ecran (o firmă) nu are legătură — se rezolvă
              de aici. */}
          {target !== null ? (
            <p className="mt-1 text-small">
              <Link href={target.href} className="underline underline-offset-4">
                {target.label}
              </Link>
            </p>
          ) : null}
        </div>
        <StatusBadge tone={TONES[row.status]}>{REPORT_STATUS_LABELS[row.status]}</StatusBadge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{c.row.reported}</dt>
          <dd className="mt-0.5 break-words">{entity ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{c.row.reporter}</dt>
          <dd className="mt-0.5 break-words">
            {row.reporter_name ?? row.reporter_email ?? row.reporter_user_id}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{c.row.assigned}</dt>
          <dd className="mt-0.5">{row.assigned_name ?? c.row.unassigned}</dd>
        </div>
      </dl>

      {row.details !== null ? (
        <div className="mt-4">
          <p className="text-xs text-muted">{c.row.details}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{row.details}</p>
        </div>
      ) : null}

      {row.evidence_path !== null ? (
        <p className="mt-3 break-all font-mono text-xs text-muted">
          {c.row.evidence}: {row.evidence_path}
        </p>
      ) : null}

      {row.internal_notes !== null ? (
        <div className="mt-4 rounded-card border border-border bg-ground-alt p-3">
          <p className="text-xs text-muted">{c.row.notes}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{row.internal_notes}</p>
        </div>
      ) : null}

      {row.resolution !== null ? (
        <div className="mt-4">
          <p className="text-xs text-muted">{c.row.resolution}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{row.resolution}</p>
          <p className="mt-1.5 text-xs text-muted">
            {row.reporter_notified_at === null
              ? c.row.notNotified
              : `${c.row.notified} · ${when(row.reporter_notified_at)}`}
          </p>
        </div>
      ) : null}

      {closed && !open ? (
        <p className="mt-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm text-muted underline underline-offset-4"
          >
            Redeschide
          </button>
        </p>
      ) : null}

      {open ? (
        <form action={action} className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <input type="hidden" name="report_id" value={row.id} />

          <label htmlFor={`${id}-res`} className="flex flex-col gap-1.5 text-sm">
            {c.form.resolution}
            <textarea
              id={`${id}-res`}
              name="resolution"
              rows={3}
              defaultValue={row.resolution ?? ''}
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted">{c.form.resolutionHint}</span>
          </label>

          <label htmlFor={`${id}-notes`} className="flex flex-col gap-1.5 text-sm">
            {c.form.notes}
            <textarea
              id={`${id}-notes`}
              name="internal_notes"
              rows={2}
              defaultValue={row.internal_notes ?? ''}
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted">{c.row.notesHint}</span>
          </label>

          {row.assigned_to === null ? (
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="assign_to_me"
                value="yes"
                defaultChecked
                className="size-4 accent-foreground"
              />
              {c.form.take}
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="status"
              value="investigating"
              disabled={pending}
              className={buttonClasses('secondary', 'sm')}
            >
              {pending ? c.form.saving : c.form.investigating}
            </button>
            <button
              type="submit"
              name="status"
              value="resolved"
              disabled={pending}
              className={buttonClasses('primary', 'sm')}
            >
              {c.form.resolve}
            </button>
            <button
              type="submit"
              name="status"
              value="dismissed"
              disabled={pending}
              className={buttonClasses('secondary', 'sm')}
            >
              {c.form.dismiss}
            </button>
          </div>

          {state.error !== undefined ? (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.notice !== undefined ? (
            <p role="status" className="text-sm text-muted">
              {state.notice}
            </p>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}
