import type { CountryCode, Tone } from '@/content/home';
import { cn } from '@/lib/utils';

/** Small uppercase mono label above a heading. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-muted', className)}
      {...props}
    />
  );
}

export function Lede({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('max-w-[62ch] text-base text-muted sm:text-[1.1875rem] sm:leading-relaxed', className)}
      {...props}
    />
  );
}

/** Country code plate: DE, RO — the way it reads on a number plate. */
export function CountryTag({ cc }: { cc: CountryCode }) {
  return (
    <span className="rounded-[2px] border border-border px-1 py-0.5 align-[2px] font-mono text-[0.625rem] font-medium tracking-[0.06em] text-muted">
      {cc}
    </span>
  );
}

const TONE_CHIP: Record<Tone, string> = {
  ok: 'border-success/30 bg-success/12 text-success',
  warn: 'border-warning/35 bg-warning/12 text-warning',
  danger: 'border-danger/35 bg-danger/12 text-danger',
};

export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.04em]',
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
};

export function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className={cn('size-[7px] flex-none rounded-full', TONE_DOT[tone])} />;
}

export function Section({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('border-b border-border', className)} {...props}>
      {children}
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-[clamp(1.75rem,3.5vw,2.75rem)] min-w-0 max-w-[46rem]', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2.5 mb-3 text-[clamp(1.75rem,3.7vw,2.75rem)]">{title}</h2>
      {children}
    </div>
  );
}
