/**
 * Romanian copy for the company directory and the sections that lead to it.
 *
 * Rules that hold throughout: every number comes from the database and is
 * rendered by the component, never written here; no superlatives, no
 * "garantăm", no count with a "+" after it, no decorative stars. A sentence
 * that would state a figure takes it as an argument, so this file cannot
 * hold a figure that nobody can check.
 */

import { BRAND_NAME } from '@/config/brand';

export const directoryCopy = {
  signup: {
    eyebrow: 'Pentru transportatori',
    strong: 'Înscrie firma',
    soft: 'și primești cereri pe traseele tale.',
    lede:
      'Publici traseele de tur și de retur, vezi cererile de pe ruta ta și completezi locurile libere înainte să pleci.',
    planLabel: 'Plan transportator',
    period: 'pe lună',
    currency: 'lei',
    /** Takes the trial as "30 de zile", so the number stays in the database. */
    trial: (days: string) =>
      `Perioada gratuită de ${days} începe când firma este aprobată. Nu îți cerem card la înscriere.`,
    noTrial: 'Nu îți cerem card la înscriere.',
    cta: 'Înscrie firma',
    secondary: 'Sunt casă de expediții',
    allPlans: 'Vezi toate planurile',
    /** Takes "24 de firme". */
    verifiedLine: (companies: string) => `${companies} cu documente verificate și în termen.`,
    gridNote: 'Firmele care au ales să apară în lista publică.',
    seeAll: 'Vezi toate firmele',
    domestic: 'Transport intern',
    international: 'Transport internațional',
  },

  card: {
    verified: 'Verificată',
    /** Takes "4 platforme". */
    vehicles: (count: string) => `${count} cu acte în termen`,
    noLogo: 'Inițialele firmei',
  },

  stats: {
    companies: 'firme verificate',
    vehicles: 'platforme cu acte în termen',
    requests: 'cereri de transport publicate',
    note: 'Date actualizate zilnic din platformă.',
  },

  page: {
    /** Literal: what the page is, in three words. */
    heading: 'Firme de transport',
    note: 'Numai firme cu documentele aprobate și în termen, care au ales să apară aici.',
    meta: {
      title: 'Firme de transport verificate',
      description:
        'Lista firmelor de transport auto care au documentele aprobate și în termen și au ales să apară public.',
    },
    filters: {
      legend: 'Filtrează lista',
      county: 'Județ',
      anyCounty: 'Toate județele',
      type: 'Tip firmă',
      anyType: 'Toate tipurile',
      transport: 'Transportator',
      forwarder: 'Casă de expediții',
      scope: 'Acoperire',
      anyScope: 'Oriunde',
      domestic: 'Intern',
      international: 'Internațional',
      search: 'Caută după nume sau CUI',
      searchPlaceholder: 'Nume firmă sau CUI',
      submit: 'Filtrează',
      clear: 'Șterge filtrele',
    },
    /** Takes "24 de firme". */
    count: (companies: string) => `${companies} în listă`,
    empty: 'Lista se completează pe măsură ce firmele sunt verificate.',
    emptyFiltered: 'Nicio firmă nu corespunde filtrelor alese.',
    emptyCta: 'Înscrie firma',
    pagination: {
      previous: 'Pagina anterioară',
      next: 'Pagina următoare',
      /** Takes the page numbers. */
      status: (page: number, total: number) => `Pagina ${page} din ${total}`,
    },
  },

  profile: {
    /** Takes the firm and the city. */
    metaTitle: (name: string, city: string | null) =>
      city ? `${name} — transport auto, ${city}` : `${name} — transport auto`,
    metaDescription: (name: string) =>
      `Documentele firmei ${name}, acoperirea și traseele publicate, pe ${BRAND_NAME}.`,
    back: 'Toate firmele',
    shield: {
      title: 'Scut de conformitate',
      lede:
        'Documentele firmei, verificate de echipa noastră. Arătăm starea și luna până la care sunt valabile, niciodată fișierele.',
      /** Takes a formatted date. */
      lastCheck: (date: string) => `Ultima verificare: ${date}`,
      noCheck: 'Verificarea documentelor este în curs.',
      /** Takes "octombrie 2027". */
      until: (month: string) => `valabil până în ${month}`,
      vehicles: 'Vehicule cu actele în termen',
      /** Takes "4 platforme". */
      vehiclesValue: (count: string) => count,
      noVehicles: 'Firma nu are încă vehicule active în platformă.',
    },
    about: 'Despre firmă',
    scope: 'Acoperire',
    /** What the firm said it carries, added with the company profile. */
    capabilities: {
      title: 'Ce transportă',
      coverage: 'Acoperire',
      coverageJudetean: 'Județele',
      coverageNational: 'Toată România',
      vehicleTypes: 'Categorii',
      services: 'Servicii',
      equipment: 'Dotări',
      fleet: 'Vehicule în flotă',
      rate: 'Tarif orientativ',
      /** Takes "2,50". */
      rateValue: (value: string) => `${value} lei/km`,
      rateNote:
        'Orientativ, declarat de firmă. Prețul unei curse este cel din ofertă.',
      website: 'Site',
      empty: 'Firma nu a completat încă această secțiune.',
    },
    routes: {
      title: 'Trasee publicate',
      lede: 'Traseele active ale firmei, așa cum apar pe bursă.',
      empty: 'Firma nu are trasee active acum.',
      /** Takes "3 locuri". */
      free: (slots: string) => `${slots} libere`,
      full: 'Fără locuri libere',
      see: 'Vezi traseul',
    },
    ratings: {
      title: 'Evaluări',
      /** Takes "12 evaluări". */
      count: (ratings: string) => `${ratings} de la clienți, după transporturi încheiate`,
    },
    cta: {
      quote: 'Cere o ofertă',
      contact: 'Contactează firma',
      contactNote:
        'Datele de contact se deschid din contul tău, în limita planului. Firma vede că ai cerut contactul.',
    },
    report: {
      title: 'Ai o problemă cu această firmă?',
      body:
        'Scrie-ne ce s-a întâmplat. Verificăm sesizarea și, dacă este întemeiată, suspendăm firma până se lămurește.',
    },
  },
} as const;
