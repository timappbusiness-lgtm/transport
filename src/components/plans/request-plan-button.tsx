'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { requestSubscriptionAction, type RequestState } from '@/app/abonamente/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { plansCopy } from '@/content/plans';
import {
  formatLei,
  priceAt,
  totalLabel,
  type BillingMonths,
  type Plan,
  type PricingSettings,
} from '@/lib/plans';
import { pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';

const EMPTY: RequestState = {};
const c = plansCopy.dialog;

/**
 * "Alege planul", and the confirmation before it.
 *
 * Nothing is charged, so the dialog says so in as many words — the one
 * thing somebody clicking a plan button on a pricing page reasonably fears
 * is that a card is about to be taken. It restates the plan, the period and
 * the total from the same figures the card showed, so the confirmation
 * cannot disagree with what was clicked.
 */
export function RequestPlanButton({
  companyId,
  plan,
  months,
  settings,
}: {
  companyId: string;
  plan: Plan;
  months: BillingMonths;
  settings: PricingSettings;
}) {
  const [state, action] = useActionState(requestSubscriptionAction, EMPTY);
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const price = priceAt(plan, months) ?? priceAt(plan, 1);

  if (state.notice) {
    return <FormNotice>{state.notice}</FormNotice>;
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          setOpen((current) => !current);
          // Focus lands on the heading rather than the first field: the
          // point of the step is reading the summary, not filling it in.
          requestAnimationFrame(() => headingRef.current?.focus());
        }}
        className={cn(buttonClasses('primary', 'md'), 'w-full')}
      >
        {plansCopy.card.cta.manager}
      </button>

      {open ? (
        <div id={dialogId} className="rounded-card border border-border-strong bg-ground-alt p-4">
          <h4 ref={headingRef} tabIndex={-1} className="text-[0.9375rem] font-medium">
            {c.title}
          </h4>
          <p className="mt-2 text-[0.875rem] text-muted">
            {c.summary(plan.name, pluralRo(months, 'lună', 'luni'))}
          </p>
          {price ? (
            <p className="mt-1 font-mono text-[0.875rem] tabular-nums">
              {c.total(price.months === 1 ? totalLabel(price) : formatLei(price.total))}
            </p>
          ) : null}
          {settings.manualBilling ? (
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">{c.manual}</p>
          ) : null}

          <form action={action} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="planCode" value={plan.code} />
            <input type="hidden" name="months" value={months} />

            <label className="flex flex-col gap-1.5 text-[0.8125rem]">
              {c.notes}
              <textarea
                name="notes"
                rows={2}
                maxLength={500}
                placeholder={c.notesPlaceholder}
                className="w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-[0.875rem]"
              />
            </label>

            <FormError>{state.error}</FormError>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClasses('primary', 'sm')}>
                {c.submit}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.cancel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
