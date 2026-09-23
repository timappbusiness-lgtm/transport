'use client';

import { useEffect, useRef } from 'react';
import { continuityCopy } from '@/content/continuitate';
import { leavesThisPage, shouldAskBeforeLeaving } from './leave-guard';

/**
 * Asks before the page is left with changes nobody saved — once.
 *
 * Two ways out are covered: the browser's own (reload, close, typing an
 * address), through `beforeunload`, and a click on a link inside the site,
 * which the browser does not ask about because the app navigates without
 * unloading. The click is caught before the link's own handler runs, so
 * „stay" really stays.
 *
 * `dirty` false — after a successful save above all — takes the guard
 * down at once. A person who answered „leave" is not asked again on this
 * page.
 */
export function useLeaveGuard(dirty: boolean) {
  const confirmed = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!shouldAskBeforeLeaving({ dirty: true, confirmed: confirmed.current })) return;
      event.preventDefault();
      // Older browsers need a value; the text itself is never shown.
      event.returnValue = '';
    }

    function onClick(event: MouseEvent) {
      if (!shouldAskBeforeLeaving({ dirty: true, confirmed: confirmed.current })) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const leaves = leavesThisPage(
        event,
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute('download') },
        new URL(window.location.href),
      );
      if (!leaves) return;
      if (window.confirm(continuityCopy.leave.confirm)) {
        confirmed.current = true;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}
