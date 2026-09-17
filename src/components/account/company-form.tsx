'use client';

import { useActionState } from 'react';
import { updateCompanyAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { COMPANY_TYPE_LABELS, accountCopy } from '@/content/account';
import type { Company } from '@/lib/auth/account';

const EMPTY: ActionState = {};
const TYPES = ['transport', 'expeditie', 'both'] as const;

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="rounded-card border border-border bg-background px-3.5 py-2.5 font-mono text-sm text-muted">
        {value}
      </span>
    </div>
  );
}

/**
 * Identity fields are editable only while the company is a draft — the same
 * rule `guard_company_write` enforces in Postgres. Contact details stay
 * editable for good, because they change and nothing depends on them being
 * what was verified.
 */
export function CompanyForm({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCompanyAction, EMPTY);
  const c = accountCopy.company;
  const isDraft = company.verification_status === 'draft';

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <ReadOnly label={c.cui} value={company.cui} />

      {isDraft ? (
        <>
          <Field
            label={c.legalName}
            name="legalName"
            defaultValue={company.legal_name}
            error={state.fieldErrors?.legalName}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{c.type}</legend>
            {TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="companyType"
                  value={type}
                  defaultChecked={company.company_type === type}
                  className="size-4 accent-[#1C262B]"
                />
                {COMPANY_TYPE_LABELS[type]}
              </label>
            ))}
          </fieldset>
        </>
      ) : (
        <>
          <ReadOnly label={c.legalName} value={company.legal_name} />
          <ReadOnly
            label={c.type}
            value={COMPANY_TYPE_LABELS[company.company_type] ?? company.company_type}
          />
          <p className="text-xs text-muted">{c.lockedHint}</p>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c.county} name="county" required={false} defaultValue={company.county ?? ''} />
        <Field label={c.city} name="city" required={false} defaultValue={company.city ?? ''} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={c.contactEmail}
          name="contactEmail"
          type="email"
          inputMode="email"
          required={false}
          defaultValue={company.contact_email ?? ''}
        />
        <Field
          label={c.contactPhone}
          name="contactPhone"
          type="tel"
          inputMode="tel"
          required={false}
          defaultValue={company.contact_phone ?? ''}
        />
      </div>

      <SubmitButton className="sm:w-auto sm:px-8 sm:self-start">
        {accountCopy.profile.save}
      </SubmitButton>
    </form>
  );
}
