import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, Headline, SampleTag, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { cn } from '@/lib/utils';
import { PhotoSlot } from './photo-slot';
import { SeatDeck } from '@/components/ui/seat-deck';

const c = homeCopy.hero;

/** One of the cards floating over the hero photograph. */
function FloatCard({
  className,
  children,
}: {
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface/95 p-3.5 shadow-float backdrop-blur-sm',
        'motion-safe:animate-[float-in_.7s_cubic-bezier(.22,.61,.36,1)_both]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Hero() {
  return (
    <section
      data-surface="dark"
      className="-mt-[4.25rem] bg-[linear-gradient(135deg,var(--color-dark-from),var(--color-dark-to))] pt-[4.25rem] text-white"
    >
      <Container className="grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-24">
        <div className="min-w-0">
          <EyebrowPill tone="dark">{c.eyebrow}</EyebrowPill>
          <Headline
            as="h1"
            strong={c.strong}
            soft={c.soft}
            className="mt-6 text-display text-white [&_span:last-child]:text-white/60"
          />
          <p className="mt-5 max-w-[46ch] text-body-lg leading-relaxed text-white/80">
            {c.subtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={ROUTES.newRequest} className={buttonClasses('onDark', 'md')}>
              {c.primary}
            </Link>
            <Link href={ROUTES.routes} className={buttonClasses('onDarkGhost', 'md')}>
              {c.secondary}
            </Link>
          </div>
        </div>

        <div className="relative min-w-0">
          <PhotoSlot label={c.photoAlt} className="aspect-[4/3] w-full" />

          <FloatCard className="absolute -bottom-4 left-2 w-[min(17rem,78%)] sm:-left-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
                Documente
              </span>
              <SampleTag />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone="success">Licență valabilă</StatusBadge>
              <StatusBadge tone="warning">RCA expiră curând</StatusBadge>
            </div>
          </FloatCard>

          <FloatCard className="absolute -top-4 right-0 w-[min(13rem,60%)] sm:-right-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-label uppercase tracking-[0.12em] text-muted">
                Platformă
              </span>
              <SampleTag />
            </div>
            <SeatDeck taken={5} total={8} compact />
            <p className="mt-2 font-mono text-label tabular-nums text-foreground">
              3 locuri libere din 8
            </p>
          </FloatCard>
        </div>
      </Container>
    </section>
  );
}
