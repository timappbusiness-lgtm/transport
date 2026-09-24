import { CARGO_CATEGORY_LABELS } from '@/lib/departures';

/**
 * The company profile area, in Romanian.
 *
 * Rules this file keeps, and `tests/unit/firma-copy.test.ts` enforces:
 * calm sentences, correct diacritics, no exclamation marks, no
 * superlatives, and nothing promised that is not built. In particular
 * there is no mention of SMS or WhatsApp anywhere below: `saved_searches`
 * has columns for both and nothing sends them, so offering them would be
 * a promise the platform does not keep.
 *
 * What *is* promised is the e-mail, because migration 20260918090000
 * writes a row into `notification_outbox` for every matching request and
 * the `outbox-dispatcher` edge function delivers it.
 */

export const firmaCopy = {
  title: 'Profilul firmei',
  lede:
    'Ce transporți, unde și cu ce. Transportatorii cu profilul completat apar la mai multe cereri potrivite.',
  save: 'Salvează',
  saved: 'Modificările au fost salvate.',
  saving: 'Se salvează…',

  /** „Pasul 2 din 4" — how much of the file is left, in words. */
  stepOf: (current: number, total: number) => `Pasul ${current} din ${total}`,

  tabs: {
    identitate: 'Date firmă',
    acoperire: 'Acoperire',
    dotari: 'Servicii și dotări',
    alerte: 'Alerte',
    public: 'Profil public',
  },

  identity: {
    title: 'Date firmă',
    lede: 'Datele de identificare vin de la ANAF. Datele de contact rămân ale tale.',
    contactPhone: 'Telefon de contact',
    contactPhoneHint: 'În forma +40722000111. Nu apare public.',
    contactEmail: 'E-mail de contact',
    contactEmailHint: 'Nu apare public.',
    website: 'Site',
    websiteHint:
      'Apare pe profilul public. Salvăm adresa curată, fără parametrii de campanie din link.',
    address: 'Adresă',
    addressHint: 'Nu apare niciodată public. O folosim doar pentru documente și facturare.',
    legalRepresentative: 'Reprezentant legal',
    legalRepresentativeHint:
      'Numele și funcția, cum apar pe contractele de transport: „Ion Popescu, administrator". Nu apare public.',
    legalRepresentativeInvalid: 'Scrie între 3 și 120 de caractere.',
    county: 'Județ',
    city: 'Localitate',
    hideAddress: 'Nu afișa localitatea pe profilul public',
    hideAddressHint:
      'Pentru firmele care lucrează de la o adresă personală. Pe profil rămâne doar județul.',
  },

  coverage: {
    title: 'Acoperire',
    lede: 'Unde transporți. De aici pornesc cererile care ajung la tine.',
    scope: 'Zona în care transporți',
    scopes: {
      judetean: 'Câteva județe',
      national: 'Toată România',
      international: 'România și alte țări',
    } as Record<string, string>,
    scopeHints: {
      judetean: 'Primești cererile care încep și se termină în județele alese.',
      national: 'Primești cererile din toată țara. Nu e nevoie să alegi județe.',
      international: 'Pe lângă România, alege țările în care mergi.',
    } as Record<string, string>,
    counties: 'Județe',
    countiesHint: 'Alege județele în care încarci și descarci.',
    countries: 'Țări',
    countriesHint: 'România este inclusă întotdeauna, nu trebuie aleasă.',
    selectAll: 'Alege toate',
    clear: 'Golește',
    chosen: (count: number) =>
      count === 1 ? 'Un județ ales' : `${count} județe alese`,
  },

  capabilities: {
    title: 'Servicii și dotări',
    lede: 'Ce iei la transport și cu ce lucrezi. Cererile ajung doar la firmele care le pot face.',
    vehicleTypes: 'Ce vehicule transporți',
    vehicleTypesHint:
      'Dacă nu alegi nimic, primești cereri pentru toate categoriile.',
    services: 'Servicii',
    servicesHint: 'Ce fel de transporturi accepți.',
    equipment: 'Dotări',
    equipmentHint:
      'Ce ai pe platformă. Un vehicul care nu se deplasează ajunge doar la firmele cu troliu.',
    rate: 'Tarif orientativ',
    rateUnit: 'lei / km',
    rateHint:
      'Orientativ, afișat ca atare pe profil. Prețul unei curse rămâne cel din ofertă.',
    rateNote: 'Observație la tarif',
    rateNoteHint: 'Maximum 200 de caractere. De exemplu, de la ce distanță se schimbă.',
    fleet: 'Vehicule în flotă',
    fleetHint: 'Numărat din flota înregistrată. Adaugă vehicule din pagina Flotă.',
    fleetEmpty: 'Niciun vehicul înregistrat încă.',
  },

  alerts: {
    title: 'Alerte',
    lede:
      'Îți trimitem un e-mail când apare o cerere care se potrivește cu acoperirea și cu dotările firmei.',
    enable: 'Primesc alerte pe e-mail pentru cererile potrivite',
    enableHint:
      'Un e-mail pentru fiecare cerere nouă care se potrivește. O cerere republicată nu se trimite a doua oară.',
    email: 'Adresa pentru alerte',
    emailHint: 'Lasă gol ca să folosim e-mailul de contact al firmei.',
    unverified:
      'Alertele pornesc după ce firma este verificată.',
    whatMatches: 'Ce se potrivește',
    rules: [
      'Cererile din zona pe care ai ales-o la Acoperire.',
      'Categoriile de vehicule pe care le transporți.',
      'Vehiculele care nu se deplasează, doar dacă ai troliu.',
      'Tractările, doar dacă ai trecut tractarea între servicii.',
      'Cererile la care ocolul față de un traseu publicat de tine rămâne în toleranța pe care ai setat-o.',
    ],
    savedTitle: 'Alerte pe o căutare anume',
    savedLede:
      'Alerta de mai sus urmărește tot ce acoperă firma. Dacă vrei o alertă doar pe un anumit coridor sau tip de vehicul, salvează-ți căutarea de pe panoul de cereri.',
    savedAction: 'Vezi alertele mele',
  },

  publicProfile: {
    title: 'Profil public',
    lede: 'Ce văd clienții despre firmă în lista publică.',
    preview: 'Vezi profilul public',
    notLive: 'Profilul nu este încă în lista publică.',
  },

  completeness: {
    title: 'Cât este completat',
    /** Takes "7 din 11". */
    progress: (done: string) => `${done} completate`,
    lede:
      'Profilul completat te face mai ușor de găsit. Nimic nu este blocat dacă îl lași așa.',
    missing: 'Ce mai poți completa',
    done: 'Profilul este completat.',
  },

  admin: {
    title: 'Dotări și servicii',
    lede:
      'Lista din care aleg firmele. Codul unei opțiuni rămâne același după salvare, pentru că el este stocat la fiecare firmă.',
    equipment: 'Dotări',
    services: 'Servicii',
    code: 'Cod',
    codeHint: 'Litere mici, cifre și liniuță de subliniere. Nu se mai poate schimba.',
    label: 'Denumire',
    description: 'Explicație',
    order: 'Ordine',
    active: 'Activă',
    inactiveHint:
      'O opțiune dezactivată nu mai este oferită firmelor noi. Firmele care o au deja o păstrează.',
    add: 'Adaugă',
    addEquipment: 'Adaugă o dotare',
    addService: 'Adaugă un serviciu',
    saved: 'Lista a fost actualizată.',
  },
};

/** The thirteen cargo categories, for the checkbox grid. */
export const VEHICLE_TYPE_LABELS = CARGO_CATEGORY_LABELS;

/**
 * The countries this marketplace actually runs to, as the checkbox list.
 *
 * Not every country in the world: a list of two hundred is a list nobody
 * reads. These are where Romanians bring cars home from, plus the
 * neighbours. A firm that goes somewhere else says so in its description
 * until the list grows.
 */
export const COVERAGE_COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'DE', name: 'Germania' },
  { code: 'IT', name: 'Italia' },
  { code: 'FR', name: 'Franța' },
  { code: 'ES', name: 'Spania' },
  { code: 'NL', name: 'Țările de Jos' },
  { code: 'BE', name: 'Belgia' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Elveția' },
  { code: 'GB', name: 'Marea Britanie' },
  { code: 'IE', name: 'Irlanda' },
  { code: 'PT', name: 'Portugalia' },
  { code: 'DK', name: 'Danemarca' },
  { code: 'SE', name: 'Suedia' },
  { code: 'NO', name: 'Norvegia' },
  { code: 'PL', name: 'Polonia' },
  { code: 'CZ', name: 'Cehia' },
  { code: 'SK', name: 'Slovacia' },
  { code: 'HU', name: 'Ungaria' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'GR', name: 'Grecia' },
  { code: 'HR', name: 'Croația' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'RS', name: 'Serbia' },
  { code: 'MD', name: 'Republica Moldova' },
  { code: 'UA', name: 'Ucraina' },
];

const COUNTRY_BY_CODE = new Map(COVERAGE_COUNTRIES.map((c) => [c.code, c.name]));

export function countryName(code: string): string {
  return COUNTRY_BY_CODE.get(code.trim().toUpperCase()) ?? code.toUpperCase();
}
