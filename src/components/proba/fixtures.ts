import type { User } from '@supabase/supabase-js';
import type { ScreenRequirement, ScreenVehicle } from '@/components/account/documents-screen';
import type { HistoryRow } from '@/components/account/document-history';
import type { PendingCompany, PendingDocument } from '@/components/admin/review-queue';
import type { AccountContext, Company, Profile } from '@/lib/auth/account';
import type { CarrierDashboard } from '@/lib/dashboard-source';
import type { PublicDeparture } from '@/lib/departures';
import type { PublicCompany } from '@/lib/directory';
import type { CompanyProfile } from '@/lib/directory-source';
import type { Message } from '@/lib/messages';
import type { MyRequest } from '@/lib/my-requests';
import type { NavCounts } from '@/lib/navigation';
import { DEFAULT_OFFER_SETTINGS, type OfferSettings } from '@/lib/offers';
import type { EligibleVehicle, OfferForRequest, OfferQuota, ThreadMessage } from '@/lib/offers-source';
import type { TimelineEvent } from '@/lib/orders';
import type { EvidenceRow, OrderRow } from '@/lib/orders-source';
import type { Plan, PricingSettings } from '@/lib/plans';
import type { PendingRating, PublicRating } from '@/lib/ratings-source';
import type { PublicRequest } from '@/lib/requests';
import type { CompanySubscription } from '@/lib/subscription-source';

/**
 * Sample data for `/proba/ecrane`, and nothing else.
 *
 * Every row here is invented. Each one is realistic Romanian data pushed
 * to the far end of what the database accepts — the longest locality,
 * the firm name with no space for thirty characters, the 1.000-character
 * message — because that is where a layout breaks, and a layout that
 * only ever meets „Cluj → București" has not been tested. The page that
 * renders these exists only on a server started with E2E_HARNESS=1.
 *
 * The types are the real ones, imported from the components and the
 * loaders, so a component that changes its props breaks the typecheck
 * here instead of the harness quietly rendering something else.
 */

// ---------------------------------------------------------------------
// The clock and the ids
// ---------------------------------------------------------------------

/** One fixed „now" for every fixture, so relative times do not drift between runs. */
export const PROBA_NOW = '2026-09-24T09:00:00.000Z';
const NOW_MS = Date.parse(PROBA_NOW);

function hoursAgo(hours: number): string {
  return new Date(NOW_MS - hours * 3_600_000).toISOString();
}

function hoursAhead(hours: number): string {
  return new Date(NOW_MS + hours * 3_600_000).toISOString();
}

/** A calendar day, `YYYY-MM-DD`, this many days from the fixed „now". */
function day(offset: number): string {
  return new Date(NOW_MS + offset * 86_400_000).toISOString().slice(0, 10);
}

/** A stable uuid-shaped id, so keys and anchors are the same on every render. */
function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

// ---------------------------------------------------------------------
// The long values every section reuses
// ---------------------------------------------------------------------

/** About forty-five characters each, with the diacritics a real locality has. */
export const LONG_FROM = 'Sânmartinu de Câmpie-Bistrița-Năsăud-Șieu-Odorhei';
export const LONG_TO = 'Ștefan cel Mare, comuna Glodeanu-Siliștea, Buzău';

/** A firm name with a thirty-character run and no space in it, ninety characters in all. */
export const LONG_COMPANY =
  'SC EUROTRANSAUTOLOGISTICCARPATICA INTERNATIONAL SERVICII DE TRANSPORT RUTIER ȘI EXPEDIȚII SRL';

/** Seventy-odd characters, hyphens instead of spaces. */
export const HYPHEN_COMPANY =
  'SC-TRANSPORTURI-INTERNATIONALE-AUTOVEHICULE-PLATFORME-DUNĂREA-DE-JOS SRL';

/** Sixty characters: a double first name, a double surname and a role. */
export const LONG_PERSON = 'Maria-Alexandra Constantinescu-Dumitrescu, dispecerat Ardeal';

/** A hundred and twenty characters with nowhere to break: a reference pasted from a CMR. */
export const UNBROKEN_TOKEN = `CMR${'SANMARTINUDECAMPIECLUJNAPOCAPASSATVARIANT'.repeat(3)}`.slice(0, 120);

/** A link pasted into a message, no space and no hyphen anywhere in the path. */
export const LONG_URL =
  'https://www.exemplu.ro/dosare/fotografii_inspectie/2026/septembrie/SanmartinuDeCampie_ClujNapoca_VolkswagenPassatB8Variant_zgarieturiBaraSpateSiAripaStanga.zip';

/** A stand-in photograph: the app icon, served by this app, so no bucket is needed. */
export const SAMPLE_PHOTO = '/icons/icon-512.png';

const PRICE_INCLUDES =
  'Prețul include transportul pe platformă auto deschisă de la adresa indicată până la destinație, ' +
  'asigurarea CMR pentru valoarea declarată a vehiculului de până la 50.000 EUR, taxele de drum și ' +
  'rovinietele pe tot traseul, inclusiv taxa de pod de la Giurgiu dacă ruta o cere, încărcarea cu ' +
  'troliu dacă mașina nu pornește, două chingi suplimentare pe fiecare roată și fotografii la ' +
  'încărcare și la descărcare trimise în aceeași zi. Nu include parcarea peste noapte în depozit ' +
  'dacă destinatarul nu poate primi mașina în ziua convenită și nici spălarea vehiculului înainte de predare.';

const OFFER_MESSAGE =
  'Bună ziua. Suntem pe ruta asta în fiecare marți și vineri, cu o platformă de opt locuri care ' +
  'pleacă din Bistrița dimineața la șase. Dacă mașina poate fi încărcată până la ora nouă, ajunge ' +
  'la destinație a doua zi înainte de prânz. Șoferul vă sună cu o oră înainte de sosire, iar la ' +
  'predare facem împreună fișa de stare, cu fotografii din toate cele patru colțuri și din habitaclu. ' +
  'Dacă vehiculul are jante de aliaj mai mari de nouăsprezece țoli, vă rog să ne spuneți dinainte, ' +
  'pentru că folosim alte chingi. Pentru plata la livrare avem nevoie de confirmarea scrisă a ' +
  'destinatarului, altfel factura pleacă la zece zile de la predare.';

const REJECTION_REASON =
  'Fotografia nu este lizibilă: seria poliței și data de expirare sunt acoperite de reflexia ' +
  'blițului, iar colțul din dreapta jos, unde este ștampila asigurătorului, lipsește din cadru. ' +
  'Vă rugăm să fotografiați documentul pe o suprafață mată, fără bliț, cu toate cele patru colțuri ' +
  'vizibile, și să îl încărcați din nou.';

const LONG_REVIEW = [
  'Am lucrat cu firma asta pentru trei transporturi la rând, toate din Germania, și le scriu pe toate aici ' +
    'pentru că fiecare a avut altceva de spus. Primul a fost un Passat Variant din Stuttgart: au venit la ' +
    'ora anunțată, au făcut fișa de stare cu mine de față și au trimis fotografiile de la încărcare în aceeași seară.',
  'Al doilea a fost o autorulotă de aproape patru tone, care nu pornea. Au venit cu troliu fără să mai ' +
    'întreb, pentru că scrisesem în cerere că nu pornește, și au legat-o cu chingi pe fiecare roată. ' +
    'A ajuns cu o zi mai târziu decât se spusese, dar m-au sunat de pe drum să îmi spună de ce: coadă de ' +
    'șase ore la vama de la Nădlac, lucru pe care îl vedeam și eu la știri.',
  'Al treilea a fost o motocicletă, și singurul lucru pe care l-aș fi vrut altfel este că fotografiile de ' +
    'la predare au fost doar două, ambele din același unghi. Nu era nimic de văzut pe ele, motocicleta a ' +
    'ajuns perfect, dar dacă ar fi fost o zgârietură nu aș fi avut cu ce să o compar. Le-am spus asta și ' +
    'mi-au răspuns că de acum fac câte patru la fiecare vehicul. Recomand, cu mențiunea asta.',
].join('\n\n');

const LONG_REPLY =
  'Mulțumim pentru toate trei. Pentru întârzierea de la Nădlac nu aveam ce face, dar ați avut dreptate cu ' +
  'fotografiile de la predare: de luna asta fiecare șofer face patru, din colțuri, plus una din habitaclu, ' +
  'și le trimite înainte să plece de la destinatar.';

const LONG_MESSAGE =
  'Bună ziua, revin cu toate detaliile pe care le-ați cerut, ca să nu mai pierdem timp la încărcare. ' +
  'Mașina este un Volkswagen Passat Variant din 2019, motor 2.0 TDI, cutie automată, culoare gri închis. ' +
  'Pornește și merge, dar are bateria slabă: dacă stă mai mult de două zile trebuie pornită cu cabluri, ' +
  'așa că vă rog să aveți un booster la dumneavoastră. Cheia de rezervă și certificatul de înmatriculare ' +
  'le las în torpedou, într-un plic, iar talonul ITP este la zi până în martie anul viitor.\n\n' +
  'La adresa de încărcare se intră pe poarta din spate, pe strada paralelă cu drumul național, pentru că ' +
  'pe cea din față nu încape o platformă de opt locuri. Poarta se deschide de la distanță: vă rog să îmi ' +
  'scrieți aici cu jumătate de oră înainte și o deschid eu. Dacă nu răspund în zece minute, sunați-l pe ' +
  'vecinul de la numărul 14, care are cheia și știe despre ce este vorba.\n\n' +
  'La destinație mașina o primește fratele meu, care lucrează în schimburi. Între orele 14 și 22 este la ' +
  'serviciu, deci predarea ar trebui să fie ori dimineața, ori după 22. Dacă nu se poate, prefer să rămână ' +
  'o noapte în depozitul dumneavoastră și să o aduceți a doua zi dimineață, chiar dacă asta costă ceva în plus.';

// ---------------------------------------------------------------------
// The account behind every screen under /cont
// ---------------------------------------------------------------------

const baseCompany: Company = {
  id: id(1),
  cui: 'RO40218867',
  legal_name: LONG_COMPANY,
  display_name: null,
  company_type: 'transport',
  verification_status: 'verified',
  verification_note: null,
  is_suspended: false,
  suspended_at: null,
  suspension_reason: null,
  county: 'BN',
  city: 'Sânmartinu de Câmpie',
  contact_email: 'dispecerat@exemplu.ro',
  contact_phone: '+40 740 000 000',
  public_profile_enabled: true,
  slug: 'eurotransautologisticcarpatica',
  public_description: null,
  logo_path: null,
  address: 'Strada Principală nr. 214, Sânmartinu de Câmpie',
  website: 'https://www.exemplu.ro',
  // `judetean` is the scope that draws all forty-two counties, which is
  // what makes the coverage tab long enough to test its save bar.
  coverage_scope: 'judetean',
  coverage_counties: ['BN', 'CJ', 'MS', 'SJ', 'MM', 'SV', 'HR', 'BV', 'AB', 'HD'],
  coverage_countries: [],
  vehicle_types_accepted: ['autoturism', 'autoutilitara', 'motocicleta', 'rulota', 'istoric', 'atv_quad'],
  equipment: ['troliu', 'rampe', 'chingi', 'remorca_inchisa'],
  services: ['transport_platforma', 'tractare', 'transport_nefunctional', 'ridicare_domiciliu'],
  indicative_rate_ron_per_km: 4.8,
  indicative_rate_note: 'La peste 500 km prețul pe kilometru scade.',
  base_address_hidden: true,
  alerts_enabled: true,
  alerts_email: null,
  profile_updated_at: hoursAgo(72),
};

export const PROBA_COMPANY: Company = baseCompany;

/** A second firm, so the sidebar draws the switcher rather than a name. */
const secondCompany: Company = {
  ...baseCompany,
  id: id(2),
  cui: 'RO41137720',
  legal_name: 'CASA DE EXPEDIȚII TRANSILVANIA NORD-EST LOGISTICĂ ȘI REPREZENTANȚĂ COMERCIALĂ SRL',
  company_type: 'expeditie',
  slug: null,
  public_profile_enabled: false,
};

const user: User = {
  id: id(10),
  app_metadata: { provider: 'email' },
  user_metadata: {},
  aud: 'authenticated',
  email: 'maria.constantinescu@exemplu.ro',
  created_at: hoursAgo(24 * 120),
};

const profile: Profile = {
  id: id(10),
  full_name: 'Maria-Alexandra Constantinescu-Dumitrescu',
  email: 'maria.constantinescu@exemplu.ro',
  phone: '+40 740 000 000',
  phone_verified: true,
  account_type: 'company',
  terms_version_accepted: '1.0',
  is_test: true,
  email_undeliverable_at: null,
  last_seen_at: null,
};

/** The owner of a verified carrier with two firms, which is the fullest sidebar there is. */
export const PROBA_CONTEXT: AccountContext = {
  user,
  profile,
  memberships: [
    { role: 'owner', company: baseCompany },
    { role: 'admin', company: secondCompany },
  ],
  activeCompany: baseCompany,
  activeRole: 'owner',
  isStaff: false,
};

/** Double digits on the badges, which is the width that matters. */
export const PROBA_COUNTS: NavCounts = { messages: 12, offers: 7, documents: 3 };

export const PROBA_SUBSCRIPTION: CompanySubscription = {
  planCode: 'carrier',
  status: 'trialing',
  isTrial: true,
  periodEnd: day(11),
  daysLeft: 11,
  pendingRequest: null,
};

// ---------------------------------------------------------------------
// cereri
// ---------------------------------------------------------------------

function request(overrides: Partial<PublicRequest> & Pick<PublicRequest, 'id'>): PublicRequest {
  return {
    category: 'autoturism',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2018,
    is_running: true,
    service_type: 'pe_sens',
    from_city: 'Cluj-Napoca',
    from_country: 'RO',
    to_city: 'București',
    to_country: 'RO',
    estimated_km: 447,
    published_at: hoursAgo(2),
    board: 'curse',
    loading_from: day(2),
    loading_to: day(5),
    weight_kg: 1320,
    needs_winch: false,
    photo_count: 3,
    is_domestic: true,
    from_county: 'CJ',
    to_county: 'B',
    from_lat: 46.77,
    from_lng: 23.6,
    to_lat: 44.43,
    to_lng: 26.1,
    ...overrides,
  };
}

/** Four cards: an ordinary one, both ends long, the biggest numbers, a long foreign name. */
export const BOARD_REQUESTS: PublicRequest[] = [
  request({ id: id(101) }),
  request({
    id: id(102),
    category: 'autoutilitara',
    make: 'Mercedes-Benz',
    model: 'Sprinter 519 CDI Maxi cu prelată și lift hidraulic',
    year: 2021,
    is_running: false,
    needs_winch: true,
    service_type: 'expres',
    from_city: LONG_FROM,
    from_county: 'BN',
    to_city: LONG_TO,
    to_county: 'BZ',
    estimated_km: 612,
    weight_kg: 3490,
    published_at: hoursAgo(0.3),
    photo_count: 11,
  }),
  request({
    id: id(103),
    category: 'rulota',
    make: 'Hymer',
    model: 'B-Klasse MasterLine T 780',
    year: 2016,
    service_type: 'tractare',
    from_city: 'Vila Nova de Gaia',
    from_country: 'PT',
    from_county: null,
    to_city: 'Constanța',
    to_county: 'CT',
    estimated_km: 4850,
    weight_kg: 40000,
    is_domestic: false,
    published_at: hoursAgo(26),
    loading_to: null,
  }),
  request({
    id: id(104),
    category: 'motocicleta',
    make: 'BMW',
    model: 'R 1250 GS Adventure',
    year: 2022,
    board: 'retur',
    from_city: 'Garmisch-Partenkirchen',
    from_country: 'DE',
    from_county: null,
    to_city: 'Drobeta-Turnu Severin',
    to_county: 'MH',
    estimated_km: 1480,
    weight_kg: null,
    is_domestic: false,
    published_at: hoursAgo(24 * 9),
    photo_count: 0,
  }),
];

export const MY_REQUESTS: MyRequest[] = [
  {
    id: id(111),
    status: 'offers_received',
    fromCity: LONG_FROM,
    fromCountry: 'RO',
    toCity: LONG_TO,
    toCountry: 'RO',
    loadingFrom: day(2),
    loadingTo: day(9),
    category: 'autoutilitara',
    make: 'Mercedes-Benz',
    model: 'Sprinter 519 CDI Maxi cu prelată și lift hidraulic',
    year: 2021,
    isRunning: false,
    needsWinch: true,
    serviceType: 'expres',
    publishedAt: hoursAgo(20),
    createdAt: hoursAgo(21),
    hiddenAt: null,
    hiddenReason: null,
  },
  {
    id: id(112),
    status: 'draft',
    fromCity: 'Vila Nova de Gaia',
    fromCountry: 'PT',
    toCity: 'Constanța',
    toCountry: 'RO',
    loadingFrom: day(14),
    loadingTo: null,
    category: 'rulota',
    make: 'Hymer',
    model: 'B-Klasse MasterLine T 780',
    year: 2016,
    isRunning: true,
    needsWinch: false,
    serviceType: 'tractare',
    publishedAt: null,
    createdAt: hoursAgo(3),
    hiddenAt: null,
    hiddenReason: null,
  },
  {
    id: id(113),
    status: 'suspended',
    fromCity: 'Garmisch-Partenkirchen',
    fromCountry: 'DE',
    toCity: 'Drobeta-Turnu Severin',
    toCountry: 'RO',
    loadingFrom: day(-3),
    loadingTo: day(1),
    category: 'motocicleta',
    make: 'BMW',
    model: 'R 1250 GS Adventure',
    year: 2022,
    isRunning: true,
    needsWinch: false,
    serviceType: 'pe_sens',
    publishedAt: hoursAgo(24 * 6),
    createdAt: hoursAgo(24 * 6),
    hiddenAt: hoursAgo(24),
    hiddenReason:
      'Cererea conținea un număr de telefon în câmpul de observații, iar datele de contact se dau numai după ' +
      `acceptarea unei oferte. Referința scrisă în cerere era ${UNBROKEN_TOKEN}.`,
  },
];

// ---------------------------------------------------------------------
// trasee
// ---------------------------------------------------------------------

function departure(overrides: Partial<PublicDeparture> & Pick<PublicDeparture, 'truck_listing_id'>): PublicDeparture {
  return {
    direction: 'tur',
    from_country: 'RO',
    from_county: 'CJ',
    from_city: 'Cluj-Napoca',
    to_country: 'DE',
    to_county: null,
    to_city: 'München',
    waypoints: [],
    available_from: day(1),
    available_to: day(3),
    service_types: ['pe_sens'],
    accepted_vehicle_types: ['autoturism', 'autoutilitara'],
    platform_slots_total: 8,
    slots_taken: 5,
    slots_free: 3,
    price_indicative: 450,
    currency: 'EUR',
    published_at: hoursAgo(5),
    is_domestic: false,
    from_locality_lat: 46.77,
    from_locality_lng: 23.6,
    free_capacity_kg: 6000,
    ...overrides,
  };
}

export const DEPARTURES: PublicDeparture[] = [
  departure({ truck_listing_id: id(201) }),
  departure({
    truck_listing_id: id(202),
    direction: 'retur',
    from_city: LONG_FROM,
    from_county: 'BN',
    to_city: LONG_TO,
    to_country: 'RO',
    to_county: 'BZ',
    is_domestic: true,
    waypoints: [
      { city: 'Târgu Lăpuș', country: 'RO' },
      { city: 'Săcălășeni-Coruia-Culcea', country: 'RO' },
      { city: 'Baia Sprie' },
      { city: 'Sighetu Marmației' },
      { city: 'Vișeu de Sus-Borșa-Moisei' },
      { city: 'Câmpulung Moldovenesc' },
      { city: 'Gura Humorului' },
      { city: 'Piatra-Neamț' },
      { city: 'Onești-Târgu Ocna-Slănic-Moldova' },
    ],
    service_types: ['pe_sens', 'expres', 'tractare'],
    accepted_vehicle_types: ['autoturism', 'autoutilitara', 'motocicleta', 'rulota', 'istoric', 'atv_quad', 'cvadriciclu'],
    price_indicative: 1_250_000,
    currency: 'RON',
    platform_slots_total: 10,
    slots_taken: 1,
    slots_free: 9,
    published_at: hoursAgo(0.5),
  }),
  departure({
    truck_listing_id: id(203),
    from_city: 'Timișoara',
    from_county: 'TM',
    to_city: 'Vila Nova de Gaia',
    to_country: 'PT',
    platform_slots_total: 8,
    slots_taken: 8,
    slots_free: 0,
    price_indicative: null,
    published_at: hoursAgo(24 * 4),
  }),
  departure({
    truck_listing_id: id(204),
    direction: 'retur',
    from_city: 'Garmisch-Partenkirchen',
    from_country: 'DE',
    from_county: null,
    to_city: 'Drobeta-Turnu Severin',
    to_county: 'MH',
    platform_slots_total: null,
    slots_taken: 0,
    slots_free: 0,
    accepted_vehicle_types: [],
    price_indicative: 38_500,
    currency: 'EUR',
    published_at: null,
  }),
];

// ---------------------------------------------------------------------
// firme
// ---------------------------------------------------------------------

function publicCompany(overrides: Partial<PublicCompany> & Pick<PublicCompany, 'slug' | 'name'>): PublicCompany {
  return {
    legalName: overrides.name,
    cui: 'RO40218867',
    city: 'Bistrița',
    county: 'Bistrița-Năsăud',
    companyType: 'transport',
    logoPath: null,
    description: null,
    verifiedSince: hoursAgo(24 * 200),
    ratingAvg: 4.7,
    ratingCount: 38,
    compliantVehicles: 6,
    servesNational: true,
    servesInternational: true,
    lastCheckedAt: hoursAgo(30),
    coverageScope: 'international',
    coverageCounties: [],
    coverageCountries: ['DE', 'IT', 'FR', 'ES', 'NL', 'AT', 'HU', 'BE'],
    vehicleTypesAccepted: ['autoturism', 'autoutilitara', 'motocicleta', 'rulota', 'istoric', 'atv_quad'],
    equipment: ['troliu', 'rampe'],
    services: ['transport_platforma', 'tractare'],
    indicativeRate: 4.8,
    indicativeRateNote: 'La peste 500 km prețul pe kilometru scade.',
    website: null,
    vehiclesTotal: 7,
    ratingPunctuality: 4.8,
    ratingCommunication: 4.6,
    ratingVehicleCare: 4.9,
    ratingInfoAccuracy: 4.5,
    ratingHandover: 4.7,
    completedAsCarrier: 142,
    completedAsClient: 3,
    punctualityPct: 94,
    punctualitySample: 118,
    responsePct: 88,
    responseSample: 160,
    disputesOpened12m: 1,
    disputesResolved12m: 1,
    reputationComputedAt: hoursAgo(10),
    ...overrides,
  };
}

const PROFILE_COMPANY = publicCompany({
  slug: 'eurotransautologisticcarpatica',
  name: LONG_COMPANY,
  city: LONG_FROM,
  county: 'Bistrița-Năsăud',
  description:
    'Transport de autoturisme, autoutilitare și autorulote pe platforme de opt și zece locuri, din ' +
    'Germania, Italia și Țările de Jos spre Ardeal, cu retur prin Ungaria. Ridicăm și mașini care nu ' +
    'pornesc, cu troliu, și facem fișa de stare la fiecare încărcare.',
  website: LONG_URL,
});

export const DIRECTORY: PublicCompany[] = [
  publicCompany({ slug: 'autotrans-somes', name: 'Autotrans Someș', ratingCount: 2 }),
  PROFILE_COMPANY,
  publicCompany({
    slug: 'transporturi-internationale-autovehicule',
    name: HYPHEN_COMPANY,
    city: 'Ștefan cel Mare',
    county: 'Buzău',
    coverageScope: 'national',
    coverageCountries: [],
    compliantVehicles: 0,
    ratingAvg: null,
    ratingCount: 0,
  }),
  publicCompany({
    slug: 'garmischer-fahrzeuglogistik',
    name: 'Garmischer Fahrzeuglogistik und Überführungsdienste GmbH Niederlassung Rumänien',
    city: 'Drobeta-Turnu Severin',
    county: 'Mehedinți',
    coverageScope: 'judetean',
    coverageCounties: ['MH', 'DJ', 'GJ', 'CS', 'OT', 'VL', 'TM', 'HD'],
    coverageCountries: [],
  }),
];

export const COMPANY_PROFILE: CompanyProfile = {
  company: PROFILE_COMPANY,
  documents: [
    { kind: 'licenta_comunitara', label: 'Licență comunitară pentru transport rutier internațional de mărfuri', state: 'valid', validMonth: '2029-03-01' },
    { kind: 'asigurare_raspundere_expeditor', label: 'Asigurare de răspundere civilă a expeditorului pentru mărfuri transportate', state: 'expiring_soon', validMonth: '2026-10-01' },
    { kind: 'asigurare_cmr', label: 'Asigurare CMR', state: 'expired', validMonth: '2026-08-01' },
  ],
  routes: [
    {
      truckListingId: id(202),
      fromCountry: 'RO',
      fromCity: LONG_FROM,
      toCountry: 'RO',
      toCity: LONG_TO,
      availableFrom: day(1),
      availableTo: day(3),
      slotsFree: 9,
      isDomestic: true,
    },
    {
      truckListingId: id(203),
      fromCountry: 'RO',
      fromCity: 'Timișoara',
      toCountry: 'PT',
      toCity: 'Vila Nova de Gaia',
      availableFrom: day(4),
      availableTo: null,
      slotsFree: 0,
      isDomestic: false,
    },
  ],
  equipment: [
    { code: 'troliu', label: 'Troliu electric pentru vehicule care nu pornesc' },
    { code: 'rampe', label: 'Rampe de încărcare din aluminiu' },
    { code: 'remorca_inchisa', label: 'Remorcă închisă pentru vehicule de colecție' },
  ],
  services: [
    { code: 'transport_platforma', label: 'Transport pe platformă' },
    { code: 'transport_nefunctional', label: 'Transport vehicule nefuncționale' },
    { code: 'ridicare_domiciliu', label: 'Ridicare de la domiciliu' },
  ],
};

// ---------------------------------------------------------------------
// evaluari
// ---------------------------------------------------------------------

export const RATINGS: PublicRating[] = [
  {
    id: id(301),
    created_at: hoursAgo(24 * 3),
    score: 4,
    punctuality: 3,
    communication: 5,
    vehicle_care: 5,
    info_accuracy: 4,
    handover_availability: 4,
    comment: LONG_REVIEW,
    after_dispute: false,
    edited: true,
    rater_name: LONG_PERSON,
    reply_body: LONG_REPLY,
    reply_at: hoursAgo(24 * 2),
    total_count: 3,
  },
  {
    id: id(302),
    created_at: hoursAgo(24 * 20),
    score: 2,
    punctuality: 1,
    communication: 2,
    vehicle_care: null,
    info_accuracy: null,
    handover_availability: null,
    comment: `Referința din CMR nu corespundea cu cea din comandă: ${UNBROKEN_TOKEN}`,
    after_dispute: true,
    edited: false,
    rater_name: HYPHEN_COMPANY,
    reply_body: null,
    reply_at: null,
    total_count: 3,
  },
  {
    id: id(303),
    created_at: hoursAgo(24 * 41),
    score: 5,
    punctuality: null,
    communication: null,
    vehicle_care: null,
    info_accuracy: null,
    handover_availability: null,
    comment: null,
    after_dispute: false,
    edited: false,
    rater_name: null,
    reply_body: null,
    reply_at: null,
    total_count: 3,
  },
];

// ---------------------------------------------------------------------
// oferte
// ---------------------------------------------------------------------

function offer(overrides: Partial<OfferForRequest> & Pick<OfferForRequest, 'id'>): OfferForRequest {
  return {
    created_at: hoursAgo(6),
    status: 'pending',
    price_amount: 2150,
    currency: 'RON',
    estimated_pickup_date: day(3),
    estimated_delivery_date: day(4),
    conditions: null,
    payment_term_days: null,
    message: null,
    valid_until: hoursAhead(40),
    company_id: id(1),
    company_name: 'Autotrans Someș',
    company_slug: 'autotrans-somes',
    company_verified: true,
    company_verified_at: '2026-03-02T12:00:00.000Z',
    vehicle_type: 'platforma_auto',
    vehicle_plate: 'BN 07 SMC',
    conversation_id: null,
    unread_messages: 0,
    company_rating_avg: 4.7,
    company_rating_count: 38,
    company_completed: 142,
    company_punctuality: 94,
    ...overrides,
  };
}

export const OFFERS_LISTING_ID = id(111);

export const OFFERS: OfferForRequest[] = [
  offer({
    id: id(401),
    company_name: LONG_COMPANY,
    company_slug: 'eurotransautologisticcarpatica',
    price_amount: 1_250_000,
    conditions: PRICE_INCLUDES,
    payment_term_days: 30,
    message: OFFER_MESSAGE,
    valid_until: hoursAhead(2),
    vehicle_type: 'platforma_auto_inchisa',
    unread_messages: 2,
  }),
  offer({
    id: id(402),
    company_name: HYPHEN_COMPANY,
    company_slug: null,
    company_verified: false,
    company_verified_at: null,
    price_amount: 18_750,
    currency: 'EUR',
    estimated_pickup_date: null,
    estimated_delivery_date: null,
    conditions: `Plata în avans, cu referința ${UNBROKEN_TOKEN}.`,
    vehicle_type: null,
    company_rating_avg: null,
    company_rating_count: 0,
    company_completed: 0,
    company_punctuality: null,
  }),
  offer({ id: id(403) }),
  offer({
    id: id(404),
    status: 'withdrawn',
    company_name: 'Garmischer Fahrzeuglogistik und Überführungsdienste GmbH Niederlassung Rumänien',
    company_slug: 'garmischer-fahrzeuglogistik',
    price_amount: 987_654,
  }),
];

export const OFFER_THREADS: Record<string, ThreadMessage[]> = {
  [id(401)]: [
    {
      id: id(411),
      created_at: hoursAgo(5),
      sender_user_id: id(10),
      sender_name: 'Tu',
      body: 'Puteți încărca și sâmbătă dimineață? În timpul săptămânii nu este nimeni acasă.',
      was_masked: false,
      is_hidden: false,
      is_mine: true,
    },
    {
      id: id(412),
      created_at: hoursAgo(4),
      sender_user_id: id(11),
      sender_name: LONG_PERSON,
      body: `Da, sâmbătă între opt și unsprezece. Fotografiile de la ultima platformă încărcată sunt aici: ${LONG_URL}`,
      was_masked: false,
      is_hidden: false,
      is_mine: false,
    },
    {
      id: id(413),
      created_at: hoursAgo(3),
      sender_user_id: id(10),
      sender_name: 'Tu',
      body: 'Perfect. Vă las numărul meu: [contact ascuns până la confirmarea comenzii]',
      was_masked: true,
      is_hidden: false,
      is_mine: true,
    },
  ],
};

// ---------------------------------------------------------------------
// mesaje
// ---------------------------------------------------------------------

export const CONVERSATION_ID = id(501);
export const COUNTERPARTY_NAME = LONG_COMPANY;

function message(overrides: Partial<Message> & Pick<Message, 'id' | 'created_at'>): Message {
  return {
    sender_name: LONG_PERSON,
    mine: false,
    body: null,
    was_masked: false,
    hidden_at: null,
    attachments: [],
    ...overrides,
  };
}

/** Eight messages over two days: long, unbroken, masked, hidden, with photographs. */
export const MESSAGES: Message[] = [
  message({ id: id(511), created_at: hoursAgo(30), body: 'Bună ziua, mai este valabilă cererea pentru Passat?' }),
  message({ id: id(512), created_at: hoursAgo(29.5), mine: true, sender_name: null, body: 'Da, este. Când ați putea încărca?' }),
  message({ id: id(513), created_at: hoursAgo(29), body: LONG_MESSAGE }),
  message({
    id: id(514),
    created_at: hoursAgo(28),
    mine: true,
    sender_name: null,
    body: `Codul de pe CMR este ${UNBROKEN_TOKEN}, îl scrieți pe factură?`,
  }),
  message({
    id: id(515),
    created_at: hoursAgo(27),
    body: 'Sunați-mă direct: [contact ascuns până la confirmarea comenzii]',
    was_masked: true,
  }),
  message({ id: id(516), created_at: hoursAgo(26), hidden_at: hoursAgo(20), body: 'Mesaj ascuns de echipa platformei.' }),
  message({
    id: id(517),
    created_at: hoursAgo(3),
    body: 'Am făcut fotografiile de la încărcare.',
    attachments: ['proba/mesaj/foto-1.jpg', 'proba/mesaj/foto-2.jpg', 'proba/mesaj/foto-3.jpg'],
  }),
  message({ id: id(518), created_at: hoursAgo(2), mine: true, sender_name: null, body: LONG_URL }),
];

export const MESSAGE_URLS: Record<string, string> = {
  'proba/mesaj/foto-1.jpg': SAMPLE_PHOTO,
  'proba/mesaj/foto-2.jpg': SAMPLE_PHOTO,
  'proba/mesaj/foto-3.jpg': SAMPLE_PHOTO,
};

// ---------------------------------------------------------------------
// acte
// ---------------------------------------------------------------------

export const DOCUMENT_VEHICLES: ScreenVehicle[] = [
  { id: id(601), plate: 'B 999 XXX' },
  { id: id(602), plate: 'BN 07 SMC' },
];

const requirement = (overrides: Partial<ScreenRequirement> & Pick<ScreenRequirement, 'kind' | 'label'>): ScreenRequirement => ({
  scope: 'company',
  reason: 'Fără ea nu putem arăta clienților că ai dreptul să transporți vehiculele lor.',
  isBlocking: true,
  state: 'ok',
  vehicleId: null,
  latest: null,
  ...overrides,
});

export const DOCUMENT_REQUIREMENTS: ScreenRequirement[] = [
  requirement({
    kind: 'certificat_inregistrare_onrc',
    label: 'Certificat de înregistrare la Oficiul Național al Registrului Comerțului',
    reason: 'Confirmă că firma există și că CUI-ul este al ei.',
  }),
  requirement({
    kind: 'asigurare_raspundere_expeditor',
    label: 'Asigurare de răspundere civilă a expeditorului pentru mărfuri transportate',
    state: 'rejected',
    latest: {
      id: id(611),
      status: 'rejected',
      validUntil: '2027-01-31',
      declared: null,
      rejectionReason: REJECTION_REASON,
      extractionError: null,
    },
  }),
  requirement({
    kind: 'licenta_comunitara',
    label: 'Licență comunitară pentru transport rutier internațional de mărfuri în cont propriu și pentru terți',
    state: 'in_review',
    latest: {
      id: id(612),
      status: 'pending',
      validUntil: '2029-03-14',
      declared: null,
      rejectionReason: null,
      extractionError: null,
    },
  }),
  requirement({ kind: 'asigurare_cmr', label: 'Asigurare CMR', state: 'missing', isBlocking: false }),
  requirement({
    scope: 'vehicle',
    kind: 'copie_conforma',
    label: 'Copie conformă a licenței de transport pentru vehiculul înmatriculat',
    vehicleId: id(601),
    state: 'expired',
  }),
  requirement({ scope: 'vehicle', kind: 'itp', label: 'Inspecție tehnică periodică (ITP)', vehicleId: id(601), state: 'missing' }),
  requirement({
    scope: 'vehicle',
    kind: 'rca',
    label: 'Asigurare obligatorie de răspundere civilă auto (RCA)',
    vehicleId: id(602),
    state: 'ok',
  }),
  requirement({
    scope: 'vehicle',
    kind: 'itp',
    label: 'Inspecție tehnică periodică (ITP)',
    vehicleId: id(602),
    state: 'rejected',
    latest: {
      id: id(613),
      status: 'rejected',
      validUntil: null,
      declared: null,
      rejectionReason: REJECTION_REASON,
      extractionError: null,
    },
  }),
];

export const DOCUMENT_KINDS = DOCUMENT_REQUIREMENTS.map((row) => ({
  kind: row.kind,
  label: row.label,
  scope: row.scope,
}));

export const DOCUMENT_HISTORY: HistoryRow[] = [
  {
    id: id(621),
    kind: 'asigurare_raspundere_expeditor',
    status: 'rejected',
    valid_until: '2027-01-31',
    rejection_reason: REJECTION_REASON,
    created_at: hoursAgo(26),
  },
  {
    id: id(622),
    kind: 'licenta_comunitara',
    status: 'pending',
    valid_until: '2029-03-14',
    rejection_reason: null,
    created_at: hoursAgo(20),
  },
  {
    id: id(623),
    kind: 'certificat_inregistrare_onrc',
    status: 'approved',
    valid_until: null,
    rejection_reason: null,
    created_at: hoursAgo(24 * 90),
  },
  {
    id: id(624),
    kind: 'asigurare_raspundere_expeditor',
    status: 'replaced',
    valid_until: '2026-01-31',
    rejection_reason: null,
    created_at: hoursAgo(24 * 400),
  },
];

export const DOCUMENT_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_REQUIREMENTS.map((row) => [row.kind, row.label]),
);

// ---------------------------------------------------------------------
// comanda
// ---------------------------------------------------------------------

export const ORDER_STATUS = 'in_transit';
export const ORDER_TITLE = `${LONG_FROM} → ${LONG_TO}`;

export const ORDER_EVENTS: TimelineEvent[] = [
  { id: id(701), created_at: hoursAgo(50), from_status: 'agreed', to_status: 'order_confirmed', actor_side: 'client', actor_name: LONG_PERSON, note: null },
  {
    id: id(702),
    created_at: hoursAgo(40),
    from_status: 'order_confirmed',
    to_status: 'pickup_scheduled',
    actor_side: 'carrier',
    actor_name: LONG_COMPANY,
    note: `Ridicare sâmbătă între 8 și 11, pe poarta din spate. Referința de pe CMR: ${UNBROKEN_TOKEN}`,
  },
  { id: id(703), created_at: hoursAgo(26), from_status: 'pickup_scheduled', to_status: 'vehicle_picked_up', actor_side: 'driver', actor_name: 'Ionuț-Valentin Popescu-Mărgineanu', note: null },
  {
    id: id(704),
    created_at: hoursAgo(20),
    from_status: 'vehicle_picked_up',
    to_status: 'vehicle_picked_up',
    actor_side: 'driver',
    actor_name: 'Ionuț-Valentin Popescu-Mărgineanu',
    note: LONG_MESSAGE,
  },
  { id: id(705), created_at: hoursAgo(18), from_status: 'vehicle_picked_up', to_status: 'in_transit', actor_side: 'carrier', actor_name: null, note: null },
];

function evidence(overrides: Partial<EvidenceRow> & Pick<EvidenceRow, 'id' | 'kind'>): EvidenceRow {
  return {
    file_path: null,
    note: null,
    payload: {},
    captured_at: hoursAgo(26),
    author_name: 'Ionuț-Valentin Popescu-Mărgineanu',
    lat: 47.03,
    lng: 24.4,
    is_hidden: false,
    ...overrides,
  };
}

export const EVIDENCE: EvidenceRow[] = [
  ...[1, 2, 3, 4, 5].map((n) =>
    evidence({ id: id(710 + n), kind: 'pickup_photo', file_path: `proba/comanda/ridicare-${n}.jpg` }),
  ),
  evidence({ id: id(716), kind: 'pickup_photo', file_path: 'proba/comanda/ridicare-6.jpg', is_hidden: true, author_name: LONG_PERSON }),
  evidence({
    id: id(717),
    kind: 'condition_report',
    payload: {
      zgarieturi: 'ușoare',
      lovituri: 'fără',
      geamuri: 'fără',
      jante: 'vizibile',
      interior: 'fără',
      kilometraj: '1.248.730',
      combustibil: '3',
      chei: 'da',
      acte: 'nu',
    },
    note: `Zgârietură de circa 12 cm pe bara din spate, partea stângă, și jantă față dreapta atinsă de bordură. ${UNBROKEN_TOKEN}`,
  }),
  evidence({ id: id(718), kind: 'incident_note', note: LONG_MESSAGE, author_name: LONG_COMPANY, lat: null, lng: null }),
  evidence({ id: id(719), kind: 'transport_document', file_path: 'proba/comanda/cmr.jpg', note: 'CMR semnat la încărcare' }),
];

export const EVIDENCE_URLS: ReadonlyMap<string, string> = new Map(
  EVIDENCE.flatMap((row) => (row.file_path === null ? [] : [[row.file_path, SAMPLE_PHOTO] as const])),
);

/** The client's own photographs, from when the request was published. */
export const REQUEST_PHOTOS = ['proba/cerere/1.jpg', 'proba/cerere/2.jpg', 'proba/cerere/3.jpg'];
export const REQUEST_PHOTO_URLS: ReadonlyMap<string, string> = new Map(REQUEST_PHOTOS.map((path) => [path, SAMPLE_PHOTO]));

// ---------------------------------------------------------------------
// admin-acte
// ---------------------------------------------------------------------

const ADMIN_COMPANY_80 = 'SOCIETATEA COOPERATIVĂ DE TRANSPORT AUTO ȘI SERVICII LOGISTICE MARAMUREȘ NORD SRL';

export const PENDING_DOCUMENTS: PendingDocument[] = [
  {
    id: id(801),
    kind: 'asigurare_raspundere_expeditor',
    scope: 'company',
    valid_until: '2027-01-31',
    declared: '2027-03-31',
    fileUrl: SAMPLE_PHOTO,
    created_at: hoursAgo(5),
    companyName: ADMIN_COMPANY_80,
    plate: null,
    label: 'Asigurare de răspundere civilă a expeditorului pentru mărfuri transportate',
    hasExpiry: true,
  },
  {
    id: id(802),
    kind: 'copie_conforma',
    scope: 'vehicle',
    valid_until: null,
    declared: '2028-06-30',
    fileUrl: SAMPLE_PHOTO,
    created_at: hoursAgo(9),
    companyName: LONG_COMPANY,
    plate: 'B 999 XXX',
    label: 'Copie conformă a licenței de transport pentru vehiculul înmatriculat',
    hasExpiry: true,
  },
  {
    id: id(803),
    kind: 'certificat_inregistrare_onrc',
    scope: 'company',
    valid_until: null,
    declared: null,
    fileUrl: null,
    created_at: hoursAgo(30),
    companyName: HYPHEN_COMPANY,
    plate: null,
    label: 'Certificat de înregistrare la Oficiul Național al Registrului Comerțului',
    hasExpiry: false,
  },
];

export const PENDING_COMPANIES: PendingCompany[] = [
  {
    id: id(811),
    legal_name: ADMIN_COMPANY_80,
    cui: 'RO40218867',
    company_type: 'transport',
    submitted_at: hoursAgo(5),
    documentsTotal: 12,
    documentsIn: 11,
    vehicles: 14,
    ready: false,
  },
  {
    id: id(812),
    legal_name: LONG_COMPANY,
    cui: 'RO41137720',
    company_type: 'both',
    submitted_at: hoursAgo(40),
    documentsTotal: 6,
    documentsIn: 6,
    vehicles: 0,
    ready: true,
  },
];

// ---------------------------------------------------------------------
// abonamente
// ---------------------------------------------------------------------

const FEATURE_BOARD = { key: 'board', label: 'Acces la cereri și trasee' } as const;
const FEATURE_DOCS = { key: 'docs', label: 'Evidența documentelor firmei și ale vehiculelor' } as const;
const FEATURE_EXPIRY = { key: 'expiry', label: 'Notificare înainte să expire un document' } as const;
const FEATURE_CONTACTS = { key: 'contacts', label: 'Contacte nelimitate' } as const;
const FEATURE_ROUTES = { key: 'routes', label: 'Publicare nelimitată pe tur și pe retur' } as const;
const FEATURE_ALERTS = {
  key: 'alerts',
  label: 'Alerte pe e-mail pentru cereri de pe traseele tale, cu ocolul pe care îl accepți',
} as const;
const FEATURE_DIRECTORY = { key: 'directory', label: 'Profil în lista publică de firme' } as const;
const FEATURE_SEATS = { key: 'seats', label: 'Dispeceri nelimitați în contul firmei' } as const;
const FEATURE_PROMOTED = { key: 'promoted', label: 'Anunțuri promovate' } as const;
const FEATURE_SUPPORT = { key: 'support', label: 'Suport prioritar' } as const;

export const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'Gratuit',
    description: 'Pentru firmele care încep și vor să vadă cum arată cererile.',
    audience: 'carrier',
    monthlyPrice: 0,
    highlight: false,
    features: [
      { ...FEATURE_BOARD, status: 'included' },
      { ...FEATURE_DOCS, status: 'included' },
      { ...FEATURE_EXPIRY, status: 'included' },
      { ...FEATURE_CONTACTS, status: 'not_included' },
      { ...FEATURE_ROUTES, status: 'not_included' },
      { ...FEATURE_ALERTS, status: 'not_included' },
      { ...FEATURE_DIRECTORY, status: 'not_included' },
      { ...FEATURE_PROMOTED, status: 'coming_soon' },
    ],
    periods: [
      { months: 1, total: 0 },
      { months: 6, total: 0 },
      { months: 12, total: 0 },
    ],
    limits: { contactsPerMonth: 3, activeTruckListings: 3, activeCargoListings: 3, savedSearches: 1 },
  },
  {
    code: 'carrier',
    name: 'Transportator',
    description: 'Pentru firmele de transport care lucrează pe tur și pe retur.',
    audience: 'carrier',
    monthlyPrice: 149,
    highlight: true,
    features: [
      { ...FEATURE_BOARD, status: 'included' },
      { ...FEATURE_DOCS, status: 'included' },
      { ...FEATURE_EXPIRY, status: 'included' },
      { ...FEATURE_CONTACTS, status: 'included' },
      { ...FEATURE_ROUTES, status: 'included' },
      { ...FEATURE_ALERTS, status: 'included' },
      { ...FEATURE_DIRECTORY, status: 'included' },
      { ...FEATURE_SEATS, status: 'not_included' },
      { ...FEATURE_PROMOTED, status: 'coming_soon' },
    ],
    periods: [
      { months: 1, total: 149 },
      { months: 6, total: 804 },
      { months: 12, total: 1490 },
    ],
    limits: { contactsPerMonth: null, activeTruckListings: null, activeCargoListings: 10, savedSearches: 10 },
  },
  {
    code: 'business',
    name: 'Flotă și grupuri de firme cu mai mulți dispeceri',
    description: 'Pentru flote mari și grupuri de firme, cu mai mulți dispeceri.',
    audience: 'carrier',
    monthlyPrice: 449,
    highlight: false,
    features: [
      { ...FEATURE_BOARD, status: 'included' },
      { ...FEATURE_DOCS, status: 'included' },
      { ...FEATURE_EXPIRY, status: 'included' },
      { ...FEATURE_CONTACTS, status: 'included' },
      { ...FEATURE_ROUTES, status: 'included' },
      { ...FEATURE_ALERTS, status: 'included' },
      { ...FEATURE_DIRECTORY, status: 'included' },
      { ...FEATURE_SEATS, status: 'included' },
      { ...FEATURE_PROMOTED, status: 'coming_soon' },
      { ...FEATURE_SUPPORT, status: 'coming_soon' },
    ],
    periods: [
      { months: 1, total: 449 },
      { months: 6, total: 2424 },
      { months: 12, total: 4490 },
    ],
    limits: { contactsPerMonth: null, activeTruckListings: null, activeCargoListings: null, savedSearches: null },
  },
];

export const PRICING_SETTINGS: PricingSettings = {
  trialDays: 30,
  vatLabel: 'Prețurile nu includ TVA.',
  manualBilling: true,
  billingContactEmail: 'facturare@exemplu.ro',
};

// ---------------------------------------------------------------------
// dashboard
// ---------------------------------------------------------------------

export const CARRIER_DASHBOARD: CarrierDashboard = {
  documentsExpiring: 2,
  documentsRejected: 1,
  documentsMissing: 0,
  vehiclesActive: 7,
  vehiclesBlocked: 2,
  pendingBookings: [
    { id: id(901), truckListingId: id(202), slots: 2, expiresAt: hoursAhead(1.5), fromCity: LONG_FROM, toCity: LONG_TO },
    { id: id(902), truckListingId: id(201), slots: 1, expiresAt: hoursAhead(30), fromCity: 'Cluj-Napoca', toCity: 'München' },
    { id: id(903), truckListingId: id(203), slots: 1, expiresAt: hoursAgo(1), fromCity: 'Timișoara', toCity: 'Vila Nova de Gaia' },
  ],
  activeRoutes: 12,
  seatsTaken: 96,
  seatsTotal: 120,
  contactsThisMonth: 1_248,
  matches: BOARD_REQUESTS,
  matchReasons: {
    [id(101)]: ['ruta', 'categorie'],
    [id(102)]: ['judet', 'categorie', 'troliu', 'tractare'],
    [id(103)]: ['tara', 'categorie', 'tractare'],
  },
  detours: {
    [id(102)]: { detourKm: 148, toleranceKm: 150, within: true, fromCity: LONG_FROM, toCity: LONG_TO },
  },
  now: PROBA_NOW,
};

export const ELIGIBLE_VEHICLES: EligibleVehicle[] = [
  { id: id(601), plate_number: 'B999XXX', vehicle_type: 'platforma_auto', make: 'Iveco', model: 'Eurocargo 120E25 cu platformă Rolfo pentru opt autoturisme' },
  { id: id(602), plate_number: 'BN07SMC', vehicle_type: 'platforma_auto_inchisa', make: 'Mercedes-Benz', model: 'Actros' },
];

export const OFFER_SETTINGS: OfferSettings = DEFAULT_OFFER_SETTINGS;
export const OFFER_QUOTA: OfferQuota = { used: 8, allowed: 10, planName: 'Transportator' };

/** The second match already carries a live offer, so its card shows the note instead of the form. */
export const PENDING_OFFERS: Record<string, string> = { [id(102)]: id(401) };

export const ACTIVE_ORDERS: OrderRow[] = [
  {
    id: id(951),
    created_at: hoursAgo(50),
    status: 'pickup_scheduled',
    agreed_price: 12_500,
    currency: 'RON',
    from_city: LONG_FROM,
    to_city: LONG_TO,
    pickup_from: hoursAhead(20),
    delivery_from: hoursAhead(44),
    delivered_at: null,
    request_id: id(111),
    carrier_company_id: id(1),
    carrier_name: LONG_COMPANY,
    client_name: LONG_PERSON,
    driver_name: 'Ionuț-Valentin Popescu-Mărgineanu',
    plate_number: 'B 999 XXX',
    my_side: 'carrier',
    needs_me: true,
    vehicle_flagged: false,
    evidence_count: 0,
  },
  {
    id: id(952),
    created_at: hoursAgo(90),
    status: 'disputed',
    agreed_price: 2150,
    currency: 'RON',
    from_city: 'Garmisch-Partenkirchen',
    to_city: 'Drobeta-Turnu Severin',
    pickup_from: null,
    delivery_from: null,
    delivered_at: null,
    request_id: id(113),
    carrier_company_id: id(1),
    carrier_name: LONG_COMPANY,
    client_name: HYPHEN_COMPANY,
    driver_name: null,
    plate_number: null,
    my_side: 'carrier',
    needs_me: false,
    vehicle_flagged: true,
    evidence_count: 4,
  },
];

export const PENDING_RATINGS: PendingRating[] = [
  {
    order_id: id(953),
    rating_id: null,
    created_at: null,
    deadline: hoursAhead(24 * 5),
    score: null,
    comment: null,
    after_dispute: false,
    hidden: false,
    from_city: LONG_FROM,
    to_city: LONG_TO,
    counterparty_name: LONG_PERSON,
    counterparty_slug: null,
    rater_name: null,
    reply_body: null,
    can_reply: false,
    can_edit: true,
  },
];
