import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { inscriereCopy } from '@/content/inscriere';
import { gateHref, type JourneyAction, type JourneyStage } from '@/lib/carrier-journey';
import { cn } from '@/lib/utils';

const g = inscriereCopy.gate;

/**
 * What a firm that cannot yet do `action` sees in its place: why, the one
 * step that is missing, how long the documents take, and one button to
 * that step — which comes back here when it is done.
 *
 * It replaces a refusal read after the fact („cont neverificat") with the
 * way through, at the moment the carrier wants something. The refusal is
 * still there, in Postgres: this card is only what makes it rare.
 */
export function ActionGate({
  action,
  stage,
  minutes,
  next,
  compact = false,
}: {
  action: JourneyAction;
  stage: Exclude<JourneyStage, 'verified'>;
  minutes: number;
  /** Where to come back to once the step is done: usually this page. */
  next: string;
  /** Inside a card on the dashboard: a line and a link. */
  compact?: boolean;
}) {
  const href = gateHref(stage, action, next);
  const body = stage === 'in_review' ? g[action].in_review : stepLine(stage, minutes);

  if (compact) {
    return (
      <p data-action-gate={action} data-stage={stage} className="text-small text-muted">
        {href === null ? body : `${g[action].title}. `}
        {href !== null ? (
          <Link href={href} className="link-accent">
            {g.action[stage as Exclude<typeof stage, 'in_review'>]}
          </Link>
        ) : null}
      </p>
    );
  }

  return (
    <section
      data-action-gate={action}
      data-stage={stage}
      className="rounded-card border border-border bg-surface p-5 shadow-card"
    >
      <p className="font-medium">{g[action].title}</p>
      <p className="mt-1 text-body text-muted">{body}</p>
      {href !== null ? (
        <Link href={href} className={cn(buttonClasses('primary', 'md'), 'mt-4 w-full')}>
          {g.action[stage as Exclude<typeof stage, 'in_review'>]}
        </Link>
      ) : null}
    </section>
  );
}

function stepLine(stage: Exclude<JourneyStage, 'verified' | 'in_review'>, minutes: number): string {
  return stage === 'documents' ? g.steps.documents(minutes) : g.steps[stage];
}
