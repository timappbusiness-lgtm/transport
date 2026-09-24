import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import {
  ActeSection,
  AdminActeSection,
  CereriMeleSection,
  ComandaSection,
  ContMobilSection,
  DashboardSection,
  MesajeSection,
  OferteSection,
} from '@/components/proba/account-sections';
import {
  AbonamenteSection,
  CereriSection,
  EvaluariSection,
  FirmeSection,
  TraseeSection,
} from '@/components/proba/public-sections';

export const metadata: Metadata = {
  title: 'Probă: ecrane',
  robots: { index: false, follow: false },
};

/** Read at request time: the harness exists only on a server started for the browser tests. */
export const dynamic = 'force-dynamic';

interface ProbaSection {
  slug: string;
  title: string;
  render: () => ReactNode;
}

/**
 * One section per screen, each drawn alone so a sweep can measure it alone.
 *
 * Order: the public boards first, then the account, then the staff area —
 * the order somebody meets them in.
 */
const SECTIONS: readonly ProbaSection[] = [
  { slug: 'cereri', title: 'Cereri: panoul și cardurile', render: () => <CereriSection /> },
  { slug: 'cereri-mele', title: 'Cererile mele', render: () => <CereriMeleSection /> },
  { slug: 'trasee', title: 'Trasee: panoul', render: () => <TraseeSection /> },
  { slug: 'firme', title: 'Firme: lista și profilul', render: () => <FirmeSection /> },
  { slug: 'oferte', title: 'Oferte primite', render: () => <OferteSection /> },
  { slug: 'mesaje', title: 'O conversație', render: () => <MesajeSection /> },
  { slug: 'acte', title: 'Actele firmei', render: () => <ActeSection /> },
  { slug: 'comanda', title: 'O comandă', render: () => <ComandaSection /> },
  { slug: 'admin-acte', title: 'Documente de verificat', render: () => <AdminActeSection /> },
  { slug: 'abonamente', title: 'Abonamente', render: () => <AbonamenteSection /> },
  { slug: 'evaluari', title: 'Evaluări', render: () => <EvaluariSection /> },
  { slug: 'cont-mobil', title: 'Contul pe telefon: bara de jos', render: () => <ContMobilSection /> },
  { slug: 'dashboard', title: 'Acasă, pentru un transportator', render: () => <DashboardSection /> },
];

/**
 * The real screens, with the longest content they can be given, for
 * `tests/e2e` layout sweeps at 1440px and 390px.
 *
 * Every account, staff and board screen needs a session and a database,
 * which the sandbox and CI do not have. What a layout sweep checks — a
 * name that pushes a phone sideways, a table that overflows its card, a
 * sticky bar under the fixed menu — lives in the components and their
 * containers, and those are what this page renders, unchanged, from the
 * samples in `src/components/proba/fixtures.ts`.
 *
 * `?sectiune=<slug>` draws one section inside
 * `<section data-proba-sectiune="<slug>">`; no parameter draws the list.
 *
 * A 404 unless the server was started with E2E_HARNESS=1, which only
 * `playwright.config.ts` does.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.E2E_HARNESS !== '1') notFound();

  const requested = (await searchParams).sectiune;
  if (requested === undefined) return <Index />;

  const section = SECTIONS.find((candidate) => candidate.slug === requested);
  if (section === undefined) notFound();

  return (
    <section data-proba-sectiune={section.slug}>
      <Container className="pt-6">
        <h1 className="font-mono text-label uppercase tracking-[0.12em] text-muted">
          Probă: {section.title}
        </h1>
      </Container>
      {section.render()}
    </section>
  );
}

function Index() {
  return (
    <Container className="py-10">
      <h1 className="text-h2">Probă: ecrane</h1>
      <p className="mt-2 max-w-[62ch] text-body text-muted">
        Ecranele reale, cu date de probă inventate și duse la limită. Fiecare secțiune se deschide
        singură.
      </p>
      <ul className="mt-6 flex flex-col gap-2" data-proba-index>
        {SECTIONS.map((section) => (
          <li key={section.slug}>
            <Link href={`?sectiune=${section.slug}`} className="text-body underline underline-offset-4">
              {section.title}
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
