import { Container } from '@/components/layout/container';
import { Check, Warning } from '@/components/icons';
import { Eyebrow, Lede, Section, StatusDot } from '@/components/ui/primitives';
import { SAMPLE_CARRIER } from '@/content/home';
import { cn } from '@/lib/utils';

export function Compliance() {
  return (
    <Section id="verificare">
      <Container className="grid items-start gap-[clamp(2rem,4vw,3.5rem)] py-[clamp(3.25rem,7vw,5.5rem)] min-[940px]:grid-cols-[1fr_1.05fr]">
        <div className="min-w-0">
          <Eyebrow>Diferența</Eyebrow>
          <h2 className="mt-2.5 text-[clamp(1.75rem,3.7vw,2.75rem)]">
            „Firme verificate” e o promisiune. O dată de expirare e o dovadă.
          </h2>
          <Lede className="mt-3.5">
            Oricine poate scrie pe site că verifică firmele. Întrebarea e ce se
            întâmplă în august, când îi expiră RCA-ul unui transportator verificat
            în martie.
          </Lede>
          <div className="mt-6 grid gap-4 border-l-2 border-border pl-[1.125rem] text-[0.9375rem]">
            <p className="text-muted">
              De obicei:{' '}
              <span className="line-through decoration-danger decoration-1">
                „toate firmele sunt verificate”
              </span>{' '}
              — o dată, cândva, fără dată și fără urmări.
            </p>
            <p>
              La noi: fiecare document are o dată de expirare, urmărită zilnic. Cu
              30, 14, 7 și 1 zi înainte, transportatorul primește atenționare. După
              expirare, sistemul scoate singur de pe bursă mașina sau firma în cauză
              — până când documentul nou e aprobat.
            </p>
          </div>
        </div>

        <figure className="min-w-0 overflow-hidden rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <div className="font-display font-bold tracking-[-0.015em]">{SAMPLE_CARRIER.name}</div>
              <div className="font-mono text-xs text-muted">{SAMPLE_CARRIER.meta}</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-success/30 bg-success/12 px-2 py-1 font-mono text-[0.6875rem] tracking-[0.05em] whitespace-nowrap text-success">
              <Check size={11} />
              Documente valabile
            </span>
          </div>

          <ul>
            {SAMPLE_CARRIER.documents.map((doc) => (
              <li
                key={doc.name}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-border px-5 py-3 last:border-b-0',
                  doc.tone === 'warn' && 'bg-linear-to-r from-warning/12 to-transparent to-60%',
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm">{doc.name}</div>
                  <div className="font-mono text-[0.6875rem] text-muted">{doc.detail}</div>
                </div>
                <div className="flex items-center gap-2 justify-self-end">
                  <span className="font-mono text-xs whitespace-nowrap text-muted tabular-nums">{doc.status}</span>
                  <StatusDot tone={doc.tone} />
                </div>
              </li>
            ))}
          </ul>

          <figcaption className="flex items-start gap-2.5 bg-background px-5 py-3.5 text-[0.8125rem] text-muted">
            <Warning className="mt-0.5 flex-none text-warning" />
            <span>
              Exemplu. Dacă RCA-ul pentru {SAMPLE_CARRIER.plate} nu e reînnoit la
              timp, platforma iese de pe bursă în noaptea de după expirare. O singură
              mașină cu actele expirate nu scoate toată flota.
            </span>
          </figcaption>
        </figure>
      </Container>
    </Section>
  );
}
