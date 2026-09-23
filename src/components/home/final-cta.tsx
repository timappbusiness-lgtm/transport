import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Headline } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';

const c = homeCopy.finalCta;

export function FinalCta() {
  return (
    <section
      data-surface="dark"
      className="bg-[linear-gradient(135deg,var(--color-dark-from),var(--color-dark-to))] text-white"
    >
      <Container className="py-16 text-center sm:py-24">
        <Headline
          strong={c.strong}
          soft={c.soft}
          className="mx-auto max-w-[24ch] text-white [&_span:last-child]:text-white/60"
        />
        <p className="mx-auto mt-5 max-w-[48ch] text-body-lg text-white/80">{c.lede}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={ROUTES.newRequest} className={buttonClasses('onDark', 'md')}>
            {c.primary}
          </Link>
          <Link href={`${ROUTES.signUpCompany}?tip=transport`} className={buttonClasses('onDarkGhost', 'md')}>
            {c.secondary}
          </Link>
        </div>
      </Container>
    </section>
  );
}
