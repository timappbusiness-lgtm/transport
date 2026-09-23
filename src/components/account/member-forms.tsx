'use client';

import { useActionState, useState } from 'react';
import {
  inviteMemberAction,
  transferOwnershipAction,
  type ActionState,
} from '@/app/cont/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { MEMBER_ROLE_LABELS, accountCopy } from '@/content/account';

const EMPTY: ActionState = {};
const INVITABLE_ROLES = ['admin', 'dispatcher', 'driver'] as const;

export function InviteMemberForm() {
  const [state, action] = useActionState(inviteMemberAction, EMPTY);
  const c = accountCopy.members;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field
          label={c.inviteEmail}
          name="email"
          type="email"
          inputMode="email"
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-role" className="text-sm font-medium">
            {c.inviteRole}
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue={state.values?.role ?? 'dispatcher'}
            className="rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
          >
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {MEMBER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton className="sm:w-auto sm:self-start sm:px-8">{c.inviteAction}</SubmitButton>
    </form>
  );
}

/**
 * Ownership transfer asks for a typed confirmation rather than a plain
 * "are you sure": the person doing it loses the ability to undo it.
 */
export function TransferOwnership({
  candidates,
}: {
  candidates: Array<{ userId: string; name: string }>;
}) {
  const [state, action] = useActionState(transferOwnershipAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(candidates[0]?.userId ?? '');
  const c = accountCopy.members;

  if (candidates.length === 0) return null;
  const selectedName = candidates.find((x) => x.userId === selected)?.name ?? '';

  return (
    <section className="rounded-card border border-danger/40 bg-danger/6 p-5">
      <h2 className="text-h3">{c.transfer}</h2>
      <p className="mt-1 max-w-[54ch] text-sm text-muted">{c.transferHint}</p>

      {open ? (
        <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
          <FormError>{state.error}</FormError>
          <FormNotice>{state.notice}</FormNotice>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="transfer-to" className="text-sm font-medium">
              {c.transferConfirm}
            </label>
            <select
              id="transfer-to"
              name="userId"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="max-w-sm rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body"
            >
              {candidates.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Motiv (opțional, apare în jurnalul firmei)"
            name="reason"
            required={false}
          />
          <p className="text-sm">
            Confirmi transferul către <strong>{selectedName}</strong>?
          </p>
          <div className="flex flex-wrap gap-3">
            <SubmitButton className="sm:w-auto sm:px-6">Da, transferă</SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={buttonClasses('secondary', 'md')}
            >
              Renunță
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${buttonClasses('secondary', 'sm')} mt-4`}
        >
          {c.transfer}
        </button>
      )}
    </section>
  );
}
