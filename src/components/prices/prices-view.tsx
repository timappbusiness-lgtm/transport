'use client';

import { useId, useState } from 'react';
import { Calculator } from '@/components/prices/calculator';
import { RateTable } from '@/components/prices/rate-table';
import { pricesCopy } from '@/content/preturi';
import type { Prefill } from '@/lib/price-prefill';
import { formatValidMonth, type PriceRate, type PriceSettings } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'standard', label: pricesCopy.service.standard },
  { key: 'expres', label: pricesCopy.service.express },
] as const;

/**
 * Table and calculator, sharing one Standard/Expres choice.
 *
 * They are one component because they answer the same question and would
 * otherwise disagree: a table showing Standard rates beside a calculator
 * quietly set to Expres is how a person ends up believing a number that is
 * not on the page. The tablist above and the radio buttons inside the
 * calculator are two views of the same state.
 */
export function PricesView({
  rates,
  settings,
  initial,
}: {
  rates: PriceRate[];
  settings: PriceSettings;
  initial: Prefill;
}) {
  const [express, setExpress] = useState(initial.express ?? false);
  const id = useId();
  const month = formatValidMonth(settings.valid_month);

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start">
      <section aria-labelledby={`${id}-table`} className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id={`${id}-table`} className="text-h3">
            {pricesCopy.table.title}
          </h2>
          {month ? (
            <p className="font-mono text-label uppercase tracking-[0.1em] text-muted">
              {pricesCopy.table.updated(month)}
            </p>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label={pricesCopy.service.legend}
          className="mt-4 inline-flex gap-1 rounded-pill border border-border bg-surface p-1"
        >
          {TABS.map((tab) => {
            const selected = (tab.key === 'expres') === express;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${id}-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setExpress(tab.key === 'expres')}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                  event.preventDefault();
                  const next = !express;
                  setExpress(next);
                  document
                    .getElementById(`${id}-tab-${next ? 'expres' : 'standard'}`)
                    ?.focus();
                }}
                className={cn(
                  'rounded-pill px-4 py-2 text-body transition-[color,background-color] duration-150',
                  selected ? 'bg-accent text-on-accent' : 'text-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <p className="mt-3 max-w-[64ch] text-small text-muted">
          {express
            ? pricesCopy.service.expressNote(settings.express_surcharge_pct)
            : pricesCopy.service.standardNote}
        </p>

        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${express ? 'expres' : 'standard'}`}
          className="mt-5"
        >
          <RateTable rates={rates} settings={settings} express={express} />
        </div>

        <div className="mt-5 flex flex-col gap-2 text-small text-muted">
          <p className="max-w-[68ch]">{pricesCopy.table.minimumNote}</p>
          <p className="max-w-[68ch]">
            {pricesCopy.table.notRunning(settings.not_running_surcharge_pct)}
          </p>
          <p className="max-w-[68ch]">{pricesCopy.table.note}</p>
          <p className="max-w-[68ch]">{pricesCopy.table.vat}</p>
        </div>
      </section>

      <div className="lg:sticky lg:top-24">
        <Calculator
          rates={rates}
          settings={settings}
          express={express}
          onExpressChange={setExpress}
          initial={initial}
        />
      </div>
    </div>
  );
}
