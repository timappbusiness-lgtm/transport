'use client';

import { useActionState } from 'react';
import {
  createCompanyAction,
  lookupCuiAction,
  type ActionState,
  type CuiLookupState,
} from '@/app/cont/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { COMPANY_TYPE_LABELS } from '@/content/account';

const EMPTY_LOOKUP: CuiLookupState = {};
const EMPTY: ActionState = {};

const TYPES = ['transport', 'expeditie', 'both'] as const;

/**
 * Step 2 of company sign-up: CUI lookup at ANAF, then the details.
 *
 * The lookup prefills rather than locks: ANAF's record is authoritative for
 * whether the company exists and is active, but the contact details it holds
 * are often years out of date.
 */
export function CompanyCreateForm({ defaultType }: { defaultType: string }) {
  const [lookup, lookupAction] = useActionState(lookupCuiAction, EMPTY_LOOKUP);
  const [create, createAction] = useActionState(createCompanyAction, EMPTY);

  const found = lookup.company;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[1.0625rem]">Caută firma după CUI</h2>
        <p className="mt-1 text-sm text-muted">
          Verificăm la ANAF că firma există și este activă, apoi completăm ce putem.
        </p>
        <form action={lookupAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <div className="flex-1">
            <Field
              label="CUI"
              name="cui"
              inputMode="numeric"
              placeholder="RO14399840"
              defaultValue={lookup.values?.cui}
              error={lookup.fieldErrors?.cui}
            />
          </div>
          <SubmitButton className="sm:w-auto sm:px-6">Caută</SubmitButton>
        </form>
        <div className="mt-3">
          <FormError>{lookup.error}</FormError>
          {found ? <FormNotice>Firmă găsită la ANAF: {found.legalName}</FormNotice> : null}
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[1.0625rem]">Datele firmei</h2>
        <form action={createAction} className="mt-4 flex flex-col gap-4" noValidate>
          <FormError>{create.error}</FormError>

          <Field
            label="CUI"
            name="cui"
            inputMode="numeric"
            defaultValue={create.values?.cui ?? found?.cui ?? lookup.values?.cui}
            error={create.fieldErrors?.cui}
          />
          <Field
            label="Denumire"
            name="legalName"
            defaultValue={create.values?.legalName ?? found?.legalName}
            error={create.fieldErrors?.legalName}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Tip activitate</legend>
            {TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="companyType"
                  value={type}
                  defaultChecked={(create.values?.companyType ?? defaultType) === type}
                  className="size-4 accent-[#1C262B]"
                />
                {COMPANY_TYPE_LABELS[type]}
              </label>
            ))}
            {create.fieldErrors?.companyType ? (
              <p className="text-xs text-danger">{create.fieldErrors.companyType}</p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Județ" name="county" required={false} defaultValue={create.values?.county} />
            <Field label="Localitate" name="city" required={false} defaultValue={create.values?.city} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="E-mail de contact"
              name="contactEmail"
              type="email"
              inputMode="email"
              required={false}
              defaultValue={create.values?.contactEmail}
            />
            <Field
              label="Telefon de contact"
              name="contactPhone"
              type="tel"
              inputMode="tel"
              required={false}
              defaultValue={create.values?.contactPhone}
            />
          </div>

          <SubmitButton>Creează firma</SubmitButton>
        </form>
      </section>
    </div>
  );
}
