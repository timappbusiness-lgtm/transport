import { Container } from '@/components/layout/container';
import { Section, SectionHead } from '@/components/ui/primitives';
import { VEHICLE_CATEGORIES } from '@/content/home';

export function Categories() {
  return (
    <Section>
      <Container className="py-[clamp(3.25rem,7vw,5.5rem)]">
        <SectionHead eyebrow="Ce se transportă" title="Nu doar autoturisme" className="mb-6" />
        <ul className="flex flex-wrap gap-2">
          {VEHICLE_CATEGORIES.map((c) => (
            <li key={c} className="rounded-card border border-border bg-surface px-3 py-2 text-sm">
              {c}
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
