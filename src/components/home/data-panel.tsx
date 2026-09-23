import { Container } from '@/components/layout/container';
import {
  Card,
  Lede,
  SampleTag,
  SectionHead,
  type StatusTone,
} from '@/components/ui/primitives';
import { homeCopy } from '@/content/home';
import { SeatDeck } from '@/components/ui/seat-deck';
import { DocumentFile } from '@/components/ui/document-file';
import { CorridorRoute } from '@/components/ui/corridor-route';
import { iconForFact } from '@/lib/icons';

const c = homeCopy.panel;

function PanelCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-5 motion-safe:animate-[rise-in_.6s_cubic-bezier(.22,.61,.36,1)_both]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 font-normal">{title}</h3>
          <p className="mt-0.5 truncate font-mono text-label text-muted">{subtitle}</p>
        </div>
        <SampleTag className="flex-none" />
      </div>
      {children}
    </Card>
  );
}

export function DataPanel() {
  return (
    <section id="cum-functioneaza" className="bg-ground-alt">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForFact('distance')} strong={c.strong} soft={c.soft}>
          <Lede>{c.lede}</Lede>
        </SectionHead>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          <PanelCard title={c.documents.title} subtitle={c.documents.subtitle}>
            <DocumentFile
              rows={c.documents.rows.map((row) => ({ ...row, tone: row.tone as StatusTone }))}
            />
          </PanelCard>

          <PanelCard title={c.seats.title} subtitle={c.seats.subtitle}>
            <SeatDeck
              taken={c.seats.taken}
              total={c.seats.total}
              freeLabel={c.seats.free}
              caption={c.seats.caption}
            />
          </PanelCard>

          <PanelCard title={c.corridor.title} subtitle={c.corridor.waypoints}>
            <CorridorRoute
              from={c.corridor.from}
              fromCc={c.corridor.fromCc}
              to={c.corridor.to}
              toCc={c.corridor.toCc}
              waypoints={c.corridor.waypoints}
              detour={c.corridor.detour}
              detourLabel={c.corridor.detourLabel}
            />
            <p className="mt-3 flex items-baseline gap-2 text-small text-muted">
              {c.corridor.windowLabel}
              <span className="font-mono tabular-nums text-foreground">{c.corridor.window}</span>
            </p>
          </PanelCard>
        </div>
      </Container>
    </section>
  );
}
