import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { EyebrowPill, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { DRAFT_NOTICE, LEGAL_REVIEWED, type LegalDocument } from '@/content/legal';
import { missingLegalFields } from '@/config/company';

/**
 * One legal document, rendered.
 *
 * Numbered sections, because a legal text is referred to by number — „la
 * punctul 7" is how somebody quotes this back at us, and a page whose
 * sections have no numbers cannot be quoted.
 *
 * Two notices can appear above the text and both are facts rather than
 * decoration: that a lawyer has not yet read it, and that the company
 * details are not filled in. Neither is hidden, because a reader who
 * discovers either of them later has been misled by the omission.
 */
export function LegalPage({ document }: { document: LegalDocument }) {
  const missing = missingLegalFields();

  return (
    <Container className="max-w-[46rem] py-12 sm:py-16">
      <EyebrowPill tone="quiet">Document legal</EyebrowPill>
      <h1 className="mt-4 text-h1">{document.title}</h1>
      <p className="mt-3 text-sm text-muted">
        Versiunea {document.version}, în vigoare din{' '}
        {new Date(document.effectiveFrom).toLocaleDateString('ro-RO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Europe/Bucharest',
        })}
        .
      </p>
      <Lede className="mt-4">{document.lede}</Lede>

      {!LEGAL_REVIEWED ? (
        <div
          role="note"
          className="mt-6 rounded-card border border-warning/45 bg-warning/8 p-4 sm:p-5"
        >
          <p className="text-sm font-medium">{DRAFT_NOTICE.title}</p>
          <p className="mt-1 text-sm">{DRAFT_NOTICE.body}</p>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div
          role="note"
          className="mt-4 rounded-card border border-border bg-ground-alt p-4 sm:p-5"
        >
          <p className="text-sm">
            Datele de identificare ale operatorului nu sunt încă completate. Locurile marcate cu{' '}
            <span className="font-mono text-small">[de completat]</span> se completează în{' '}
            <span className="font-mono text-small">src/config/company.ts</span> înainte de
            lansare.
          </p>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col gap-8">
        {document.sections.map((section, index) => (
          <section key={section.title} aria-labelledby={`sec-${index + 1}`}>
            <h2 id={`sec-${index + 1}`} className="text-lg">
              <span className="text-muted">{index + 1}.</span> {section.title}
            </h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-body leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.link ? (
              <p className="mt-3">
                <Link
                  href={section.link.href}
                  className="text-body underline underline-offset-4"
                >
                  {section.link.label}
                </Link>
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <nav aria-label="Celelalte documente" className="mt-12 flex flex-wrap gap-5 text-sm">
        {[
          { href: ROUTES.terms, label: 'Termeni și condiții' },
          { href: ROUTES.privacy, label: 'Confidențialitate' },
          { href: ROUTES.cookies, label: 'Cookie-uri' },
        ]
          .filter((other) => !other.href.endsWith(document.slug))
          .map((other) => (
            <Link key={other.href} href={other.href} className="underline underline-offset-4">
              {other.label}
            </Link>
          ))}
      </nav>
    </Container>
  );
}
