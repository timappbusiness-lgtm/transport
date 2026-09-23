'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { DraftForm, LocalDraftForm } from './drafts';
import {
  fieldsOf,
  parseFieldValues,
  readFields,
  sameFieldValues,
  writeFields,
  type FieldValues,
} from './form-values';
import { useDraft, type DraftController } from './use-draft';

export interface FormDraftOptions {
  form: DraftForm | LocalDraftForm;
  scope?: string | undefined;
  signedIn: boolean;
  /** Field names never kept: anything the page sets rather than the person. */
  exclude?: readonly string[] | undefined;
  enabled?: boolean | undefined;
  /**
   * After a draft was written back into the fields. A form with a
   * controlled field — a select whose value is state — sets that state
   * here, or React draws the old value over the restored one.
   */
  onRestore?: ((values: FieldValues) => void) | undefined;
}

export interface FormDraftController extends Pick<DraftController<FieldValues>, 'restored' | 'status'> {
  /** Something differs from what the form showed on arrival. */
  dirty: boolean;
  /** After a successful send: both copies gone, nothing to guard. */
  clear: () => void;
  /** „Începe din nou": both copies gone and the fields back to their defaults. */
  startOver: () => void;
}

/**
 * A draft for an ordinary, uncontrolled form.
 *
 * Reads the fields on every input, keeps them with `useDraft` when they
 * differ from what the form showed on arrival, and writes a found draft
 * back into the fields. Also the source of `dirty` for `useLeaveGuard`,
 * so a form that keeps a draft and a form that only asks before leaving
 * agree on what „changed" means.
 */
export function useFormDraft(
  formRef: RefObject<HTMLFormElement | null>,
  { form, scope, signedIn, exclude, enabled = true, onRestore }: FormDraftOptions,
): FormDraftController {
  const skip = useRef(new Set(exclude ?? []));
  const initial = useRef<FieldValues | null>(null);
  const [dirty, setDirty] = useState(false);

  const draft = useDraft<FieldValues>({
    form,
    scope,
    signedIn,
    enabled,
    parse: parseFieldValues,
    onRestore: (found) => {
      const element = formRef.current;
      if (element === null) return;
      // What the form showed before the draft went into it: „changed" is
      // measured against this, not against the draft.
      initial.current ??= readFields(fieldsOf(element), skip.current);
      writeFields(fieldsOf(element), found.payload, skip.current);
      onRestore?.(found.payload);
      // Fields that only exist once the restored state is drawn — the
      // weekdays of a series appear when „repeats" is ticked — get their
      // values on the next frame, when they are there.
      requestAnimationFrame(() => {
        const node = formRef.current;
        if (node !== null) writeFields(fieldsOf(node), found.payload, skip.current);
      });
      setDirty(!sameFieldValues(readFields(fieldsOf(element), skip.current), initial.current ?? {}));
    },
  });
  const { save, clear: clearDraft } = draft;

  // What the form showed on arrival, before any draft was written into it.
  useEffect(() => {
    const element = formRef.current;
    if (element !== null && initial.current === null) {
      initial.current = readFields(fieldsOf(element), skip.current);
    }
  }, [formRef]);

  useEffect(() => {
    const element = formRef.current;
    if (element === null || !enabled) return;

    function onChange() {
      const node = formRef.current;
      if (node === null) return;
      const values = readFields(fieldsOf(node), skip.current);
      const changed = !sameFieldValues(values, initial.current ?? {});
      setDirty(changed);
      if (changed) save(values, null);
    }

    element.addEventListener('input', onChange);
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('input', onChange);
      element.removeEventListener('change', onChange);
    };
  }, [formRef, enabled, save]);

  const clear = useCallback(() => {
    clearDraft();
    const element = formRef.current;
    // What was sent is what the form now shows; changes start from here.
    initial.current = element === null ? null : readFields(fieldsOf(element), skip.current);
    setDirty(false);
  }, [clearDraft, formRef]);

  const startOver = useCallback(() => {
    clearDraft();
    formRef.current?.reset();
    const element = formRef.current;
    initial.current = element === null ? null : readFields(fieldsOf(element), skip.current);
    setDirty(false);
  }, [clearDraft, formRef]);

  return { restored: draft.restored, status: draft.status, dirty, clear, startOver };
}

/**
 * Only `dirty`, for forms that ask before leaving but keep no draft: the
 * profile tabs and settings, where a half-edited value is a change, not a
 * draft to resume.
 */
export function useFormDirty(formRef: RefObject<HTMLFormElement | null>): {
  dirty: boolean;
  markSaved: () => void;
} {
  const initial = useRef<FieldValues | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const element = formRef.current;
    if (element === null) return;
    if (initial.current === null) initial.current = readFields(fieldsOf(element));

    function onChange() {
      const node = formRef.current;
      if (node === null) return;
      setDirty(!sameFieldValues(readFields(fieldsOf(node)), initial.current ?? {}));
    }
    element.addEventListener('input', onChange);
    element.addEventListener('change', onChange);
    return () => {
      element.removeEventListener('input', onChange);
      element.removeEventListener('change', onChange);
    };
  }, [formRef]);

  const markSaved = useCallback(() => {
    const element = formRef.current;
    initial.current = element === null ? null : readFields(fieldsOf(element));
    setDirty(false);
  }, [formRef]);

  return { dirty, markSaved };
}
