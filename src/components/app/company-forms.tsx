'use client';

import { useActionState, useState, useTransition } from 'react';
import { createCompany, inviteMember, lookupAnaf, transferOwnership } from '@/app/actions/company';
import { initialActionState } from '@/lib/action-state';
import { COMPANY_TYPE_LABELS, INVITABLE_ROLES, ROLE_LABELS, ROMANIAN_COUNTIES } from '@/lib/companies';
import { buttonClasses } from '@/components/ui/button';
import { Field, FormMessage, SubmitButton, inputClasses } from './forms';

export function NewCompanyForm() {
  const [state, action] = useActionState(createCompany, initialActionState);
  const [cui, setCui] = useState('');
  const [legalName, setLegalName] = useState('');
  const [lookup, setLookup] = useState<Awaited<ReturnType<typeof lookupAnaf>> | null>(null);
  const [looking, startLookup] = useTransition();

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="CUI" htmlFor="cui" error={state?.errors?.cui}>
          <input
            id="cui"
            name="cui"
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            inputMode="numeric"
            placeholder="RO14399840"
            required
            aria-invalid={Boolean(state?.errors?.cui)}
            className={inputClasses}
          />
        </Field>
        <button
          type="button"
          disabled={looking || cui.trim().length < 2}
          onClick={() =>
            startLookup(async () => {
              const result = await lookupAnaf(cui);
              setLookup(result);
              if (result.company?.legalName) setLegalName(result.company.legalName);
            })
          }
          className={buttonClasses('secondary', 'md')}
        >
          {looking ? 'Se caută…' : 'Caută la ANAF'}
        </button>
      </div>

      {lookup ? (
        lookup.ok && lookup.company ? (
          <div role="status" className="rounded-[6px] border border-border bg-foreground/5 px-3 py-2 text-sm">
            <p className="font-medium">{lookup.company.legalName}</p>
            {lookup.company.address ? <p className="text-muted">{lookup.company.address}</p> : null}
            <p className="text-muted">
              {lookup.company.regCom ? `${lookup.company.regCom} · ` : ''}
              {lookup.company.vatPayer ? 'plătitoare de TVA' : 'neplătitoare de TVA'}
            </p>
            {lookup.company.inactive || lookup.company.struckOff ? (
              <p className="mt-1 font-medium text-danger">
                ANAF raportează firma ca {lookup.company.struckOff ? 'radiată' : 'inactivă'}. Nu va putea fi verificată.
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted">{lookup.message}</p>
        )
      ) : null}

      <Field label="Denumirea firmei" htmlFor="legal_name" error={state?.errors?.legal_name}>
        <input
          id="legal_name"
          name="legal_name"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          required
          aria-invalid={Boolean(state?.errors?.legal_name)}
          className={inputClasses}
        />
      </Field>

      <Field label="Tipul firmei" htmlFor="company_type" error={state?.errors?.company_type}>
        <select id="company_type" name="company_type" required defaultValue="transport" className={inputClasses}>
          {Object.entries(COMPANY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Județ" htmlFor="county">
          <select id="county" name="county" defaultValue="" className={inputClasses}>
            <option value="">—</option>
            {ROMANIAN_COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Localitate" htmlFor="city">
          <input id="city" name="city" className={inputClasses} />
        </Field>
        <Field label="E-mail de contact" htmlFor="contact_email">
          <input id="contact_email" name="contact_email" type="email" className={inputClasses} />
        </Field>
        <Field label="Telefon de contact" htmlFor="contact_phone">
          <input id="contact_phone" name="contact_phone" type="tel" placeholder="+40…" className={inputClasses} />
        </Field>
      </div>

      <FormMessage state={state} />
      <div>
        <SubmitButton pendingLabel="Se înregistrează…">Înregistrează firma</SubmitButton>
      </div>
    </form>
  );
}

export function InviteMemberForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(inviteMember, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label="E-mail" htmlFor="invite_email">
          <input id="invite_email" name="email" type="email" required className={inputClasses} />
        </Field>
        <Field label="Rol" htmlFor="invite_role" error={state?.errors?.role}>
          <select id="invite_role" name="role" defaultValue="dispatcher" className={inputClasses}>
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" pendingLabel="Se trimite…">
          Trimite invitația
        </SubmitButton>
      </div>
    </form>
  );
}

export function TransferOwnershipForm({
  companyId,
  members,
}: {
  companyId: string;
  members: { userId: string; name: string }[];
}) {
  const [state, action] = useActionState(transferOwnership, initialActionState);
  if (members.length === 0) {
    return <p className="text-sm text-muted">Invită mai întâi persoana căreia vrei să îi predai firma.</p>;
  }
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <Field label="Noul proprietar" htmlFor="new_owner" error={state?.errors?.new_owner}>
        <select id="new_owner" name="new_owner" defaultValue="" className={inputClasses}>
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Motiv" htmlFor="transfer_reason" hint="Rămâne în istoricul firmei.">
        <input id="transfer_reason" name="reason" className={inputClasses} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1" />
        <span>Înțeleg că nu mai sunt proprietar și rămân administrator.</span>
      </label>
      {state?.errors?.confirm ? <p className="text-xs text-danger">{state.errors.confirm}</p> : null}
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="danger" size="sm" pendingLabel="Se transferă…">
          Transferă proprietatea
        </SubmitButton>
      </div>
    </form>
  );
}
