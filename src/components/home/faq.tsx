import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { FaqAccordion } from '@/components/faq/accordion';
import { Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { faqCopy } from '@/content/faq';
import type { FaqEntry } from '@/content/faq';
import { homepageFaq } from '@/lib/faq';
import { loadFaq } from '@/lib/faq-source';
import { uiIcon } from '@/lib/icons';

const c = faqCopy;

/**
 * Six questions on the homepage, the rest on their own page.
 *
 * Which six is decided in `homepageFaq`, not here: a question whose data is
 * missing — no plan, no review time — is never built, and the next one
 * moves up rather than leaving a gap.
 */
export async function Faq() {
  return <FaqBody entries={homepageFaq(await loadFaq())} />;
}

/** The section, given its questions rather than fetching them. */
export function FaqBody({ entries }: { entries: FaqEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section id="intrebari" className="bg-ground-alt">
      <Container className="py-16 sm:py-20">
        <SectionHead eyebrow={c.eyebrow} icon={uiIcon('search')} strong={c.strong} soft={c.soft}>
          <Lede>{c.lede}</Lede>
        </SectionHead>

        <FaqAccordion entries={entries} className="mt-10 lg:grid-cols-2" />

        <p className="mt-8 text-body">
          <Link
            href={ROUTES.faq}
            className="link-accent"
          >
            {c.seeAll}
          </Link>
        </p>
      </Container>
    </section>
  );
}
