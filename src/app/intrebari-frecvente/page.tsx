import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { FaqAccordion } from '@/components/faq/accordion';
import { Lede } from '@/components/ui/primitives';
import { SUPPORT_EMAIL } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { faqCopy } from '@/content/faq';
import { loadFaq } from '@/lib/faq-source';

const c = faqCopy;

export const metadata: Metadata = {
  title: c.page.title,
  description: c.page.description,
  alternates: { canonical: ROUTES.faq },
  // Nothing on this site is indexed before launch; the app-wide default in
  // the root layout says so, and this repeats it so a later change there
  // does not quietly expose the page.
  robots: { index: false, follow: true },
};

/** The answers are read from the database, so this is never prerendered. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const groups = await loadFaq();

  return (
    <Container className="py-12 sm:py-16">
      {/* Literal, because this is the page somebody opens when they do
          not yet know what the platform is. The two-tone head belongs to
          the homepage section, where the reader is being introduced to
          something rather than looking an answer up. */}
      <div className="max-w-[46rem]">
        <h1 className="text-h1">{c.heading}</h1>
        <Lede className="mt-4">{c.page.lede}</Lede>
      </div>

      {groups.map((group) => (
        <section key={group.id} aria-labelledby={group.id} className="mt-12">
          <h2 id={group.id} className="text-lg">
            {group.title}
          </h2>
          <FaqAccordion entries={group.entries} className="mt-5 lg:grid-cols-2" />
        </section>
      ))}

      {/* No address configured means no link: a mailto that goes nowhere
          is worse than not offering one. */}
      <p className="mt-12 text-sm text-muted">
        {c.page.stillStuck}{' '}
        {SUPPORT_EMAIL ? (
          <Link
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {c.page.contact}
          </Link>
        ) : (
          <Link
            href={ROUTES.contact}
            className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {c.page.contact}
          </Link>
        )}
      </p>

      <FaqJsonLd groups={groups} />
    </Container>
  );
}

/**
 * FAQPage structured data, built from the same entries the page renders.
 *
 * It describes what is on the page and nothing more: a question whose data
 * was missing is absent from both. Search engines are told not to index the
 * site yet, so this is preparation rather than a claim being made today.
 */
function FaqJsonLd({ groups }: { groups: Awaited<ReturnType<typeof loadFaq>> }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((group) =>
      group.entries.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer.join(' ') },
      })),
    ),
  };

  return (
    <script
      type="application/ld+json"
      // The content is our own copy, not user input: every string comes
      // from src/content/faq.ts or from a label in the database that only
      // staff can write.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
