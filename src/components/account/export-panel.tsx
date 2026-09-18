'use client';

import { useState, useTransition } from 'react';
import { requestExportAction } from '@/app/cont/setari/date-personale/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { personalDataCopy } from '@/content/date-personale';
import type { ExportRequest } from '@/lib/account-deletion-source';

const c = personalDataCopy.export;

export interface ExportPanelProps {
  /** The last archive asked for, so a page reload still offers its link. */
  latest: ExportRequest | null;
}

/**
 * „Descarcă datele mele".
 *
 * The link appears once and is not stored anywhere the browser will keep
 * it: the token lives in this component's state for as long as the page
 * is open, and the row behind it is what makes the link single-use. A
 * person who closes the tab asks again tomorrow, which is the intended
 * cost of a link that hands over everything we know about them.
 */
export function ExportPanel({ latest }: ExportPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const [link, setLink] = useState<string | null>(
    latest !== null && latest.status === 'ready'
      ? `${ROUTES.accountPersonalData}/descarca/${latest.id}?t=${latest.download_token}`
      : null,
  );

  function onClick(): void {
    setError(undefined);
    startTransition(async () => {
      const state = await requestExportAction();
      if (state.error !== undefined) {
        setError(state.error);
        setLink(null);
        return;
      }
      if (state.download !== undefined) {
        setLink(
          `${ROUTES.accountPersonalData}/descarca/${state.download.id}?t=${state.download.token}`,
        );
      }
    });
  }

  return (
    <section
      aria-labelledby="export"
      className="rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id="export" className="text-[1.0625rem]">
        {c.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.body}</p>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.note}</p>
      <p className="mt-2 max-w-[62ch] text-xs text-muted">{c.noFiles}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className={buttonClasses('secondary', 'sm')}
        >
          {pending ? c.pending : c.button}
        </button>
        {link !== null ? (
          <a href={link} download className={buttonClasses('primary', 'sm')}>
            {c.download}
          </a>
        ) : null}
      </div>

      {link !== null ? (
        <div className="mt-3">
          <FormNotice>{c.ready}</FormNotice>
        </div>
      ) : null}
      {error !== undefined ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </section>
  );
}
