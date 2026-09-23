'use client';

import { useEffect } from 'react';
import { broadcastSessionRestored } from '@/lib/continuity/session-store';

/** Tells the other tabs, once, that the session is back. Draws nothing. */
export function SessionRestored() {
  useEffect(() => {
    broadcastSessionRestored();
  }, []);
  return null;
}
