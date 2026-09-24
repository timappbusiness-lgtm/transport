import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { inscriereCopy } from '@/content/inscriere';
import { onboardingCopy } from '@/content/onboarding';
import { withJourney, type JourneyStage } from '@/lib/carrier-journey';
import { ICON_GAP, iconForBanner } from '@/lib/icons';
import { cn } from '@/lib/utils';

const b = inscriereCopy.board;
const g = inscriereCopy.gate;

/** Where the one button goes, for each stage, and what it says. */
function next(stage: Exclude<JourneyStage, 'verified'>): { href: string; action: string } {
  switch (stage) {
    case 'no_company':
      return { href: ROUTES.accountCompanyCreate, action: b.addCompany };
    case 'no_vehicle':
      return { href: ROUTES.accountFleet, action: b.addVehicle };
    case 'documents':
      return { href: ROUTES.accountDocuments, action: b.documents };
    case 'ready_to_submit':
      return { href: ROUTES.accountDocuments, action: b.submit };
    case 'rejected':
      return { href: ROUTES.accountDocuments, action: g.action.rejected };
    case 'in_review':
      return { href: ROUTES.accountDocuments, action: onboardingCopy.banner.pending.action };
    case 'suspended':
      return { href: ROUTES.accountDocuments, action: g.action.suspended };
  }
}

function words(stage: Exclude<JourneyStage, 'verified'>, minutes: number): { title: string; body: string } {
  switch (stage) {
    case 'in_review':
      return { title: b.inReviewTitle, body: b.inReviewBody };
    case 'rejected':
      return onboardingCopy.banner.rejected;
    case 'suspended':
      return onboardingCopy.banner.suspended;
    case 'ready_to_submit':
      return { title: b.title, body: g.steps.ready_to_submit };
    default:
      return { title: b.title, body: b.body(minutes) };
  }
}

/**
 * What a carrier who cannot yet send offers is told, above the board.
 *
 * The board is already usable — a carrier signs up and lands here, on
 * real requests, rather than on a form — so the first line says what they
 * can do and the second what is left, with how long it takes to upload
 * the documents. One button: the next step, never a list of them.
 *
 * A suspension and a rejection are the ones that are not calm, and they
 * are drawn without an icon for the reason in `docs/13-iconuri.md`.
 * `iconForBanner` decides, not this file.
 */
export function JourneyBanner({
  stage,
  minutes,
  back = null,
}: {
  stage: Exclude<JourneyStage, 'verified'>;
  minutes: number;
  /** The board as it is now, so the step comes back to it. */
  back?: string | null;
}) {
  const { title, body } = words(stage, minutes);
  const { href, action } = next(stage);
  const serious = stage === 'suspended' || stage === 'rejected';
  const glyph = iconForBanner(serious ? stage : stage === 'in_review' ? 'pending' : 'draft');

  return (
    <div
      data-journey-banner={stage}
      className={cn(
        'flex flex-col gap-2 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5',
        serious ? 'border-warning/40 bg-warning/8' : 'border-border bg-surface shadow-card',
      )}
    >
      <div className="min-w-0">
        <p className={cn('inline-flex items-center font-medium', ICON_GAP)}>
          {glyph === null ? null : <Icon as={glyph} size="sm" tone="muted" />}
          {title}
        </p>
        <p className="mt-1 text-small text-muted">{body}</p>
      </div>
      <Link
        href={withJourney(href, null, back)}
        className={cn(buttonClasses('secondary', 'sm'), 'flex-none self-start sm:self-auto')}
      >
        {action}
      </Link>
    </div>
  );
}
