import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { ArrowRight } from '@/components/icons';
import { buttonClasses } from '@/components/ui/button';
import { Eyebrow, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { HERO_FACTS } from '@/content/home';
import { CorridorCanvas } from './corridor-canvas';

export function Hero() {
  return (
    <section className="hero relative isolate flex min-h-[min(620px,84vh)] items-center overflow-hidden border-b border-border">
      <CorridorCanvas />
      <Container className="py-[clamp(3rem,7vw,5.5rem)]">
        <div className="max-w-[43rem]">
          <Eyebrow className="rise">Bursă de transport auto · național și internațional</Eyebrow>
          <h1 className="rise d1 mt-[1.125rem] mb-3.5 text-[clamp(2.3rem,6.2vw,4.35rem)]">
            Transport auto, cu <em className="not-italic text-accent">actele la vedere</em>.
          </h1>
          <Lede className="rise d2">
            Postezi cererea gratuit și fără cont. Primești oferte de la transportatori
            care își țin documentele la zi — și vezi data exactă până la care sunt
            valabile, înainte să dai telefon.
          </Lede>
          <div className="rise d3 mt-7 flex flex-wrap gap-3">
            <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
              Adaugă cerere — gratuit, fără cont
              <ArrowRight />
            </Link>
            <a href="#platforme" className={buttonClasses('secondary', 'md')}>
              Cum iese prețul mic
            </a>
          </div>
          <p className="rise d4 mt-3.5 text-[0.8125rem] text-muted">
            Fără card, fără abonament. Transportatorii plătesc, tu nu.
          </p>
        </div>

        <dl className="rise d4 mt-[clamp(2.5rem,5vw,3.5rem)] grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border min-[720px]:grid-cols-4">
          {HERO_FACTS.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col-reverse justify-end bg-surface/75 px-4 py-4">
              <dt className="mt-0.5 text-xs text-muted">{f.label}</dt>
              <dd className="font-display text-[clamp(1.2rem,2.4vw,1.7rem)] leading-tight font-extrabold tracking-[-0.03em] tabular-nums">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
