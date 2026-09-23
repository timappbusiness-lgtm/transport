'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { updateCoverageAction, type ActionState } from '@/app/cont/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { CheckboxGrid } from '@/components/firma/checkbox-grid';
import { SaveBar } from '@/components/firma/save-bar';
import { COVERAGE_COUNTRIES, firmaCopy } from '@/content/firma';
import type { Company } from '@/lib/auth/account';
import { COVERAGE_SCOPES, type CoverageScope } from '@/lib/company-profile';
import { COUNTIES } from '@/lib/counties';

const EMPTY: ActionState = {};

/**
 * Where the firm carries.
 *
 * The scope is a radio because the three answers are exclusive and each
 * one changes what the rest of the form is for: a national carrier is not
 * asked to tick forty-two counties to say "everywhere", and an
 * international one is not asked which counties, because the question
 * stopped applying. The list the scope does not use is not rendered at
 * all — the trigger clears it on save either way, and a list on screen
 * that the database is about to empty is a form that lies.
 */
export function CoverageTab({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCoverageAction, EMPTY);
  const [scope, setScope] = useState<CoverageScope>(company.coverage_scope);
  const c = firmaCopy.coverage;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-h3">{c.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-medium">{c.scope}</legend>
        {COVERAGE_SCOPES.map((option) => (
          <label key={option} className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="coverageScope"
              value={option}
              checked={scope === option}
              onChange={() => setScope(option)}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              {c.scopes[option]}
              <span className="mt-0.5 block text-xs text-muted">{c.scopeHints[option]}</span>
            </span>
          </label>
        ))}
        <FormError>{state.fieldErrors?.coverageScope}</FormError>
      </fieldset>

      {scope === 'judetean' ? (
        <fieldset className="flex flex-col gap-2.5 border-t border-border pt-5">
          <legend className="mb-1 text-sm font-medium">{c.counties}</legend>
          <p className="text-xs text-muted">{c.countiesHint}</p>
          <CheckboxGrid
            name="coverageCounties"
            columns={3}
            selected={company.coverage_counties}
            options={COUNTIES.map((county) => ({ code: county.code, label: county.name }))}
          />
          <FormError>{state.fieldErrors?.coverageCounties}</FormError>
        </fieldset>
      ) : null}

      {scope === 'international' ? (
        <fieldset className="flex flex-col gap-2.5 border-t border-border pt-5">
          <legend className="mb-1 text-sm font-medium">{c.countries}</legend>
          <p className="text-xs text-muted">{c.countriesHint}</p>
          <CheckboxGrid
            name="coverageCountries"
            columns={3}
            selected={company.coverage_countries}
            options={COVERAGE_COUNTRIES.map((country) => ({
              code: country.code,
              label: country.name,
            }))}
          />
          <FormError>{state.fieldErrors?.coverageCountries}</FormError>
        </fieldset>
      ) : null}

      <SaveBar />
    </form>
  );
}
