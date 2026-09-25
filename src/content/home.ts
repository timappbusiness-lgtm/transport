/**
 * Romanian copy for the homepage. Components never contain hardcoded text.
 *
 * Rules that hold throughout: no invented numbers presented as real data,
 * every demonstration card labelled "Exemplu", every price labelled
 * orientativ. No exclamation marks, no superlatives, no social proof counts.
 *
 * The voice is a person talking to somebody who has a car to move or a
 * platform to fill: second person, short sentences, the words used on the
 * telephone. Warm is not the same as promising. Nothing here says an
 * offer will come, a transport will be cheaper or a return will be full —
 * the platform enforces none of those, so the copy does not say them.
 */
import { BRAND_NAME } from '@/config/brand';


export type CountryCode = 'RO' | 'DE' | 'IT' | 'NL' | 'ES' | 'FR' | 'BE' | 'AT' | 'HU';

export const homeCopy = {
  hero: {
    eyebrow: 'Transport auto · România și Europa',
    strong: 'Găsești cine îți duce mașina,',
    soft: 'dintre firme verificate.',
    subtitle:
      'Spui ce ai de mutat și de unde, gratuit. Îți pot trimite oferte doar firmele cu documentele în regulă.',
    primary: 'Publică o cerere',
    secondary: 'Trasee disponibile',
    photoAlt: 'Platformă auto încărcată, pe un drum european',
  },

  panel: {
    eyebrow: 'Ce vezi despre un transportator',
    strong: 'Vezi cu cine vorbești',
    soft: 'înainte să dai telefon.',
    lede:
      'Urmărim zilnic când expiră actele fiecărei firme. Cardurile de mai jos sunt exemple, ca să vezi cum arată.',
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
      // Split so the figure can carry the accent. Reads identically:
      // „3 locuri libere din 8".
      caption: { free: 3, total: 8, suffix: 'locuri libere din 8' },
      free: 'liber',
    },
    corridor: {
      title: 'Pe coridor, cu ocol acceptat',
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
    strong: 'Cereri noi,',
    soft: 'care așteaptă un transportator.',

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
      strong: 'Mașini, dube, rulote',
      soft: 'și tot ce urcă pe o platformă.',
      /** Takes „90 de zile". */
      note: (window: string) => `Cereri publicate în ultimele ${window}.`,
      /** Takes „12 cereri" and the category name. */
      linkLabel: (count: string, category: string) => `${count} la categoria ${category}`,
    },

    empty: {
      body: 'Aici apar cererile, pe măsură ce oamenii le publică. Panoul e deschis, te poți uita oricând.',
      primary: 'Publică o cerere',
      board: 'Vezi panoul de cereri',
      secondary: 'Trasee disponibile',
    },

    cta: {
      strong: 'Publici cererea',
      soft: 'gratuit.',
      stepsTitle: 'Cum funcționează',
      steps: [
        'Scrii de unde, până unde și ce mașină. Durează cam două minute.',
        'Transportatorii verificați o văd și îți pot trimite oferte.',
        'Compari și alegi tu. Datele tale de contact rămân ascunse până atunci.',
      ],
      button: 'Publică o cerere gratuit',
      note: 'Nu plătești abonament. Contul îl faci la final, după ce ai completat.',
    },
  },

  comparison: {
    eyebrow: 'Cum se schimbă',
    strong: 'Ce faci azi',
    soft: `și ce faci cu ${BRAND_NAME}.`,
    oldTitle: 'Cum era',
    newTitle: `Cu ${BRAND_NAME}`,
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
      'Comanda rămâne scrisă',
      'Returul se vede pe panou',
    ],
    stepLabel: 'Pasul',
  },

  forwarders: {
    eyebrow: 'Pentru case de expediții',
    strong: 'Publici cererile o dată.',
    soft: 'Primești oferte doar de la firme cu acte valabile.',
    lede:
      'Cont de firmă pentru toată echipa, cereri de transport publice sau trimise doar transportatorilor tăi, și istoricul comenzilor într-un singur loc.',
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
    lede: 'Publici o cerere de transport sau un traseu. Formularul te duce pas cu pas.',
    primary: 'Publică o cerere',
    secondary: 'Publică un traseu',
  },
} as const;
