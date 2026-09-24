import { inscriereCopy } from '@/content/inscriere';
import type { JourneyAction } from '@/lib/carrier-journey';

/**
 * One line at the top of a step a carrier was sent to: why they are here.
 *
 * Somebody who pressed „Trimite ofertă" and landed on a form has to read,
 * before anything else, that the form is the way to the offer — or they
 * read it as a wall and leave.
 */
export function JourneyBecause({ action }: { action: JourneyAction }) {
  return (
    <p data-journey-because={action} className="rounded-card border border-border bg-surface px-4 py-3 text-body shadow-card">
      {inscriereCopy.because[action]}
    </p>
  );
}
