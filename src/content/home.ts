/**
 * Homepage content.
 *
 * The design reference (design/landing.html) is a mock-up: its live
 * counters, category counts and request cards are the competitor's figures
 * read off bursatractari.ro (docs/07-competitor-analysis.md). None of that
 * can be shown as ours. Until the boards hold real data, the page shows
 * the mechanism — deadlines, rules, prices marked as estimates — and every
 * sample is labelled as a sample.
 */

export type CountryCode = 'AT' | 'DE' | 'ES' | 'HU' | 'IT' | 'NL' | 'RO';
export type Tone = 'ok' | 'warn' | 'danger';

export interface Place {
  city: string;
  cc: CountryCode;
}

export interface SampleRequest {
  kind: string;
  scope: 'Intern' | 'Extern';
  from: Place;
  to: Place;
  km: number;
  vehicle: string;
  condition: { label: string; tone: Extract<Tone, 'ok' | 'warn'> };
}

export const SAMPLE_REQUESTS: readonly SampleRequest[] = [
  {
    kind: 'Autoturism',
    scope: 'Extern',
    from: { city: 'Stuttgart', cc: 'DE' },
    to: { city: 'București', cc: 'RO' },
    km: 1_640,
    vehicle: 'Break diesel, 2019',
    condition: { label: 'rulează', tone: 'ok' },
  },
  {
    kind: 'Autoutilitară',
    scope: 'Extern',
    from: { city: 'Győr', cc: 'HU' },
    to: { city: 'Oradea', cc: 'RO' },
    km: 390,
    vehicle: 'Dubă 3,5 t — nu pornește',
    condition: { label: 'necesită troliu', tone: 'warn' },
  },
  {
    kind: 'Autoturism',
    scope: 'Extern',
    from: { city: 'Verona', cc: 'IT' },
    to: { city: 'Cluj-Napoca', cc: 'RO' },
    km: 1_380,
    vehicle: 'SUV, 2017',
    condition: { label: 'rulează', tone: 'ok' },
  },
  {
    kind: 'Motocicletă',
    scope: 'Extern',
    from: { city: 'Linz', cc: 'AT' },
    to: { city: 'Iași', cc: 'RO' },
    km: 1_250,
    vehicle: 'Naked 700 cm³, 2021',
    condition: { label: 'rulează', tone: 'ok' },
  },
  {
    kind: 'Utilaj agricol',
    scope: 'Intern',
    from: { city: 'Arad', cc: 'RO' },
    to: { city: 'Botoșani', cc: 'RO' },
    km: 640,
    vehicle: 'Tractor 4 t, fără înmatriculare',
    condition: { label: 'necesită rampă', tone: 'warn' },
  },
  {
    kind: 'Autoturism',
    scope: 'Extern',
    from: { city: 'Rotterdam', cc: 'NL' },
    to: { city: 'Constanța', cc: 'RO' },
    km: 2_150,
    vehicle: 'Sedan avariat față',
    condition: { label: 'necesită troliu', tone: 'warn' },
  },
];

/** The four facts the hero can state without a single live number. */
export const HERO_FACTS: readonly { value: string; label: string }[] = [
  { value: '0 lei', label: 'cererea ta, fără cont' },
  { value: '30·14·7·1', label: 'zile — atenționări înainte de expirare' },
  { value: 'zilnic', label: 'verificăm datele de expirare' },
  { value: '8 locuri', label: 'pe o platformă auto' },
];

export interface SampleDocument {
  name: string;
  detail: string;
  status: string;
  tone: Tone;
}

/** A sample carrier record. Fictional: no real company, CUI or plate. */
export const SAMPLE_CARRIER = {
  name: 'Transport Exemplu SRL',
  meta: 'CUI de exemplu · Timiș · 4 platforme',
  plate: 'TM 01 CRD',
  documents: [
    { name: 'Licență comunitară', detail: 'emisă de ARR', status: 'valabil 21.10.2027', tone: 'ok' },
    { name: 'Asigurare CMR', detail: 'limită 400.000 EUR', status: 'valabil 03.04.2027', tone: 'ok' },
    { name: 'ITP — platformă 8 auto', detail: 'TM 01 CRD', status: 'valabil 11.06.2027', tone: 'ok' },
    { name: 'RCA — platformă 8 auto', detail: 'TM 01 CRD', status: 'expiră în 12 zile', tone: 'warn' },
    { name: 'Copie conformă ARR', detail: 'TM 01 CRD', status: 'valabil 21.10.2027', tone: 'ok' },
  ] satisfies SampleDocument[],
} as const;

export interface CorridorPrice {
  cc: CountryCode;
  country: string;
  /** Market "from" price per car, EUR, consolidated (pe sens). */
  fromEur: number;
}

/**
 * Published market "from" tariffs for a standard car on a shared platform
 * (docs/07-competitor-analysis.md §2). Estimates, not our data: replaced
 * per corridor by the median of accepted prices once a corridor has at
 * least PRICE_LIVE_THRESHOLD closed transports on the platform.
 */
export const CORRIDOR_PRICES: readonly CorridorPrice[] = [
  { cc: 'DE', country: 'Germania', fromEur: 650 },
  { cc: 'IT', country: 'Italia', fromEur: 700 },
  { cc: 'NL', country: 'Olanda', fromEur: 700 },
  { cc: 'ES', country: 'Spania', fromEur: 750 },
];

export const PRICE_LIVE_THRESHOLD = 5;

export const PLATFORM = {
  slots: 8,
  taken: 5,
  route: { from: { city: 'München', cc: 'DE' }, to: { city: 'Cluj-Napoca', cc: 'RO' } },
  via: 'via Viena, Budapesta, Oradea',
} as const satisfies {
  slots: number;
  taken: number;
  route: { from: Place; to: Place };
  via: string;
};

/** Order follows the market share in docs/07 §1. No counts: they are not ours. */
export const VEHICLE_CATEGORIES: readonly string[] = [
  'Autoturisme',
  'Autoutilitare',
  'Motociclete',
  'Utilaje agricole',
  'Microbuze',
  'Utilaje de construcții',
  'Rulote',
  'Capete tractor',
  'Camioane',
  'Remorci',
  'Utilaje de manipulare',
  'Containere',
];

/** docs/05-pricing.md — `carrier` plan. */
export const CARRIER_PLAN = {
  priceRon: 149,
  trialDays: 30,
  features: [
    { label: 'Anunțuri nelimitate cu mașini pe tur și pe retur', soon: false },
    { label: 'Contacte nelimitate la cereri', soon: false },
    { label: 'Atenționări înainte să expire ITP, RCA sau copia conformă', soon: false },
    { label: 'Alerte pe WhatsApp pentru traseele tale', soon: true },
    { label: '2 anunțuri promovate incluse lunar', soon: true },
  ],
} as const;

const numberFormat = new Intl.NumberFormat('ro-RO');

/** Romanian grouping: 1.640, not 1,640. */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}
