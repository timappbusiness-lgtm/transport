import { ROUTES } from '@/config/routes';

/**
 * Romanian copy for the questions people actually ask.
 *
 * The answers that depend on a rule — which documents, what the
 * subscription costs, how long review takes — are not written here. They
 * are assembled in `src/lib/faq.ts` from the same rows the platform
 * enforces, so an answer cannot drift away from the rule it describes.
 * What is here is the copy that has no data behind it.
 */

export type FaqGroupId = 'clienti' | 'transportatori';

export interface FaqLink {
  href: string;
  label: string;
}

export interface FaqEntry {
  id: string;
  question: string;
  /** One paragraph per element. */
  answer: string[];
  link?: FaqLink;
}

export interface FaqGroup {
  id: FaqGroupId;
  title: string;
  entries: FaqEntry[];
}

export const faqCopy = {
  eyebrow: 'Întrebări frecvente',
  /** The homepage section, which is a marketing head in two tones. */
  strong: 'Întrebări',
  soft: 'pe care le primim des.',
  /** The page's own heading: literal, what it is, in two words. */
  heading: 'Cum funcționează',
  lede:
    'Răspunsurile despre documente, tarife și verificare sunt luate din regulile pe care platforma le aplică.',
  seeAll: 'Vezi toate întrebările',
  groups: {
    clienti: 'Pentru clienți',
    transportatori: 'Pentru transportatori',
  },
  page: {
    title: 'Cum funcționează',
    description:
      'Ce acte sunt necesare, cât costă publicarea unei cereri, cum verificăm firmele de transport și ce se întâmplă când expiră un document.',
    lede:
      'Răspunsurile despre documente, tarife și verificare sunt luate din regulile pe care platforma le aplică, nu scrise separat.',
    stillStuck: 'Nu ai găsit răspunsul aici?',
    contact: 'Scrie-ne',
  },
} as const;

/** The questions with a fixed answer, in the order the page reads them. */
export const STATIC_FAQ: Record<FaqGroupId, FaqEntry[]> = {
  clienti: [
    {
      id: 'acte-vehicul',
      question: 'Ce acte pregătesc pentru transportul unui vehicul?',
      answer: [
        'De obicei transportatorul îți cere certificatul de înmatriculare (talonul), un act de identitate și documentul de proprietate: factura sau contractul de vânzare-cumpărare. Pentru un vehicul cumpărat din străinătate pot fi necesare și documentele de export ale țării respective. Confirmă lista cu transportatorul înainte de preluare.',
      ],
    },
    {
      id: 'cost-cerere',
      question: 'Cât costă să public o cerere?',
      answer: ['Nimic. Publicarea cererii și primirea ofertelor sunt gratuite pentru clienți.'],
    },
    {
      id: 'date-contact',
      question: 'Cine vede datele mele de contact?',
      answer: [
        'Transportatorii văd traseul și vehiculul. Telefonul tău rămâne ascuns până alegi să intri în legătură cu o firmă sau confirmi o comandă.',
      ],
    },
    {
      id: 'acte-in-regula',
      question: 'Cum știu că firma are actele în regulă?',
      answer: [
        'Firmele pot trimite oferte doar după ce documentele sunt aprobate de echipa noastră. Urmărim zilnic datele de expirare, iar o platformă cu RCA sau ITP expirat iese automat de pe bursă.',
      ],
      link: { href: ROUTES.verification, label: 'Cum verificăm firmele' },
    },
    {
      id: 'pe-sens-expres',
      question: 'Ce înseamnă transport pe sens și expres?',
      answer: [
        'Pe sens, vehiculul tău ocupă un loc liber pe o platformă care are deja drum pe ruta ta, deci prețul este mai mic. Expres înseamnă o plecare dedicată, cu termen mai scurt și preț mai mare.',
      ],
    },
  ],
  transportatori: [
    {
      id: 'lista-publica',
      question: 'Pot apărea în lista publică de firme?',
      answer: [
        'Da, dacă alegi asta. Bifezi „Afișează firma în lista publică” în contul firmei, iar profilul apare după ce firma este verificată. Poți ieși din listă oricând, iar profilul dispare imediat. Firmele suspendate nu apar.',
      ],
      link: { href: ROUTES.companies, label: 'Vezi lista de firme' },
    },
    {
      id: 'dispeceri',
      question: 'Pot lucra cu mai mulți dispeceri în același cont?',
      answer: [
        'Da. Contul aparține firmei, nu unei persoane. Inviți colegii pe e-mail din secțiunea Membri și fiecare are rolul lui: proprietar, administrator sau dispecer. Poți retrage accesul oricând.',
      ],
    },
  ],
};
