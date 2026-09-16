import { Container } from '@/components/layout/container';
import { Car } from '@/components/icons';
import { CountryTag, Lede, Section, SectionHead } from '@/components/ui/primitives';
import { CORRIDOR_PRICES, formatNumber, PLATFORM } from '@/content/home';
import { cn } from '@/lib/utils';

export function Platforms() {
  const free = PLATFORM.slots - PLATFORM.taken;
  const cheapest = Math.min(...CORRIDOR_PRICES.map((p) => p.fromEur));

  return (
    <Section id="platforme">
      <Container className="py-[clamp(3.25rem,7vw,5.5rem)]">
        <SectionHead
          eyebrow="Cum iese prețul mic"
          title={`O platformă duce ${PLATFORM.slots} mașini. Plătești locul, nu camionul.`}
        >
          <Lede>
            Transportatorul leagă mai multe mașini pe același traseu. Cu cât
            platforma e mai plină, cu atât te costă mai puțin pe tine. De asta „pe
            sens” e ieftin și „expres” nu.
          </Lede>
        </SectionHead>

        <figure className="max-w-full rounded-card border border-border bg-surface p-[clamp(1.25rem,3vw,1.75rem)]">
          <div className="mb-[1.125rem] flex flex-wrap items-baseline justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display text-[1.0625rem] font-bold tracking-[-0.015em]">
                {PLATFORM.route.from.city} <CountryTag cc={PLATFORM.route.from.cc} /> →{' '}
                {PLATFORM.route.to.city} <CountryTag cc={PLATFORM.route.to.cc} />
              </div>
              <div className="font-mono text-xs text-muted">{PLATFORM.via}</div>
            </div>
            <div className="font-mono text-xs text-muted">exemplu · platformă deschisă {PLATFORM.slots} auto</div>
          </div>

          <div
            role="img"
            aria-label={`Platformă cu ${PLATFORM.slots} locuri: ${PLATFORM.taken} ocupate, ${free} libere`}
            className="grid grid-cols-4 gap-1.5 min-[560px]:grid-cols-8"
          >
            {Array.from({ length: PLATFORM.slots }, (_, i) => {
              const taken = i < PLATFORM.taken;
              return (
                <div
                  key={i}
                  className={cn(
                    'grid aspect-[3/4] place-items-center rounded-[3px] border',
                    taken
                      ? 'border-muted/40 bg-background text-muted'
                      : 'border-dashed border-accent bg-accent/6 font-mono text-[0.5625rem] tracking-[0.06em] text-accent',
                  )}
                >
                  {taken ? <Car className="w-[68%]" /> : 'liber'}
                </div>
              );
            })}
          </div>

          <figcaption className="mt-[1.125rem] text-[0.8125rem] text-muted">
            <b className="font-mono font-medium text-accent">{free}</b> locuri libere din {PLATFORM.slots}
          </figcaption>
        </figure>

        <div className="mt-8 grid gap-5 min-[720px]:grid-cols-2">
          <div className="min-w-0 border-t-2 border-accent pt-3.5">
            <h3 className="mb-1.5 text-[1.0625rem]">Pe sens</h3>
            <p className="text-sm text-muted">
              Aștepți până se umple platforma. Plătești doar locul mașinii tale.
            </p>
            <p className="mt-2 font-mono text-xl text-accent tabular-nums">de la {formatNumber(cheapest)} €</p>
          </div>
          <div className="min-w-0 border-t-2 border-border pt-3.5">
            <h3 className="mb-1.5 text-[1.0625rem]">Expres</h3>
            <p className="text-sm text-muted">
              Platformă dedicată, pleacă când ai nevoie. Plătești camionul întreg, de
              aceea costă mai mult.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
