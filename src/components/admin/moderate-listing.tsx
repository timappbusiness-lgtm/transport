'use client';

import { useActionState, useId, useState } from 'react';
import {
  hideListingAction,
  restoreListingAction,
  type ModerationState,
} from '@/app/admin/anunturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';

const EMPTY: ModerationState = {};
const c = messagesCopy.admin.listings;

/**
 * Ascunde sau repune un anunț, cu motiv.
 *
 * Indicația de sub casetă spune că motivul îl vede proprietarul. Este
 * cea mai utilă propoziție de pe ecranul ăsta: schimbă complet cum se
 * scrie, de la „poze proaste" la „fotografiile nu par ale vehiculului
 * din anunț".
 */
export function ModerateListing({
  requestId,
  routeId,
  hidden,
}: {
  requestId?: string;
  routeId?: string;
  hidden: boolean;
}) {
  const [state, action, pending] = useActionState(
    hidden ? restoreListingAction : hideListingAction,
    EMPTY,
  );
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline underline-offset-4 hover:text-foreground"
      >
        {hidden ? c.restore : c.hide}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3"
    >
      {requestId !== undefined ? (
        <input type="hidden" name="request_id" value={requestId} />
      ) : null}
      {routeId !== undefined ? <input type="hidden" name="route_id" value={routeId} /> : null}

      <label htmlFor={`${id}-reason`} className="text-small font-medium">
        {hidden ? c.restoreTitle : c.hideTitle}
      </label>
      {!hidden ? <p className="text-xs text-muted">{c.hideHint}</p> : null}
      <input
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      />
      <FormError>{state.fieldErrors?.reason}</FormError>

      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {hidden ? c.restoreSubmit : c.hideSubmit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          Renunță
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
