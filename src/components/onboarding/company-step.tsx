'use client';

import {
  createOnboardingCompanyAction,
  type OnboardingState,
} from '@/app/admin/inscrieri/actions';
import { lookupCuiFormAction, type CuiLookupState } from '@/app/cont/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { COUNTIES, countyCodeFor } from '@/lib/counties';
import { COMPANY_TYPE_LABELS } from '@/lib/directory';
import { onboardingCopy } from '@/content/inscrieri';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OnboardingState = {};
const EMPTY_LOOKUP: CuiLookupState = {};
const c = onboardingCopy.wizard.company;
const FIELD =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-body font-normal';

/**
 * Datele firmei, cu aceeași căutare la ANAF ca la înscrierea obișnuită.
 *
 * `lookupCuiAction` este reutilizată întreagă, nu copiată: ecranul
 * acesta nu are voie să accepte un CUI pe care formularul obișnuit
 * l-ar refuza, iar cea mai sigură cale ca asta să rămână adevărat este
 * să fie aceeași funcție.
 */
export function CompanyStep({ onboardingId }: { onboardingId: string }) {
  const [lookup, lookupAction, looking] = useKeptActionState(lookupCuiFormAction, EMPTY_LOOKUP);
  const [state, action, pending] = useKeptActionState(createOnboardingCompanyAction, EMPTY);
  const found = lookup.company;

  return (
    <div className="flex flex-col gap-5">
      <KeepingForm action={lookupAction} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.cui}
          <input
            name="cui"
            required
            defaultValue={lookup.values?.cui ?? ''}
            className={FIELD}
            inputMode="numeric"
          />
        </label>
        <button type="submit" disabled={looking} className={buttonClasses('secondary', 'md')}>
          {c.lookup}
        </button>
        <FormError>{lookup.fieldErrors?.cui}</FormError>
        <FormError>{lookup.error}</FormError>
        <FormError>{lookup.warning}</FormError>
      </KeepingForm>

      {/* `key` on the found CUI: a second lookup has to redraw the
          fields with the new firm's details rather than keep the first
          one's, and a remount is the honest way to do that. */}
      <KeepingForm key={found?.cui ?? 'gol'} action={action} className="flex flex-col gap-4">
        <input type="hidden" name="onboarding_id" value={onboardingId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.cui}
            <input
              name="cui"
              required
              defaultValue={found?.cui ?? lookup.values?.cui ?? ''}
              className={FIELD}
            />
            <FormError>{state.fieldErrors?.cui}</FormError>
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.legalName}
            <input
              name="legal_name"
              required
              defaultValue={found?.legalName ?? ''}
              className={FIELD}
            />
            <FormError>{state.fieldErrors?.legal_name}</FormError>
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.type}
            <select name="company_type" required defaultValue="" className={FIELD}>
              <option value="" disabled>
                Alege
              </option>
              {Object.entries(COMPANY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FormError>{state.fieldErrors?.company_type}</FormError>
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.county}
            <select name="county" defaultValue={countyCodeFor(found?.county) ?? ''} className={FIELD}>
              <option value="">—</option>
              {COUNTIES.map((county) => (
                <option key={county.code} value={county.code}>
                  {county.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.city}
            <input name="city" defaultValue={found?.city ?? ''} className={FIELD} />
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.contactEmail}
            <input type="email" name="contact_email" className={FIELD} />
          </label>

          <label className="flex flex-col gap-1.5 text-body font-medium">
            {c.contactPhone}
            <input name="contact_phone" className={FIELD} />
          </label>
        </div>

        <p className="text-small text-muted">{c.contactHint}</p>

        <div>
          <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
            {c.submit}
          </button>
        </div>
        <FormError>{state.error}</FormError>
      </KeepingForm>
    </div>
  );
}
