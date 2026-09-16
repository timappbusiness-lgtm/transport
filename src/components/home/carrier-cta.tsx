import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { Check } from '@/components/icons';
import { buttonClasses } from '@/components/ui/button';
import { Eyebrow, Lede, Section } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { CARRIER_PLAN, formatNumber } from '@/content/home';
import { cn } from '@/lib/utils';

export function CarrierCta() {
  return (
    <Section id="transportatori" className="bg-black/20">
      <Container className="grid items-center gap-[clamp(1.75rem,4vw,3rem)] py-[clamp(3.25rem,7vw,5.5rem)] min-[880px]:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0">
          <Eyebrow>Pentru transportatori</Eyebrow>
          <h2 className="mt-2.5 mb-3.5 text-[clamp(1.75rem,3.7vw,2.75rem)]">
            Ai platformă? Nu te mai întoarce gol.
          </h2>
          <Lede>
            Postezi mașina pe tur și pe retur, vezi cererile de pe traseul tău și
            completezi locurile libere înainte să pleci. Documentele le încarci o
            singură dată — restul îl urmărim noi și te anunțăm înainte să expire ceva.
          </Lede>
          <Lede className="mt-4">
            Primele {CARRIER_PLAN.trialDays} de zile sunt gratuite și încep din ziua
            în care documentele îți sunt aprobate, nu de la înscriere. Fără card.
          </Lede>
        </div>

        <div className="min-w-0 rounded-card border border-border bg-surface p-6">
          <Eyebrow>Plan transportator</Eyebrow>
          <p className="mt-2 mb-4 flex items-baseline gap-1.5">
            <span className="font-display text-[2.5rem] leading-none font-extrabold tracking-[-0.035em]">
              {formatNumber(CARRIER_PLAN.priceRon)}
            </span>
            <span className="text-sm text-muted">lei / lună</span>
          </p>
          <ul className="mb-5 grid gap-2.5 text-sm text-muted">
            {CARRIER_PLAN.features.map((f) => (
              <li key={f.label} className="flex items-start gap-2.5">
                <Check size={13} className={cn('mt-1 flex-none', f.soon ? 'text-muted' : 'text-success')} />
                <span>
                  {f.label}
                  {f.soon && (
                    <span className="ml-2 rounded-[2px] border border-border px-1.5 py-px font-mono text-[0.625rem] tracking-[0.05em] whitespace-nowrap uppercase">
                      în curând
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Link href={ROUTES.carrierSignup} className={cn(buttonClasses('primary', 'md'), 'w-full')}>
            Înscrie-ți firma
          </Link>
        </div>
      </Container>
    </Section>
  );
}
