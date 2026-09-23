'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DONE_PARAM, browserStorage, clearDraft, draftKey, parseDone } from '@/lib/continuity/drafts';

/**
 * Clears the browser's copy of a draft whose form has done its job, then
 * takes `?gata=` off the address so a refresh or a shared link does not
 * carry it on. See `doneUrl`.
 */
export function DraftDone() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(DONE_PARAM);

  useEffect(() => {
    const done = parseDone(raw);
    if (raw === null) return;
    if (done !== null) clearDraft(browserStorage(), draftKey(done.form, done.scope));
    const params = new URLSearchParams(window.location.search);
    params.delete(DONE_PARAM);
    const query = params.toString();
    window.history.replaceState(null, '', `${pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`);
  }, [raw, pathname]);

  return null;
}
