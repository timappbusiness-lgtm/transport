'use client';

import { useActionState, useState } from 'react';
import { saveOnboardingProfileAction, type OnboardingState } from '@/app/admin/inscrieri/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { firmaCopy } from '@/content/firma';
import { onboardingCopy } from '@/content/inscrieri';
import { COVERAGE_SCOPES } from '@/lib/company-profile';
import { COUNTIES } from '@/lib/counties';
import { cn } from '@/lib/utils';

const EMPTY: OnboardingState = {};
const c = onboardingCopy.wizard.profile;
const scopes = firmaCopy.coverage.scopes;

/**
 * Acoperirea și dotările.
 *
 * Județele apar numai pe „câteva județe": pe național sau internațional
 * nu înseamnă nimic să le alegi, iar o listă de patruzeci și doi de
 * itemi care nu contează este o listă pe care cineva o bifează oricum.
 */
export function ProfileStep({
  onboardingId,
  companyId,
  services,
  equipment,
}: {
  onboardingId: string;
  companyId: string;
  services?: readonly { code: string; label: string }[];
  equipment?: readonly { code: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveOnboardingProfileAction, EMPTY);
  const [scope, setScope] = useState('national');

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="onboarding_id" value={onboardingId} />
      <input type="hidden" name="company_id" value={companyId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium">{c.scope}</legend>
        <div className="flex flex-wrap gap-2">
          {COVERAGE_SCOPES.map((option) => (
            <label
              key={option}
              className={cn(
                'cursor-pointer rounded-pill border px-3.5 py-1.5 text-small',
                // The radio is hidden, so the pill carries its focus ring.
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-foreground',
                scope === option
                  ? 'border-transparent bg-accent text-on-accent'
                  : 'border-border-strong text-muted hover:border-accent-border hover:bg-accent-subtle',
              )}
            >
              <input
                type="radio"
                name="coverage_scope"
                value={option}
                checked={scope === option}
                onChange={() => setScope(option)}
                className="sr-only"
              />
              {scopes[option] ?? option}
            </label>
          ))}
        </div>
      </fieldset>

      {scope === 'judetean' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium">{c.counties}</legend>
          <div className="flex flex-wrap gap-1.5">
            {COUNTIES.map((county) => (
              <label
                key={county.code}
                className="cursor-pointer rounded-pill border border-border px-2.5 py-1 text-small"
              >
                <input type="checkbox" name="counties" value={county.code} className="mr-1.5" />
                {county.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {services !== undefined && services.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium">{c.services}</legend>
          <div className="flex flex-wrap gap-1.5">
            {services.map((option) => (
              <label
                key={option.code}
                className="cursor-pointer rounded-pill border border-border px-2.5 py-1 text-small"
              >
                <input type="checkbox" name="services" value={option.code} className="mr-1.5" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {equipment !== undefined && equipment.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-body font-medium">{c.equipment}</legend>
          <div className="flex flex-wrap gap-1.5">
            {equipment.map((option) => (
              <label
                key={option.code}
                className="cursor-pointer rounded-pill border border-border px-2.5 py-1 text-small"
              >
                <input type="checkbox" name="equipment" value={option.code} className="mr-1.5" />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {c.submit}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
