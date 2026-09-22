import { cn } from '@/lib/utils';
import type { LucideIcon } from '@/lib/icons';
import { IconLabel } from '@/components/ui/icon';

/**
 * Two-tone headline: the claim in ink, the qualifier in the soft tone.
 *
 * `soft` is #7b8b93, which measures 3.28:1 on the ground — enough for large
 * text and not enough for body, so this component is the only place it is
 * allowed to appear.
 */
export function Headline({
  strong,
  soft,
  as: Tag = 'h2',
  className,
}: {
  strong: string;
  soft?: string | undefined;
  as?: 'h1' | 'h2' | 'h3' | undefined;
  className?: string | undefined;
}) {
  return (
    <Tag className={cn('text-[clamp(1.9rem,4.4vw,3.25rem)]', className)}>
      <span>{strong}</span>
      {soft ? (
        <>
          {' '}
          <span className="text-ink-soft">{soft}</span>
        </>
      ) : null}
    </Tag>
  );
}

/** Small uppercase mono label inside a bordered pill. */
export function EyebrowPill({
  children,
  tone = 'light',
  className,
}: {
  children: React.ReactNode;
  tone?: 'light' | 'dark' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1',
        'font-mono text-[0.6875rem] uppercase tracking-[0.12em]',
        tone === 'dark'
          ? 'border-white/35 text-white/85'
          : 'border-border-strong/45 text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Lede({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('max-w-[58ch] text-[1.0625rem] leading-relaxed text-muted', className)}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-border bg-surface', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Section({
  className,
  tone = 'ground',
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { tone?: 'ground' | 'alt' | 'dark' }) {
  return (
    <section
      data-surface={tone === 'dark' ? 'dark' : undefined}
      className={cn(
        tone === 'ground' && 'bg-background',
        tone === 'alt' && 'bg-ground-alt',
        tone === 'dark' &&
          'bg-[linear-gradient(135deg,var(--color-dark-from),var(--color-dark-to))] text-white',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  icon,
  strong,
  soft,
  children,
  tone = 'light',
  className,
}: {
  eyebrow?: string | undefined;
  /**
   * Drawn inside the eyebrow pill, never beside the headline.
   *
   * The eyebrow is the section's label — short, uppercase, the thing
   * somebody's eye lands on while scrolling — and that is exactly where
   * an icon helps. Next to a 2rem headline it would be decoration, which
   * this system does not do.
   */
  icon?: LucideIcon | undefined;
  strong: string;
  soft?: string | undefined;
  children?: React.ReactNode;
  tone?: 'light' | 'dark' | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('min-w-0 max-w-[46rem]', className)}>
      {eyebrow ? (
        <EyebrowPill tone={tone}>
          {icon ? (
            <IconLabel as={icon} size="sm">
              {eyebrow}
            </IconLabel>
          ) : (
            eyebrow
          )}
        </EyebrowPill>
      ) : null}
      <Headline
        strong={strong}
        soft={soft}
        className={cn(eyebrow ? 'mt-5' : undefined, tone === 'dark' && 'text-white')}
      />
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** Country code plate: DE, RO — the way it reads on a number plate. */
export function CountryTag({ cc }: { cc: string }) {
  return (
    <span className="rounded-[4px] border border-border-strong/50 px-1.5 py-0.5 align-[1px] font-mono text-[0.625rem] tracking-[0.06em] text-muted">
      {cc}
    </span>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const STATUS: Record<StatusTone, { dot: string; shell: string }> = {
  success: { dot: 'bg-success', shell: 'border-success/35 bg-success/8' },
  warning: { dot: 'bg-warning', shell: 'border-warning/40 bg-warning/8' },
  danger: { dot: 'bg-danger', shell: 'border-danger/35 bg-danger/8' },
  neutral: { dot: 'bg-border-strong', shell: 'border-border bg-ground-alt' },
};

/**
 * Status badge. The label is ink, not the status colour: as text on white
 * the brief's green and amber measure 4.04 and 3.64, under AA. The colour
 * carries the dot and the tint, the word carries the meaning.
 */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-2.5 py-1',
        'font-mono text-[0.6875rem] tracking-[0.04em] text-foreground',
        STATUS[tone].shell,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-[6px] flex-none rounded-full', STATUS[tone].dot)} />
      {children}
    </span>
  );
}

/** Label on the left, tabular value on the right. */
export function DataRow({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">{label}</span>
      <span className="font-mono text-[0.8125rem] tabular-nums text-foreground">{value}</span>
      {trailing}
    </div>
  );
}

/** Marks demonstration content. Legal requirement, never decoration. */
export function SampleTag({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border border-border-strong/45 bg-surface/90 px-2 py-0.5',
        'font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted',
        className,
      )}
    >
      Exemplu
    </span>
  );
}
