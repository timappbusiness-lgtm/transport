'use client';

import { useId, useState } from 'react';
import { Container } from '@/components/layout/container';
import { CountryTag, Lede, SectionHead } from '@/components/ui/primitives';
import { homeCopy } from '@/content/home';
import { cn } from '@/lib/utils';

const c = homeCopy.prices;
type TabKey = (typeof c.tabs)[number]['key'];

export function Prices() {
  const [active, setActive] = useState<TabKey>('standard');
  const id = useId();

  return (
    <section id="tarife" className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} strong={c.strong} soft={c.soft}>
          <Lede>{c.lede}</Lede>
        </SectionHead>

        <div
          role="tablist"
          aria-label={c.eyebrow}
          className="mt-8 inline-flex gap-1 rounded-pill border border-border bg-surface p-1"
        >
          {c.tabs.map((tab) => {
            const selected = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${id}-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(tab.key)}
                onKeyDown={(event) => {
                  // Arrow keys move between tabs, as a tablist should.
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                  event.preventDefault();
                  const index = c.tabs.findIndex((t) => t.key === active);
                  const next = c.tabs[(index + 1) % c.tabs.length];
                  if (next) {
                    setActive(next.key);
                    document.getElementById(`${id}-tab-${next.key}`)?.focus();
                  }
                }}
                className={cn(
                  'rounded-pill px-4 py-2 text-[0.875rem] transition-[color,background-color] duration-150',
                  selected ? 'bg-foreground text-white' : 'text-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          className="mt-6 overflow-x-auto rounded-card border border-border bg-surface"
        >
          <table className="w-full min-w-[34rem] border-collapse text-[0.9375rem]">
            <thead>
              <tr>
                {[c.columns.route, c.columns.price, c.columns.range, c.columns.duration].map(
                  (heading, index) => (
                    <th
                      key={heading}
                      scope="col"
                      className={cn(
                        'border-b border-border px-5 py-3.5 font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-muted',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {c.rows.map((row) => (
                <tr key={row.country}>
                  <td className="border-b border-border px-5 py-3.5 last:border-b-0">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      {row.country} <CountryTag cc={row.cc} /> → România
                    </span>
                  </td>
                  <td className="border-b border-border px-5 py-3.5 text-right font-mono tabular-nums">
                    {active === 'standard' ? row.standard : c.onRequest}
                  </td>
                  <td className="border-b border-border px-5 py-3.5 text-right font-mono tabular-nums text-muted">
                    {active === 'standard' ? row.range : '—'}
                  </td>
                  <td className="border-b border-border px-5 py-3.5 text-right font-mono tabular-nums text-muted">
                    {active === 'standard' ? row.days : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-[64ch] text-[0.8125rem] text-muted">{c.note}</p>
      </Container>
    </section>
  );
}
