'use client';

import { useActionState, useId } from 'react';
import { exportModerationAction, type ModerationState } from '@/app/admin/anunturi/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';

const EMPTY: ModerationState = {};
const c = messagesCopy.admin.export;

/**
 * CSV-ul sesizărilor și al deciziilor de moderare.
 *
 * Se compune în bază și se descarcă din browser ca fișier local: nu
 * trece printr-un bucket și nu lasă un link care mai merge mâine. Ce
 * conține este jurnalul, care este deja auditat.
 */
export function ExportModeration() {
  const [state, action, pending] = useActionState(exportModerationAction, EMPTY);
  const id = useId();

  function download(csv: string) {
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moderare-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4">
      <p className="text-[0.9375rem] font-medium">{c.title}</p>
      <p className="mt-1 text-xs text-muted">{c.hint}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.from}
          <input
            id={`${id}-from`}
            type="date"
            name="from"
            required
            className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.to}
          <input
            id={`${id}-to`}
            type="date"
            name="to"
            required
            className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClasses('secondary', 'sm')}>
          {c.submit}
        </button>
      </div>

      {state.notice !== undefined ? (
        <button
          type="button"
          onClick={() => download(state.notice ?? '')}
          className={`${buttonClasses('primary', 'sm')} mt-3`}
        >
          {c.submit}
        </button>
      ) : null}
      <FormError>{state.error}</FormError>
    </form>
  );
}
