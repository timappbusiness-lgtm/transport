import { Container } from '@/components/layout/container';
import { SectionHead } from '@/components/ui/primitives';
import { homeCopy } from '@/content/home';
import { cn } from '@/lib/utils';
import { iconForAction } from '@/lib/icons';

const c = homeCopy.comparison;

function Row({
  title,
  steps,
  tone,
}: {
  title: string;
  steps: readonly string[];
  tone: 'old' | 'new';
}) {
  return (
    <div
      data-surface={tone === 'new' ? 'dark' : undefined}
      className={cn(
        'rounded-card p-5 sm:p-6',
        tone === 'old'
          ? 'border border-border bg-surface'
          : 'bg-[linear-gradient(135deg,var(--color-dark-from),var(--color-dark-to))] text-white',
      )}
    >
      <h3
        className={cn(
          'text-h3 font-semibold',
          tone === 'new' ? 'text-white' : 'text-foreground',
        )}
      >
        {title}
      </h3>
      <ol className="mt-5 grid gap-4 sm:grid-cols-5">
        {steps.map((step, index) => (
          <li key={step} className="min-w-0">
            <span
              className={cn(
                'font-mono text-label uppercase tracking-[0.12em]',
                // The pale step on the dark card: the numbered steps are
                // the new way, and they read as the brand's, not as grey.
                tone === 'new' ? 'text-accent-on-dark' : 'text-muted',
              )}
            >
              {c.stepLabel} {index + 1}
            </span>
            <p className="mt-1.5 text-body leading-snug">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Comparison() {
  return (
    <section className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForAction('filter')} strong={c.strong} soft={c.soft} />
        <div className="mt-10 grid gap-4">
          <Row title={c.oldTitle} steps={c.old} tone="old" />
          <Row title={c.newTitle} steps={c.fresh} tone="new" />
        </div>
      </Container>
    </section>
  );
}
