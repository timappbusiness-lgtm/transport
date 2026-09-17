import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';
import { pricesCopy } from '@/content/preturi';
import { cityLabel } from '@/lib/cities';
import { hasPrefill, parsePrefill } from '@/lib/price-prefill';
import { VEHICLE_CLASS_LABELS } from '@/lib/pricing';

export const metadata: Metadata = { title: 'Adaugă o cerere de transport' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const prefill = parsePrefill(await searchParams);

  return (
    <PlaceholderPage
      title="Adaugă o cerere de transport"
      extra={hasPrefill(prefill) ? <Handoff summary={summarise(prefill)} /> : null}
    >
      Formularul de cerere, gratuit și fără cont, e în construcție.
    </PlaceholderPage>
  );
}

/**
 * Arriving from the price calculator.
 *
 * The form itself is the next piece of work; what this proves today is that
 * the choices survive the trip in the URL, so whoever builds the form reads
 * them rather than asking the person to pick their route a second time.
 */
function Handoff({ summary }: { summary: string[] }) {
  const c = pricesCopy.handoff;
  return (
    <div className="max-w-[46rem] rounded-card border border-border bg-surface p-5">
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">{c.title}</p>
      <p className="mt-2 text-[0.9375rem]">{summary.join(' · ')}</p>
      <p className="mt-2 text-[0.8125rem] text-muted">{c.body}</p>
    </div>
  );
}

function summarise(prefill: ReturnType<typeof parsePrefill>): string[] {
  const parts: string[] = [];
  if (prefill.from && prefill.to) {
    parts.push(`${cityLabel(prefill.from)} → ${cityLabel(prefill.to)}`);
  } else if (prefill.from) {
    parts.push(cityLabel(prefill.from));
  } else if (prefill.to) {
    parts.push(cityLabel(prefill.to));
  }
  if (prefill.vehicleClass) parts.push(VEHICLE_CLASS_LABELS[prefill.vehicleClass]);
  if (prefill.isRunning !== null) {
    parts.push(prefill.isRunning ? pricesCopy.handoff.running : pricesCopy.handoff.notRunning);
  }
  if (prefill.express !== null) {
    parts.push(prefill.express ? pricesCopy.service.express : pricesCopy.service.standard);
  }
  return parts;
}
