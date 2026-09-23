import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { onboardingCopy } from '@/content/onboarding';
import { iconForBanner } from '@/lib/icons';
import { ICON_GAP } from '@/lib/icons';
import type { CarrierStage } from '@/lib/carrier-onboarding';
import { cn } from '@/lib/utils';

const HREF: Record<Exclude<CarrierStage, 'ready'>, string> = {
  no_company: ROUTES.accountCompanyCreate,
  draft: ROUTES.accountCompany,
  pending: ROUTES.accountCompany,
  rejected: ROUTES.accountCompany,
  suspended: ROUTES.accountCompany,
};

/**
 * What a carrier who cannot yet send offers is told, above the board.
 *
 * The point of it is that the board is already usable: a carrier signs
 * up and lands here, on real requests, rather than on a form. So the
 * first line says what they can do and the second says what is left —
 * never the other way round, and never as a warning. Nothing is wrong;
 * there is a step to finish.
 *
 * A suspension is the one that is not calm, and it is drawn without an
 * icon for the reason in `docs/13-iconuri.md`: a pictogram beside „cont
 * suspendat" turns a sentence somebody has to read into a notification
 * they dismiss. `iconForBanner` is what decides, not this file.
 */
export function CarrierBanner({ stage }: { stage: Exclude<CarrierStage, 'ready'> }) {
  const c = onboardingCopy.banner[stage];
  const serious = stage === 'suspended' || stage === 'rejected';
  const glyph = iconForBanner(stage === 'no_company' ? 'draft' : stage);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5',
        serious ? 'border-warning/40 bg-warning/8' : 'border-border bg-surface shadow-card',
      )}
    >
      <div className="min-w-0">
        <p className={cn('inline-flex items-center font-medium', ICON_GAP)}>
          {glyph === null ? null : <Icon as={glyph} size="sm" tone="muted" />}
          {c.title}
        </p>
        <p className="mt-1 text-small text-muted">{c.body}</p>
      </div>
      <Link
        href={HREF[stage]}
        className={cn(buttonClasses('secondary', 'sm'), 'flex-none self-start sm:self-auto')}
      >
        {c.action}
      </Link>
    </div>
  );
}
