import { Container } from '@/components/layout/container';
import { CountryTag, Lede, Section, SectionHead } from '@/components/ui/primitives';
import { CORRIDOR_PRICES, formatNumber, PRICE_LIVE_THRESHOLD } from '@/content/home';

export function Prices() {
  return (
    <Section id="preturi">
      <Container className="py-[clamp(3.25rem,7vw,5.5rem)]">
        <SectionHead eyebrow="Prețuri" title="Cât costă, înainte să întrebi pe cineva">
          <Lede>
            Tarife orientative pentru un autoturism pe o platformă comună. Când un
            coridor strânge cel puțin {PRICE_LIVE_THRESHOLD} transporturi încheiate
            prin platformă, estimarea e înlocuită de mediana prețurilor acceptate în
            ultimele 90 de zile.
          </Lede>
        </SectionHead>

        <div className="max-w-full overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[440px] border-collapse text-sm">
            <caption className="caption-bottom px-4 py-2.5 text-left font-mono text-[0.625rem] tracking-[0.05em] text-muted">
              Autoturism standard, până în 1.800 kg, transport pe sens.
            </caption>
            <thead>
              <tr className="bg-background font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
                <th scope="col" className="border-b border-border px-4 py-3 text-left font-medium">Coridor</th>
                <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium">Preț de la</th>
                <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium">Sursă</th>
              </tr>
            </thead>
            <tbody>
              {CORRIDOR_PRICES.map((row) => (
                <tr key={row.cc} className="bg-surface [&:not(:last-child)>td]:border-b [&>td]:border-border">
                  <th scope="row" className="px-4 py-3 text-left font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      {row.country} <CountryTag cc={row.cc} /> → România
                    </span>
                  </th>
                  <td className="px-4 py-3 text-right font-mono font-medium whitespace-nowrap text-accent tabular-nums">
                    {formatNumber(row.fromEur)} €
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[0.625rem] tracking-[0.05em] text-muted">
                    ESTIMAT
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3.5 max-w-[60ch] text-[0.8125rem] text-muted">
          <span className="font-mono text-[0.625rem] tracking-[0.05em]">ESTIMAT</span> = tarif
          orientativ de piață. Un tabel de sezon îmbătrânește; mediana din
          transporturi reale, nu.
        </p>
      </Container>
    </Section>
  );
}
