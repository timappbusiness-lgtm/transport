import { OptionForm } from '@/components/admin/option-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { firmaCopy } from '@/content/firma';
import { loadAllCompanyOptions } from '@/lib/company-options-source';

const c = firmaCopy.admin;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The two lists a firm picks its capabilities from.
 *
 * Access is the layout's job — a non-staff visitor gets a 404 — and the
 * two RPCs behind these forms refuse them a second time.
 *
 * Retired options are listed with the active ones rather than hidden: the
 * firms that ticked them still hold them, and a list that pretends
 * otherwise is a list somebody will re-add a duplicate code to.
 */
export default async function Page() {
  const { equipment, services } = await loadAllCompanyOptions();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      <section aria-labelledby="dotari">
        <h2 id="dotari" className="text-h3">
          {c.equipment}
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface px-4 sm:px-5">
          {equipment.map((row) => (
            <li key={row.code}>
              <OptionForm kind="equipment" row={row} />
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-card border border-dashed border-border-strong bg-surface px-4 sm:px-5">
          <p className="pt-4 text-body font-medium">{c.addEquipment}</p>
          <OptionForm kind="equipment" />
        </div>
      </section>

      <section aria-labelledby="servicii">
        <h2 id="servicii" className="text-h3">
          {c.services}
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface px-4 sm:px-5">
          {services.map((row) => (
            <li key={row.code}>
              <OptionForm kind="service" row={row} />
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-card border border-dashed border-border-strong bg-surface px-4 sm:px-5">
          <p className="pt-4 text-body font-medium">{c.addService}</p>
          <OptionForm kind="service" />
        </div>
      </section>
    </div>
  );
}
