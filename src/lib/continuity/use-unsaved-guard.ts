'use client';

import { useState, type RefObject } from 'react';
import { useFormDirty } from './use-form-draft';
import { useLeaveGuard } from './use-leave-guard';

/**
 * The whole rule for a settings form, in one call: leaving with changes
 * nobody saved asks once — a tab link, another page, a reload, closing
 * the tab — and a save that worked takes the question away.
 *
 * „Worked" is the state the action returned: a notice and no error. The
 * values the form shows then are the saved ones, and the next change is
 * measured from them.
 */
export function useUnsavedGuard(
  formRef: RefObject<HTMLFormElement | null>,
  state: { notice?: string | undefined; error?: string | undefined },
): boolean {
  const { dirty, markSaved } = useFormDirty(formRef);
  useLeaveGuard(dirty);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.notice !== undefined && state.error === undefined) markSaved();
  }
  return dirty;
}
