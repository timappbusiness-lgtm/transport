import { Card } from '@/components/ui/primitives';
import { onboardingCopy } from '@/content/inscrieri';
import type { HandoverSummary } from '@/lib/onboarding-source';

const c = onboardingCopy.banner;

/**
 * Ce citește proprietarul, după ce a preluat contul.
 *
 * Enumeră ce am completat noi, pentru că un cont în care apar deja șase
 * documente și două mașini ridică întrebarea „cine a scris astea" — iar
 * răspunsul trebuie să fie pe ecran, nu în jurnal.
 *
 * Ultimul rând este cel important: poți schimba orice, și verifică.
 * Am completat ce ni s-a spus la telefon, iar la telefon se aude greșit.
 */
export function HandoverBanner({ summary }: { summary: HandoverSummary }) {
  const filled = [
    c.company,
    ...(summary.documents_count > 0 ? [c.documents(summary.documents_count)] : []),
    ...(summary.vehicles_count > 0 ? [c.vehicles(summary.vehicles_count)] : []),
    ...(summary.has_coverage ? [c.profile] : []),
  ];

  return (
    <Card className="border-success/45 bg-success/8 p-4">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-1 text-body text-muted">{c.filled(summary.staff_name)}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {filled.map((item) => (
          <li
            key={item}
            className="rounded-pill border border-border bg-surface px-2.5 py-0.5 text-small"
          >
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-[64ch] text-small">{c.editable}</p>
    </Card>
  );
}
