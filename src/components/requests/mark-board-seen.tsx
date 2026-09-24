'use client';

import { useEffect } from 'react';
import { markBoardSeenAction } from '@/app/cereri/actions';
import { BOARD_SEEN_EVENT } from '@/lib/board-news';

/**
 * Records that a carrier has seen the board, once it is on their screen.
 *
 * Draws nothing. The header, which stays mounted between pages, hears the
 * event and drops the „new" badge at once; the saved time is what the
 * next count starts from.
 */
export function MarkBoardSeen({ renderedAt }: { renderedAt: string }) {
  useEffect(() => {
    window.dispatchEvent(new Event(BOARD_SEEN_EVENT));
    void markBoardSeenAction(renderedAt).catch(() => {
      // A lost write leaves the count where it was; the next visit tries again.
    });
  }, [renderedAt]);
  return null;
}
