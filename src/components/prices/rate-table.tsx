import { VehicleIcon } from '@/components/prices/vehicle-icon';
import { pricesCopy } from '@/content/preturi';
import {
  VEHICLE_CLASS_LABELS,
  formatMinimums,
  formatRatePerKm,
  withExpressRate,
  type PriceRate,
  type PriceSettings,
} from '@/lib/pricing';
import { cn } from '@/lib/utils';

const c = pricesCopy.table;

/**
 * The rate table.
 *
 * Two renderings of the same rows: a real table on a wide screen, where
 * comparing a column top to bottom is the point, and a card per class on a
 * phone, where a four-column table becomes a horizontal scroll nobody
 * finds. Both are in the DOM, so neither is a second source of truth — they
 * read the same array.
 */
export function RateTable({
  rates,
  settings,
  express,
}: {
  rates: PriceRate[];
  settings: PriceSettings;
  express: boolean;
}) {
  const rows = rates.map((rate) => withExpressRate(rate, settings, express));

  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-border bg-surface sm:block">
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">{c.caption}</caption>
          <thead>
            <tr>
              {[c.columns.vehicle, c.columns.local, c.columns.national, c.columns.international].map(
                (heading, index) => (
                  <th
                    key={heading}
                    scope="col"
                    className={cn(
                      'border-b border-border px-5 py-3.5 font-mono text-label font-normal uppercase tracking-[0.12em] text-muted',
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
            {rows.map((rate) => (
              <tr key={rate.vehicle_class}>
                <th scope="row" className="border-b border-border px-5 py-3.5 text-left font-normal">
                  <span className="flex items-center gap-3">
                    <VehicleIcon vehicleClass={rate.vehicle_class} />
                    <span className="min-w-0">
                      <span className="block">{VEHICLE_CLASS_LABELS[rate.vehicle_class]}</span>
                      <span className="block text-small text-muted">
                        {rate.weight_label} · {formatMinimums(rate)}
                      </span>
                    </span>
                  </span>
                </th>
                <Cell value={formatRatePerKm(rate.local_ron_per_km, 'RON')} />
                <Cell value={formatRatePerKm(rate.national_ron_per_km, 'RON')} />
                <Cell value={formatRatePerKm(rate.international_eur_per_km, 'EUR')} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((rate) => (
          <li
            key={rate.vehicle_class}
            className="rounded-card border border-border bg-surface p-4"
          >
            <p className="flex items-center gap-3">
              <VehicleIcon vehicleClass={rate.vehicle_class} />
              <span>
                <span className="block font-medium">
                  {VEHICLE_CLASS_LABELS[rate.vehicle_class]}
                </span>
                <span className="block text-small text-muted">{rate.weight_label}</span>
              </span>
            </p>
            <dl className="mt-3 flex flex-col">
              <Line label={c.columns.local} value={formatRatePerKm(rate.local_ron_per_km, 'RON')} />
              <Line
                label={c.columns.national}
                value={formatRatePerKm(rate.national_ron_per_km, 'RON')}
              />
              <Line
                label={c.columns.international}
                value={formatRatePerKm(rate.international_eur_per_km, 'EUR')}
              />
              <Line label={c.minimum} value={formatMinimums(rate).replace('Minimum ', '')} muted />
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function Cell({ value }: { value: string }) {
  return (
    <td className="border-b border-border px-5 py-3.5 text-right font-mono tabular-nums">
      {value}
    </td>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="min-w-0 flex-1 text-small text-muted">{label}</dt>
      <dd
        className={cn(
          'font-mono text-small tabular-nums',
          muted ? 'text-muted' : 'text-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
