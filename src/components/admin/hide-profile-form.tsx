'use client';

import { useActionState, useId } from 'react';
import { hideCompanyProfileAction, type HideActionState } from '@/app/admin/firme/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';

const EMPTY: HideActionState = {};
const c = adminDirectoryCopy.companies;

/**
 * One row's action. The reason is required by the database, not only by
 * this form — an empty one comes back as the Romanian sentence the
 * migration raised.
 */
export function HideProfileForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(hideCompanyProfileAction, EMPTY);
  const id = useId();

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <label htmlFor={id} className="sr-only">
        {c.reason}
      </label>
      <input
        id={id}
        name="reason"
        type="text"
        required
        maxLength={200}
        placeholder={c.reasonPlaceholder}
        className="w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-[0.875rem]"
      />
      <button type="submit" className={buttonClasses('secondary', 'sm')}>
        {c.hide}
      </button>
      <FormError>{state.error}</FormError>
      {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
    </form>
  );
}
