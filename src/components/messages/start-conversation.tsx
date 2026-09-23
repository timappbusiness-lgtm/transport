'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { startListingConversationAction, type MessageState } from '@/app/cont/mesaje/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: MessageState = {};
const c = messagesCopy.entry;

/**
 * „Trimite mesaj", de pe o cerere sau de pe un traseu.
 *
 * Poarta se explică **înainte** de apăsare, nu după. Un buton care
 * consumă din abonament fără să spună este un buton pe care oamenii îl
 * apasă o dată și apoi nu mai au încredere în niciunul.
 *
 * Când firul există deja, sau contactul a fost deschis înainte, poarta
 * nu mai numără — `consume_contact_access()` verifică asta, iar textul
 * o spune.
 */
export function StartConversation({
  requestId,
  routeId,
  alreadyOpen,
}: {
  requestId?: string;
  routeId?: string;
  /** Adevărat când contactul pentru anunțul ăsta a fost deja deschis. */
  alreadyOpen?: boolean;
}) {
  const [state, action, pending] = useKeptActionState(startListingConversationAction, EMPTY);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  // `notice` poartă id-ul conversației la reușită.
  useEffect(() => {
    if (state.notice !== undefined && state.notice !== '') {
      router.push(`${ROUTES.accountMessages}/${state.notice}`);
    }
  }, [state.notice, router]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonClasses('secondary', 'md')}
      >
        {c.send}
      </button>
    );
  }

  return (
    <KeepingForm action={action} className="flex flex-col gap-2">
      {requestId !== undefined ? (
        <input type="hidden" name="request_id" value={requestId} />
      ) : null}
      {routeId !== undefined ? <input type="hidden" name="route_id" value={routeId} /> : null}

      <p className="max-w-[46ch] text-small text-muted">
        {alreadyOpen === true ? c.gateFree : c.gate}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {c.send}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClasses('secondary', 'md')}
        >
          Renunță
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
