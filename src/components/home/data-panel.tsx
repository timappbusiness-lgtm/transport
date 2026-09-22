import { Container } from '@/components/layout/container';
import {
  Card,
  CountryTag,
  Lede,
  SampleTag,
  SectionHead,
  StatusBadge,
  type StatusTone,
} from '@/components/ui/primitives';
import { homeCopy } from '@/content/home';
import { SeatDeck } from '@/components/ui/seat-deck';
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
          <h3 className="text-[1.0625rem] font-normal">{title}</h3>
          <p className="mt-0.5 truncate font-mono text-[0.6875rem] text-muted">{subtitle}</p>
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
            <ul className="min-w-0">
              {c.documents.rows.map((row) => (
                <li
                  key={row.label}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                    {row.label}
                  </span>
                  <span className="font-mono text-[0.8125rem] tabular-nums">{row.value}</span>
                  <StatusBadge tone={row.tone as StatusTone}>{row.state}</StatusBadge>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard title={c.seats.title} subtitle={c.seats.subtitle}>
            <SeatDeck taken={c.seats.taken} total={c.seats.total} freeLabel={c.seats.free} />
            <p className="mt-4 font-mono text-[0.8125rem] tabular-nums">{c.seats.caption}</p>
          </PanelCard>

          <PanelCard title={c.corridor.title} subtitle={c.corridor.waypoints}>
            <div className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
              <span>{c.corridor.from}</span>
              <CountryTag cc={c.corridor.fromCc} />
              <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" className="text-border-strong">
                <path
                  d="M0 5h15M12 1.5 15.5 5 12 8.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{c.corridor.to}</span>
              <CountryTag cc={c.corridor.toCc} />
            </div>
            <dl className="mt-5 min-w-0">
              <div className="flex items-center gap-3 border-b border-border py-2.5">
                <dt className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                  {c.corridor.detourLabel}
                </dt>
                <dd className="font-mono text-[0.8125rem] tabular-nums">{c.corridor.detour}</dd>
              </div>
              <div className="flex items-center gap-3 py-2.5">
                <dt className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted">
                  {c.corridor.windowLabel}
                </dt>
                <dd className="font-mono text-[0.8125rem] tabular-nums">{c.corridor.window}</dd>
              </div>
            </dl>
          </PanelCard>
        </div>
      </Container>
    </section>
  );
}
