import { Fragment } from 'react';
import { Check, Clock, Minus } from 'lucide-react';
import { plansCopy } from '@/content/plans';
import {
  featureStatus,
  groupedComparison,
  type FeatureStatus,
  type Plan,
} from '@/lib/plans';
import { cn } from '@/lib/utils';

const c = plansCopy.comparison;

/**
 * What each plan includes, side by side.
 *
 * This is where `not_included` finally appears: a card that listed what it
 * does not do would read as a complaint, but a comparison with gaps in it
 * is a comparison that hides something. "În curând" is its own mark rather
 * than a check, because a feature that does not exist yet is not a feature.
 */
export function PlanComparison({ plans }: { plans: readonly Plan[] }) {
  const sections = groupedComparison(plans);
  if (plans.length === 0 || sections.length === 0) return null;

  return (
    <section aria-labelledby="comparatie" className="mt-16">
      <h2 id="comparatie" className="text-[1.25rem]">
        {c.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>

      {/* Desktop: one table, header sticky under the site header. */}
      <div className="mt-6 hidden overflow-x-auto rounded-card border border-border bg-surface md:block">
        <table className="w-full border-collapse text-[0.9375rem]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th
                scope="col"
                className="border-b border-border px-5 py-3.5 text-left font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-muted"
              >
                {c.feature}
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.code}
                  scope="col"
                  className="border-b border-border px-5 py-3.5 text-left text-[0.875rem] font-medium"
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              // The key belongs on the fragment: the section is two kinds of
              // row, and a <tbody> cannot hold a wrapper element.
              <Fragment key={section.group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={plans.length + 1}
                    className="border-b border-border bg-ground-alt px-5 py-2 text-left font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-muted"
                  >
                    {c.groups[section.group]}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className="border-b border-border px-5 py-3 text-left font-normal"
                    >
                      {row.label}
                    </th>
                    {plans.map((plan) => (
                      <td key={plan.code} className="border-b border-border px-5 py-3">
                        <Mark status={featureStatus(plan, row.key)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one block per plan, because a four-column table on a phone
          is a table nobody reads. */}
      <div className="mt-6 flex flex-col gap-3 md:hidden">
        {plans.map((plan) => (
          <details key={plan.code} className="rounded-card border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-4 text-[0.9375rem] font-medium">
              {plan.name}
              <span className="ml-2 font-normal text-muted">· {c.showPlan}</span>
            </summary>
            <div className="px-5 pb-5">
              {sections.map((section) => (
                <div key={section.group} className="mt-4 first:mt-0">
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">
                    {c.groups[section.group]}
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {section.rows.map((row) => (
                      <li key={row.key} className="flex items-start gap-2.5 text-[0.875rem]">
                        <Mark status={featureStatus(plan, row.key)} />
                        <span
                          className={cn(
                            featureStatus(plan, row.key) === 'not_included' && 'text-muted',
                          )}
                        >
                          {row.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/**
 * The mark carries a label, not just a colour and a shape: a check and a
 * dash are indistinguishable to a screen reader otherwise, and this table
 * is the page's answer to "what do I actually get".
 */
function Mark({ status }: { status: FeatureStatus }) {
  const label = plansCopy.card.comingSoon;

  if (status === 'included') {
    return (
      <>
        <Check size={16} aria-hidden="true" className="mt-0.5 flex-none text-success" />
        <span className="sr-only">Inclus</span>
      </>
    );
  }

  if (status === 'coming_soon') {
    return (
      <>
        <Clock size={16} aria-hidden="true" className="mt-0.5 flex-none text-muted" />
        <span className="sr-only">{label}</span>
      </>
    );
  }

  return (
    <>
      <Minus size={16} aria-hidden="true" className="mt-0.5 flex-none text-border-strong" />
      <span className="sr-only">Nu este inclus</span>
    </>
  );
}
