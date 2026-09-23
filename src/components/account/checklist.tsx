import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { accountCopy } from '@/content/account';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'current' | 'soon';

export interface ChecklistStep {
  key: string;
  label: string;
  state: StepState;
}

/**
 * Onboarding checklist. Steps that are not built yet stay visible and
 * disabled rather than hidden: a carrier deciding whether to sign up wants
 * to see the whole road, not discover it one screen at a time.
 */
export function Checklist({ title, steps }: { title: string; steps: ChecklistStep[] }) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-4 text-h3">{title}</h2>
      <ol className="divide-y divide-border">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'flex items-center gap-3.5 px-5 py-3.5',
              step.state === 'soon' && 'opacity-55',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-6 flex-none items-center justify-center rounded-full font-mono text-label',
                step.state === 'done' && 'bg-success/15 text-success',
                step.state === 'current' && 'bg-accent text-on-accent',
                step.state === 'soon' && 'border border-border text-muted',
              )}
            >
              {step.state === 'done' ? <Icon as={uiIcon('check')} size="sm" /> : index + 1}
            </span>
            <span className="min-w-0 flex-1 text-sm">{step.label}</span>
            {step.state === 'done' ? (
              <span className="font-mono text-label text-foreground">
                {accountCopy.checklist.done}
              </span>
            ) : null}
            {step.state === 'soon' ? (
              <span className="flex items-center gap-1.5 font-mono text-label text-muted">
                <Icon as={uiIcon('locked')} size="sm" />
                {accountCopy.checklist.soon}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
