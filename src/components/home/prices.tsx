import Link from 'next/link';
import { ArrowRight } from '@/components/icons';
import { Container } from '@/components/layout/container';
import { VehicleIcon } from '@/components/prices/vehicle-icon';
import { Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { pricesCopy } from '@/content/preturi';
import {
  VEHICLE_CLASS_LABELS,
  ZONE_LABELS,
  formatMinimums,
  formatRatePerKm,
  formatValidMonth,
} from '@/lib/pricing';
import { homeRates, isPublished, loadPrices } from '@/lib/prices-source';
import { iconForFact } from '@/lib/icons';

const c = pricesCopy.home;

/**
 * The price band on the homepage.
 *
 * Three classes and two columns, then the link — the whole table, the
 * minimums and the calculator are a page away, and putting them here would
 * turn the homepage into the prices page.
 *
 * The figures only appear once the team has published them. Until then the
 * band keeps its place in the page and says what is coming, because an
 * unapproved rate shown as a price is exactly the invented number this site
 * does not print.
 */
export async function Prices() {
  const data = await loadPrices();
  const published = isPublished(data);
  const rows = published ? homeRates(data.rates) : [];
  const month = published ? formatValidMonth(data.settings?.valid_month ?? null) : null;

  return (
    <section id="tarife" className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForFact('price')} strong={c.strong} soft={c.soft}>
          <Lede>{published ? c.lede : c.ledeUnpublished}</Lede>
        </SectionHead>

        {rows.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {rows.map((rate) => (
              <li key={rate.vehicle_class} className="rounded-card border border-border bg-surface p-5">
                <p className="flex items-center gap-3">
                  <VehicleIcon vehicleClass={rate.vehicle_class} />
                  <span>
                    <span className="block font-medium">
                      {VEHICLE_CLASS_LABELS[rate.vehicle_class]}
                    </span>
                    <span className="block text-small text-muted">{rate.weight_label}</span>
                  </span>
                </p>
                <dl className="mt-4 flex flex-col">
                  <Line
                    label={ZONE_LABELS.national}
                    value={formatRatePerKm(rate.national_ron_per_km, 'RON')}
                  />
                  <Line
                    label={ZONE_LABELS.international}
                    value={formatRatePerKm(rate.international_eur_per_km, 'EUR')}
                  />
                </dl>
                <p className="mt-3 text-xs text-muted">{formatMinimums(rate)}</p>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
          <Link
            href={ROUTES.prices}
            className="inline-flex items-center gap-2 text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {published ? c.link : c.linkUnpublished}
            <ArrowRight />
          </Link>
          {month ? (
            <span className="font-mono text-label uppercase tracking-[0.1em] text-muted">
              {pricesCopy.table.updated(month)}
            </span>
          ) : null}
        </p>
      </Container>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
      <dt className="min-w-0 flex-1 text-small text-muted">{label}</dt>
      <dd className="font-mono text-small tabular-nums">{value}</dd>
    </div>
  );
}
