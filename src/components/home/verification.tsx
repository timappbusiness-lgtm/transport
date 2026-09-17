import { Container } from '@/components/layout/container';
import { Lede, SectionHead, StatusBadge } from '@/components/ui/primitives';
import { homeCopy } from '@/content/home';

const c = homeCopy.verification;

export function Verification() {
  return (
    <section id="verificare" className="bg-ground-alt">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} strong={c.strong} soft={c.soft}>
          <Lede>{c.body}</Lede>
        </SectionHead>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {c.rules.map((rule) => (
            <div key={rule.title} className="rounded-card border border-border bg-surface p-5">
              <StatusBadge tone={rule.tone}>
                {rule.tone === 'danger' ? 'blochează firma' : 'blochează vehiculul'}
              </StatusBadge>
              <h3 className="mt-4 text-[1.0625rem] font-normal">{rule.title}</h3>
              <p className="mt-2 text-[0.9375rem] text-muted">{rule.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
