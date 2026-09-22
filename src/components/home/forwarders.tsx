import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { iconForContent } from '@/lib/icons';

const c = homeCopy.forwarders;

export function Forwarders() {
  return (
    <section id="case-de-expeditii" className="bg-background">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={iconForContent('firma')} strong={c.strong} soft={c.soft}>
          <Lede>{c.lede}</Lede>
        </SectionHead>

        <ul className="mt-10 grid gap-4 sm:grid-cols-3">
          {c.points.map((point, index) => (
            <li
              key={point}
              className="rounded-card border border-border bg-surface p-5 text-[0.9375rem]"
            >
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="mt-2 leading-snug">{point}</p>
            </li>
          ))}
        </ul>

        <Link
          href={`${ROUTES.signUpCompany}?tip=expeditie`}
          className={`${buttonClasses('primary', 'md')} mt-8`}
        >
          {c.cta}
        </Link>
      </Container>
    </section>
  );
}
