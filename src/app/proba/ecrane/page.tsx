import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Container } from '@/components/layout/container';
import {
  ActeSection,
  AdminActeSection,
  AdminContractSection,
  CereriMeleSection,
  ComandaSection,
  ContMobilSection,
  ContractSection,
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
import { AdminFiltersSection } from '@/components/proba/admin-filter-sections';
import {
  AntetSection,
  CereriTransportatorSection,
  probaRole,
} from '@/components/proba/header-sections';

export const metadata: Metadata = {
  title: 'Probă: ecrane',
  robots: { index: false, follow: false },
};

/** Read at request time: the harness exists only on a server started for the browser tests. */
export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

interface ProbaSection {
  slug: string;
  title: string;
  render: (params: Params) => ReactNode;
}

function one(params: Params, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

/** `?noi=12`: the new-requests count, a whole number, zero otherwise. */
function fresh(params: Params): number {
  const value = Number(one(params, 'noi') ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * One section per screen, each drawn alone so a sweep can measure it alone.
 *
 * Order: the public boards first, then the account, then the staff area —
 * the order somebody meets them in.
 */
const SECTIONS: readonly ProbaSection[] = [
  {
    slug: 'antet',
    title: 'Antetul, pentru fiecare fel de cont',
    render: (params) => (
      <AntetSection
        role={probaRole(one(params, 'rol'))}
        fresh={fresh(params)}
        pathname={one(params, 'pagina') ?? '/cereri'}
      />
    ),
  },
  { slug: 'cereri', title: 'Cereri: panoul și cardurile', render: () => <CereriSection /> },
  {
    slug: 'cereri-transportator',
    title: 'Cereri de transport, pentru un transportator',
    render: (params) => (
      <CereriTransportatorSection fresh={fresh(params)} all={one(params, 'doar') === 'toate'} />
    ),
  },
  { slug: 'cereri-mele', title: 'Cererile mele', render: () => <CereriMeleSection /> },
  { slug: 'trasee', title: 'Trasee: panoul', render: () => <TraseeSection /> },
  { slug: 'firme', title: 'Firme: lista și profilul', render: () => <FirmeSection /> },
  { slug: 'oferte', title: 'Oferte primite', render: () => <OferteSection /> },
  { slug: 'mesaje', title: 'O conversație', render: () => <MesajeSection /> },
  { slug: 'acte', title: 'Actele firmei', render: () => <ActeSection /> },
  { slug: 'comanda', title: 'O comandă', render: () => <ComandaSection /> },
  {
    slug: 'contract',
    title: 'Contractul de transport, pe pagina comenzii',
    render: (params) => <ContractSection state={one(params, 'stare')} />,
  },
  { slug: 'admin-contract', title: 'Contractul, pentru echipă', render: () => <AdminContractSection /> },
  { slug: 'admin-acte', title: 'Documente de verificat', render: () => <AdminActeSection /> },
  {
    slug: 'admin-oferte',
    title: 'Oferte, pentru echipă: filtrele',
    render: (params) => <AdminFiltersSection list="admin-oferte" params={params} />,
  },
  {
    slug: 'admin-transporturi',
    title: 'Transporturi, pentru echipă: filtrele',
    render: (params) => <AdminFiltersSection list="admin-transporturi" params={params} />,
  },
  {
    slug: 'admin-anunturi',
    title: 'Cereri și trasee, pentru echipă: filtrele',
    render: (params) => <AdminFiltersSection list="admin-anunturi" params={params} />,
  },
  {
    slug: 'admin-evaluari',
    title: 'Evaluări, pentru echipă: filtrele',
    render: (params) => <AdminFiltersSection list="admin-evaluari" params={params} />,
  },
  {
    slug: 'admin-jurnal',
    title: 'Jurnalul de acțiuni: filtrele',
    render: (params) => <AdminFiltersSection list="admin-jurnal" params={params} />,
  },
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

  const params = await searchParams;
  const requested = params.sectiune;
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
      {section.render(params)}
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
