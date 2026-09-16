import Link from 'next/link';
import { Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Card, Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { cn } from '@/lib/utils';

const c = homeCopy.carriers;

export function Carriers() {
  return (
    <section id="transportatori" className="bg-ground-alt">
      <Container className="grid items-start gap-10 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <SectionHead eyebrow={c.eyebrow} strong={c.strong} soft={c.soft}>
          <Lede>{c.lede}</Lede>
        </SectionHead>

        <Card className="min-w-0 p-6">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
            {c.plan.name}
          </p>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-[2.5rem] leading-none font-light tracking-[-0.03em]">
              {c.plan.price}
            </span>
            <span className="text-[0.9375rem] text-muted">{c.plan.period}</span>
          </p>
          <ul className="mt-6 grid gap-2.5">
            {c.plan.features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-[0.9375rem] text-muted">
                <Check size={16} className="mt-0.5 flex-none text-success" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <Link
            href={`${ROUTES.signUpCompany}?tip=transport`}
            className={cn(buttonClasses('primary', 'md'), 'mt-7 w-full')}
          >
            {c.plan.cta}
          </Link>
          <p className="mt-3 text-center text-[0.8125rem] text-muted">{c.plan.note}</p>
        </Card>
      </Container>
    </section>
  );
}
