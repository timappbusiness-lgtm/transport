'use client';

import { continuityCopy, whenSaved } from '@/content/continuitate';
import type { DraftSaveStatus } from '@/lib/continuity/use-draft';

const c = continuityCopy.draft;

/**
 * „Salvat", discreetly, beside the button. Says where: a draft on the
 * account is on the other device too, one in the browser is not.
 * `aria-live="polite"` and nothing more — it changes on every pause in the
 * typing, and a screen reader should not read it out each time.
 */
export function DraftStatus({ status }: { status: DraftSaveStatus }) {
  return (
    <span aria-live="polite" data-draft-status={status} className="text-small text-muted">
      {status === 'saved' ? c.saved : status === 'saved-account' ? c.savedOnAccount : ''}
    </span>
  );
}

/**
 * The notice that a draft was resumed, with the way out of it. Never an
 * alert: nothing went wrong, the form is simply where it was left.
 */
export function DraftRestored({
  savedAt,
  onStartOver,
}: {
  savedAt: number;
  onStartOver: () => void;
}) {
  return (
    <div
      role="status"
      data-draft-restored=""
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-input border border-border bg-ground-alt px-3.5 py-2.5 text-small text-foreground"
    >
      <p className="min-w-0 flex-1">{c.restored(whenSaved(savedAt))}</p>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(c.startOverConfirm)) onStartOver();
        }}
        className="font-medium text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.startOver}
      </button>
    </div>
  );
}
