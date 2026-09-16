import { Container } from '@/components/layout/container';
import { RouteArrow } from '@/components/icons';
import { Chip, CountryTag, Lede, Section, SectionHead } from '@/components/ui/primitives';
import { formatNumber, SAMPLE_REQUESTS } from '@/content/home';

export function SampleRequests() {
  return (
    <Section id="cereri">
      <Container className="py-[clamp(3.25rem,7vw,5.5rem)]">
        <SectionHead eyebrow="Cereri" title="Cereri ca acestea ajung la transportatori">
          <Lede>
            Cele mai multe vin de pe coridoarele din vest spre România — mașini
            cumpărate în Germania, Italia sau Olanda. A doua categorie: vehicule
            care nu mai rulează și au nevoie de troliu.
          </Lede>
        </SectionHead>

        <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border min-[680px]:grid-cols-2 min-[1040px]:grid-cols-3">
          {SAMPLE_REQUESTS.map((r) => (
            <article key={`${r.from.city}-${r.to.city}`} className="flex min-w-0 flex-col gap-3 bg-surface px-5 py-[1.125rem]">
              <div className="flex items-center justify-between gap-3 font-mono text-[0.6875rem] text-muted">
                <span className="uppercase tracking-[0.1em]">
                  {r.kind} · <b className="font-medium text-foreground/80">{r.scope}</b>
                </span>
                <span>exemplu</span>
              </div>
              <h3 className="flex flex-wrap items-center gap-2 text-[1.0625rem]">
                {r.from.city} <CountryTag cc={r.from.cc} />
                <RouteArrow className="flex-none text-muted" />
                <span className="sr-only">spre</span>
                {r.to.city} <CountryTag cc={r.to.cc} />
              </h3>
              <p className="flex flex-wrap items-baseline gap-2.5 text-sm text-muted">
                <span className="rounded-[2px] border border-border bg-background px-1.5 py-px font-mono text-[0.8125rem] text-foreground tabular-nums">
                  {formatNumber(r.km)} km
                </span>
                {r.vehicle}
              </p>
              <div>
                <Chip tone={r.condition.tone}>{r.condition.label}</Chip>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
