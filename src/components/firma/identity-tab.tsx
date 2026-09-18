'use client';

import { useActionState } from 'react';
import { updateCompanyIdentityAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError, FormNotice } from '@/components/auth/form';
import { SaveBar } from '@/components/firma/save-bar';
import { COMPANY_TYPE_LABELS, accountCopy } from '@/content/account';
import { firmaCopy } from '@/content/firma';
import type { Company } from '@/lib/auth/account';
import { COUNTIES } from '@/lib/counties';

const EMPTY: ActionState = {};
const TYPES = ['transport', 'expeditie', 'both'] as const;

function ReadOnly({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="rounded-card border border-border bg-background px-3.5 py-2.5 font-mono text-sm text-muted">
        {value}
      </span>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Who the firm is and how it is reached.
 *
 * The identity fields come from ANAF and are frozen once the company is
 * verified — the same rule `guard_company_write` enforces, shown here as a
 * read-only box rather than an input that would fail on save.
 *
 * The street address is on this tab and never on the public one: it is
 * needed for invoices and it is nobody else's business. `base_address_hidden`
 * is the one control that changes what the public profile says, which is
 * why it sits under the address it is about rather than on the public tab.
 */
export function IdentityTab({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCompanyIdentityAction, EMPTY);
  const c = firmaCopy.identity;
  const isDraft = company.verification_status === 'draft';

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-[1.0625rem]">{c.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <ReadOnly label={accountCopy.company.cui} value={company.cui} />

      {isDraft ? (
        <>
          <Field
            label={accountCopy.company.legalName}
            name="legalName"
            defaultValue={company.legal_name}
            error={state.fieldErrors?.legalName}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{accountCopy.company.type}</legend>
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
            <FormError>{state.fieldErrors?.companyType}</FormError>
          </fieldset>
        </>
      ) : (
        <>
          <ReadOnly label={accountCopy.company.legalName} value={company.legal_name} />
          <ReadOnly
            label={accountCopy.company.type}
            value={COMPANY_TYPE_LABELS[company.company_type] ?? company.company_type}
            hint={accountCopy.company.lockedHint}
          />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={c.contactPhone}
          name="contactPhone"
          type="tel"
          inputMode="tel"
          required={false}
          hint={c.contactPhoneHint}
          defaultValue={company.contact_phone ?? ''}
          error={state.fieldErrors?.contactPhone}
        />
        <Field
          label={c.contactEmail}
          name="contactEmail"
          type="email"
          inputMode="email"
          required={false}
          hint={c.contactEmailHint}
          defaultValue={company.contact_email ?? ''}
          error={state.fieldErrors?.contactEmail}
        />
      </div>

      <Field
        label={c.website}
        name="website"
        type="url"
        required={false}
        hint={c.websiteHint}
        placeholder="https://firma.ro"
        defaultValue={company.website ?? ''}
        error={state.fieldErrors?.website}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-county" className="text-sm font-medium">
            {c.county}
          </label>
          <select
            id="field-county"
            name="county"
            defaultValue={company.county ?? ''}
            className="rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem]"
          >
            <option value="">—</option>
            {COUNTIES.map((county) => (
              <option key={county.code} value={county.name}>
                {county.name}
              </option>
            ))}
          </select>
        </div>
        <Field label={c.city} name="city" required={false} defaultValue={company.city ?? ''} />
      </div>

      <Field
        label={c.address}
        name="address"
        required={false}
        hint={c.addressHint}
        defaultValue={company.address ?? ''}
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="baseAddressHidden"
          defaultChecked={company.base_address_hidden}
          className="mt-0.5 size-4 accent-[#1C262B]"
        />
        <span>
          {c.hideAddress}
          <span className="mt-1 block text-xs text-muted">{c.hideAddressHint}</span>
        </span>
      </label>

      <SaveBar />
    </form>
  );
}
