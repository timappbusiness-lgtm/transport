/**
 * Romanian copy for the homepage. Components never contain hardcoded text.
 *
 * Rules that hold throughout: no invented numbers presented as real data,
 * every demonstration card labelled "Exemplu", every price labelled
 * orientativ. No exclamation marks, no superlatives, no social proof counts.
 */

export type CountryCode = 'RO' | 'DE' | 'IT' | 'NL' | 'ES' | 'FR' | 'BE' | 'AT' | 'HU';

export const homeCopy = {
  hero: {
    eyebrow: 'Transport auto · România și Europa',
    strong: 'Transport auto',
    soft: 'cu firme verificate.',
    subtitle:
      'Publici cererea gratuit și primești oferte doar de la transportatori cu documente valabile.',
    primary: 'Publică o cerere',
    secondary: 'Trasee disponibile',
    photoAlt: 'Platformă auto încărcată, pe un drum european',
  },

  panel: {
    eyebrow: 'Ce vezi despre un transportator',
    strong: 'Datele care contează,',
    soft: 'înainte să dai telefon.',
    lede:
      'Fiecare firmă are documentele urmărite zilnic. Cardurile de mai jos arată forma informației, cu date demonstrative.',
    documents: {
      title: 'Documentele firmei',
      subtitle: 'Autotrans Exemplu SRL · Timiș',
      rows: [
        { label: 'Licență comunitară', value: '21.10.2027', tone: 'success', state: 'valabil' },
        { label: 'Asigurare CMR', value: '03.04.2027', tone: 'success', state: 'valabil' },
        { label: 'ITP · TM 04 EXE', value: '11.06.2027', tone: 'success', state: 'valabil' },
        { label: 'RCA · TM 04 EXE', value: '28.09.2026', tone: 'warning', state: 'expiră curând' },
        { label: 'Copie conformă', value: '14.02.2026', tone: 'danger', state: 'expirat' },
      ],
    },
    seats: {
      title: 'Locuri pe platformă',
      subtitle: 'München → Cluj-Napoca · platformă deschisă',
      taken: 5,
      total: 8,
      caption: '3 locuri libere din 8',
      free: 'liber',
    },
    corridor: {
      title: 'Coridor și ocol acceptat',
      from: 'München',
      fromCc: 'DE' as CountryCode,
      to: 'Cluj-Napoca',
      toCc: 'RO' as CountryCode,
      waypoints: 'Viena · Budapesta · Oradea',
      detourLabel: 'Ocol acceptat',
      detour: '50 km',
      windowLabel: 'Plecare',
      window: '22.09 – 24.09',
    },
  },

  /**
   * The activity section. Every number it shows comes from the database —
   * there is not one figure in this block, only the sentences around them.
   */
  activity: {
    eyebrow: 'Activitate pe platformă',
    strong: 'Cereri noi',
    soft: 'de transport auto.',

    stats: {
      sparklineLabel: 'Cereri publicate în ultimele 30 de zile',
      sparklineCaption: 'Ultimele 30 de zile',
      km: (km: string) => `${km} km de transport solicitat`,
      kmNote: 'Distanțe estimate, însumate din cererile publicate',
      week: (requests: string) => `${requests} în ultimele 7 zile`,
      weekNote: 'Cereri publicate de persoane și firme',
    },

    feed: {
      title: 'Cele mai noi cereri',
      running: 'Pornește',
      notRunning: 'Nu pornește',
      express: 'Expres',
      newBadge: 'Cereri noi',
      showNew: 'Arată-le',
      all: 'Vezi toate cererile',
      /** Read out before the route, which is otherwise two names and an arrow. */
      routeLabel: (from: string, to: string) => `De la ${from} la ${to}`,
    },

    /**
     * The counters per kind of vehicle.
     *
     * The note is the whole point: a number without a window is a number
     * nobody can check, and „în ultimele 90 de zile" is what makes this
     * a fact rather than a boast.
     */
    categories: {
      eyebrow: 'Ce se transportă',
      strong: 'Pe categorii',
      soft: 'de vehicule.',
      /** Takes „90 de zile". */
      note: (window: string) => `Cereri publicate în ultimele ${window}.`,
      /** Takes „12 cereri" and the category name. */
      linkLabel: (count: string, category: string) => `${count} la categoria ${category}`,
    },

    empty: {
      body: 'Primele cereri apar aici imediat ce sunt publicate. Până atunci, panoul e deschis: poți vedea singur ce e pe el.',
      primary: 'Publică o cerere',
      board: 'Vezi panoul de cereri',
      secondary: 'Trasee disponibile',
    },

    cta: {
      strong: 'Publici cererea',
      soft: 'gratuit.',
      stepsTitle: 'Cum funcționează',
      steps: [
        'Completezi traseul și detaliile vehiculului, în două minute.',
        'Transportatorii verificați văd cererea și îți trimit oferte.',
        'Compari ofertele și alegi. Datele tale de contact rămân ascunse până decizi tu.',
      ],
      button: 'Publică o cerere gratuit',
      note: 'Fără abonament pentru clienți. Contul se creează la final.',
    },
  },

  comparison: {
    eyebrow: 'Cum se schimbă',
    strong: 'Ce faci azi',
    soft: 'și ce faci cu Coridor.',
    oldTitle: 'Vechea metodă',
    newTitle: 'Cu Coridor',
    old: [
      'Grupuri de Facebook',
      'Zeci de telefoane',
      'Nicio verificare',
      'Acte expirate',
      'Retur gol',
    ],
    fresh: [
      'Publici o singură dată',
      'Oferte de la firme verificate',
      'Documente urmărite zilnic',
      'Comandă în platformă',
      'Retur plin',
    ],
    stepLabel: 'Pasul',
  },

  forwarders: {
    eyebrow: 'Pentru case de expediții',
    strong: 'Publici cursele o dată.',
    soft: 'Primești oferte doar de la firme cu acte valabile.',
    lede:
      'Cont de firmă pentru toată echipa, curse publice sau trimise doar transportatorilor tăi, și istoricul comenzilor într-un singur loc.',
    points: [
      'Un cont de firmă, mai mulți dispeceri',
      'Vezi documentele fiecărui ofertant',
      'Istoricul comenzilor rămâne în platformă',
    ],
    cta: 'Creează cont de firmă',
  },


  finalCta: {
    strong: 'Ai o mașină de mutat',
    soft: 'sau un loc liber pe platformă?',
    lede: 'Publică o cerere de transport sau anunță un traseu disponibil.',
    primary: 'Publică o cerere',
    secondary: 'Anunță un traseu',
  },
} as const;
