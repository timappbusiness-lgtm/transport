'use client';

import { useActionState, useId, useState } from 'react';
import {
  blockSenderAction,
  reportMessageAction,
  unblockSenderAction,
  type MessageState,
} from '@/app/cont/mesaje/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';

const EMPTY: MessageState = {};
const c = messagesCopy.actions;

/**
 * Sesizarea unui mesaj, din firul lui.
 *
 * Textul spune că o sesizare este singurul motiv pentru care citim
 * conversația. Asta nu este o formulă de politețe: este regula din
 * `staff_may_read_conversation()`, și oamenii merită să știe ce
 * declanșează înainte să apese.
 */
export function MessageActions({
  conversationId,
  messages,
  counterpartyUserId = null,
  blockId = null,
}: {
  conversationId: string;
  /** Mesajele celeilalte părți — ale tale nu se sesizează. */
  messages: readonly { id: string; at: string }[];
  /** Cine este de partea cealaltă. Null pe un fir de comandă cu mai mulți. */
  counterpartyUserId?: string | null;
  /** Blocarea existentă pe contul ăla, dacă există. */
  blockId?: string | null;
}) {
  const [state, action, pending] = useActionState(reportMessageAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-muted underline underline-offset-4 hover:text-foreground"
          >
            {c.report}
          </button>
        ) : null}
        {counterpartyUserId !== null ? (
          <Block userId={counterpartyUserId} blockId={blockId} />
        ) : null}
      </span>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex w-full flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3"
    >
      <label htmlFor={`${id}-message`} className="text-small font-medium">
        {c.reportTitle}
      </label>
      <select
        id={`${id}-message`}
        name="message_id"
        required
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      >
        {messages.map((m) => (
          <option key={m.id} value={m.id}>
            {new Date(m.at).toLocaleString('ro-RO')}
          </option>
        ))}
      </select>

      <p className="text-xs text-muted">{c.reportHint}</p>
      <textarea
        name="reason"
        rows={3}
        required
        minLength={10}
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      />
      <FormError>{state.fieldErrors?.reason}</FormError>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.reportSubmit}
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
      <input type="hidden" name="conversation_id" value={conversationId} />
    </form>
  );
}

/**
 * Blocarea, spusă cu ce nu face.
 *
 * „Nu mai poate deschide conversații noi cu tine de pe anunțuri. Firele
 * comenzilor în curs rămân deschise" — regula este în
 * `guard_conversation_insert()`, care refuză numai firele de pe anunț.
 * Un om care blochează crede de obicei că a tăiat tot; dacă află abia
 * din primul mesaj de pe o comandă că nu e așa, crede că blocarea nu a
 * funcționat.
 */
function Block({ userId, blockId }: { userId: string; blockId: string | null }) {
  const [state, action, pending] = useActionState(
    blockId === null ? blockSenderAction : unblockSenderAction,
    EMPTY,
  );
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (blockId !== null) {
    return (
      <form action={action} className="inline">
        <input type="hidden" name="block_id" value={blockId} />
        <button
          type="submit"
          disabled={pending}
          className="text-muted underline underline-offset-4 hover:text-foreground"
        >
          {c.unblock}
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.block}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex w-full flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3"
    >
      <input type="hidden" name="user_id" value={userId} />
      <p className="text-small font-medium">{c.blockTitle}</p>
      <p className="max-w-[52ch] text-xs text-muted">{c.blockHint}</p>

      <label htmlFor={`${id}-reason`} className="sr-only">
        {c.blockTitle}
      </label>
      <input
        id={`${id}-reason`}
        name="reason"
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.blockSubmit}
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
