'use client';

import { useActionState } from 'react';
import {
  openToPublicAction,
  setInvitesAction,
  type VisibilityState,
} from '@/app/cont/cereri/visibility-actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { requestsCopy } from '@/content/cereri';

const EMPTY: VisibilityState = {};
const c = requestsCopy.visibility;

export interface InvitableCarrier {
  id: string;
  name: string;
  invited: boolean;
}

/**
 * Cine vede cererea, pe pagina proprietarului.
 *
 * Panoul apare numai pentru o cerere privată. Pentru una publică nu are
 * ce spune: este pe bursă, o văd toți, iar drumul înapoi nu există —
 * ceea ce butonul o spune înainte de apăsare, nu după.
 */
export function VisibilityPanel({
  requestId,
  carriers,
}: {
  requestId: string;
  /** Favoriții firmei, cu bifa pe cei deja invitați. */
  carriers: readonly InvitableCarrier[];
}) {
  const [invites, inviteAction, inviting] = useActionState(setInvitesAction, EMPTY);
  const [opened, openAction, opening] = useActionState(openToPublicAction, EMPTY);

  if (opened.notice !== undefined) return <FormNotice>{opened.notice}</FormNotice>;

  return (
    <Card className="p-5">
      <h2 className="text-[1.0625rem]">{c.title}</h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted">{c.privateLede}</p>
      <p className="mt-2">
        <HelpLink topic="privateRequests" />
      </p>

      {carriers.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{c.noFavourites}</p>
      ) : (
        <form action={inviteAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="request_id" value={requestId} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{c.invited}</legend>
            <div className="flex flex-wrap gap-1.5">
              {carriers.map((carrier) => (
                <label
                  key={carrier.id}
                  className="cursor-pointer rounded-pill border border-border px-3 py-1 text-[0.8125rem]"
                >
                  <input
                    type="checkbox"
                    name="carrier"
                    value={carrier.id}
                    defaultChecked={carrier.invited}
                    className="mr-1.5"
                  />
                  {carrier.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <button type="submit" disabled={inviting} className={buttonClasses('primary', 'sm')}>
              {c.saveInvites}
            </button>
          </div>
          {invites.notice !== undefined ? <FormNotice>{invites.notice}</FormNotice> : null}
          <FormError>{invites.error}</FormError>
        </form>
      )}

      <form action={openAction} className="mt-5 border-t border-border pt-4">
        <input type="hidden" name="request_id" value={requestId} />
        <p className="max-w-[60ch] text-[0.8125rem] text-muted">{c.openHint}</p>
        <button
          type="submit"
          disabled={opening}
          className={`${buttonClasses('secondary', 'sm')} mt-3`}
        >
          {c.openAction}
        </button>
        <FormError>{opened.error}</FormError>
      </form>
    </Card>
  );
}
