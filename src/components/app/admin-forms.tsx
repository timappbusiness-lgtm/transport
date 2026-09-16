'use client';

import { useActionState } from 'react';
import { grantStaff, reviewDocument, revokeStaff } from '@/app/actions/admin';
import { initialActionState } from '@/lib/action-state';
import { Field, FormMessage, SubmitButton, inputClasses } from './forms';

export function ReviewForm({
  documentId,
  suggestedValidUntil,
  needsExpiry,
}: {
  documentId: string;
  suggestedValidUntil: string | null;
  needsExpiry: boolean;
}) {
  const [state, action] = useActionState(reviewDocument, initialActionState);
  if (state?.ok) return <FormMessage state={state} />;

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="document_id" value={documentId} />
      {needsExpiry ? (
        <Field
          label="Valabil până la"
          htmlFor={`valid_until-${documentId}`}
          hint={suggestedValidUntil ? 'Completat din citirea automată. Verifică pe document.' : 'Citește data de pe document.'}
          error={state?.errors?.valid_until}
        >
          <input
            id={`valid_until-${documentId}`}
            name="valid_until"
            type="date"
            defaultValue={suggestedValidUntil ?? ''}
            className={`${inputClasses} max-w-[220px]`}
          />
        </Field>
      ) : null}
      <Field label="Motiv, dacă respingi" htmlFor={`reason-${documentId}`} error={state?.errors?.rejection_reason}>
        <input id={`reason-${documentId}`} name="rejection_reason" className={inputClasses} placeholder="ex. poliță ilizibilă, altă firmă pe document" />
      </Field>
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" name="decision" value="approve" pendingLabel="Se salvează…">
          Aprobă
        </SubmitButton>
        <SubmitButton size="sm" variant="danger" name="decision" value="reject" pendingLabel="Se salvează…">
          Respinge
        </SubmitButton>
      </div>
    </form>
  );
}

export function GrantStaffForm() {
  const [state, action] = useActionState(grantStaff, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mailul contului" htmlFor="staff_email" error={state?.errors?.email}>
          <input id="staff_email" name="email" type="email" required className={inputClasses} />
        </Field>
        <Field label="Motiv" htmlFor="staff_reason" error={state?.errors?.reason}>
          <input id="staff_reason" name="reason" required className={inputClasses} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" pendingLabel="Se acordă…">
          Acordă acces de administrare
        </SubmitButton>
      </div>
    </form>
  );
}

export function RevokeStaffForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(revokeStaff, initialActionState);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <label htmlFor={`revoke-${userId}`} className="sr-only">
        Motiv
      </label>
      <input id={`revoke-${userId}`} name="reason" placeholder="Motiv" className={`${inputClasses} w-44 py-1.5`} />
      <SubmitButton size="sm" variant="danger" pendingLabel="…">
        Retrage
      </SubmitButton>
      {state?.errors?.reason ? <p className="w-full text-xs text-danger">{state.errors.reason}</p> : null}
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
