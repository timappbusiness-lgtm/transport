import { cn } from '@/lib/utils';
import type { LucideIcon } from '@/lib/icons';
import { IconLabel } from '@/components/ui/icon';

/**
 * Two-tone headline: the claim in ink, the qualifier in the soft tone.
 *
 * `soft` is `--color-ink-soft`, 3.28:1 on the ground — enough for large
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
    <Tag className={cn('text-h1', className)}>
      {/* The claim at 600 and the qualifier at 300 in the soft tone: a
          two-tone headline is a weight contrast first and a colour
          contrast second. It used to be 300 against 300, so only the
          colour separated them, and at 3.25rem that read as one long
          light sentence rather than as a claim and its qualifier.

          The soft half is never the accent. It is the part somebody may
          skip; the accent marks what they should not. */}
      <span className="font-semibold">{strong}</span>
      {soft ? (
        <>
          {' '}
          <span className="font-light text-ink-soft">{soft}</span>
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
  /**
   * `quiet` is the legal one. The accent may not appear on a legal page,
   * a suspension, a dispute or a deletion — and „Document legal" above a
   * set of terms is the first of those. It is a tone rather than an
   * omission so that the rule is something a call site states out loud;
   * `tests/e2e/aspect-vizual.spec.ts` fails if a legal page forgets.
   */
  tone?: 'light' | 'dark' | 'quiet' | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-3 py-1',
        'font-mono text-label uppercase',
        tone === 'dark'
          ? 'border-white/35 text-white/85'
          : tone === 'quiet'
          ? 'border-border-strong/45 text-muted'
          : // The fifth place the accent is spent: the pill that names a
            // section. A touch of colour at the top of each block is what
            // lets somebody scan a long page by its sections instead of
            // reading every heading. Measured on the tint it sits on —
            // 6.48:1 over the ground, 6.12:1 over the alternating band.
            //
            // Light surfaces only. On the dark gradient the accent has
            // nothing to sit against, so that tone is unchanged.
            'border-accent/30 bg-accent/6 text-accent',
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
      className={cn('max-w-[58ch] text-body-lg leading-relaxed text-muted', className)}
      {...props}
    />
  );
}

export function Card({
  interactive = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Set on a card that is a link or a button. It gets the hover lift and
   * the stronger border; a card that only holds text does not, because a
   * surface that reacts to the pointer and then does nothing is a promise
   * the interface does not keep.
   */
  interactive?: boolean | undefined;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        interactive &&
          'transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-raised',
        className,
      )}
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
    <span className="rounded-tight border border-border-strong/50 px-1.5 py-0.5 align-[1px] font-mono text-label tracking-[0.06em] text-muted">
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
        'font-mono text-label tracking-[0.04em] text-foreground',
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
  tone = 'ink',
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
  /**
   * `accent` for a count the row exists to show — the dashboard's routes,
   * seats and contacts. Ink everywhere else: a plate or an id is data to
   * read, not a number to notice.
   */
  tone?: 'ink' | 'accent';
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-small text-muted">{label}</span>
      <span
        className={cn(
          'font-mono text-small tabular-nums',
          tone === 'accent' ? 'font-medium text-accent' : 'text-foreground',
        )}
      >
        {value}
      </span>
      {trailing}
    </div>
  );
}

/**
 * The one number a card exists to show.
 *
 * A price, a count of free seats, a distance, a rating average. This is
 * the first of the six places the accent is spent — see
 * `design/README.md` — and it is spent here because the figure is what
 * somebody came to the card to read, and everything around it is
 * explanation.
 *
 * `tone="plain"` for the cases where the figure is not the point: a
 * disabled plan, a zero, a number inside an already-coloured banner.
 * Never `accent` on a legal page or beside a suspension, a dispute or a
 * deletion — `tests/unit/design-tokens.test.ts` checks that.
 *
 * Always tabular: a column of prices that shifts by a digit width is a
 * column somebody has to re-read.
 */
export function Figure({
  size = 'md',
  tone = 'accent',
  as: Tag = 'span',
  className,
  children,
}: {
  size?: 'lg' | 'md' | 'sm' | undefined;
  tone?: 'accent' | 'plain' | undefined;
  as?: 'span' | 'p' | 'dd' | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'font-display tabular-nums',
        size === 'lg' && 'text-figure-lg',
        size === 'md' && 'text-figure',
        size === 'sm' && 'text-figure-sm',
        tone === 'accent' ? 'text-accent' : 'text-foreground',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Marks demonstration content. Legal requirement, never decoration. */
export function SampleTag({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border border-border-strong/45 bg-surface/90 px-2 py-0.5',
        'font-mono text-label uppercase tracking-[0.12em] text-muted',
        className,
      )}
    >
      Exemplu
    </span>
  );
}
