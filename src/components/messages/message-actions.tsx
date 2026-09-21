'use client';

import { useActionState, useId, useState } from 'react';
import { reportMessageAction, type MessageState } from '@/app/cont/mesaje/actions';
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
}: {
  conversationId: string;
  /** Mesajele celeilalte părți — ale tale nu se sesizează. */
  messages: readonly { id: string; at: string }[];
}) {
  const [state, action, pending] = useActionState(reportMessageAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (messages.length === 0) return null;
  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.report}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex w-full flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3"
    >
      <label htmlFor={`${id}-message`} className="text-[0.8125rem] font-medium">
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
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
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
