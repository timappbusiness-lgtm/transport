/**
 * The landing pages, in Romanian.
 *
 * Only the words that are the *same* on every page of a kind live here.
 * Everything specific — the heading, the intro, the questions — comes from
 * the `seo_pages` row, because that is what staff edits at /admin/pagini
 * without a deploy.
 *
 * The rule `tests/unit/transport-auto-content.test.ts` holds: nothing here
 * states a figure. A landing page exists to show real numbers, and a
 * number written into the copy is a number that goes stale the week after
 * somebody changes the thing it describes.
 */

export const seoCopy = {
  index: {
    title: 'Transport auto — rute, județe și tipuri de vehicul',
    h1: 'Transport auto',
    h1Soft: 'pe rutele pe care le acoperim.',
    lede:
      'Prețuri orientative, firme cu documentele verificate și ce este publicat acum, pe fiecare rută.',
    corridors: 'Din străinătate în România',
    routes: 'Rute interne',
    counties: 'Județe',
    vehicleTypes: 'După tipul vehiculului',
    empty: 'Nu este publicată încă nicio pagină.',
  },

  price: {
    title: 'Preț orientativ',
    /** Takes "1.850 lei" or "620 €". */
    from: (amount: string) => `de la ${amount}`,
    note:
      'Estimare calculată din tarifele pe kilometru publicate de noi. Prețul unei curse este cel din oferta transportatorului.',
    example:
      'Calculat pe o rută de referință, pentru că un coridor nu are o singură distanță. Folosește calculatorul pentru ruta ta.',
    unpublished:
      'Nu avem încă tarife publicate pentru această rută. Calculatorul de mai jos îți dă o estimare când le publicăm.',
    calculator: 'Calculează pentru ruta ta',
  },

  facts: {
    distance: 'Distanță',
    /** Takes "1.450 km". */
    distanceValue: (km: string) => `≈ ${km}`,
    duration: 'Timp de condus',
    /** Takes "22". */
    durationValue: (hours: string) => `≈ ${hours} h`,
    durationNote:
      'Timp de condus, nu termen de livrare. O platformă are opriri, pauze obligatorii și, pe transportul pe sens, așteptarea completării.',
    example: 'rută de referință',
  },

  requests: {
    title: 'Cereri publicate acum',
    lede: 'Ce caută clienții pe această rută, chiar acum.',
    empty: 'Nicio cerere publicată acum pe această rută.',
    emptyAction: 'Publică prima cerere',
    all: 'Vezi toate cererile',
  },

  departures: {
    title: 'Trasee disponibile',
    lede: 'Plecări anunțate de transportatori, pe tur și pe retur.',
    empty: 'Niciun traseu anunțat acum pe această rută.',
    emptyAction: 'Vezi toate traseele',
    all: 'Vezi toate traseele',
  },

  companies: {
    title: 'Firme verificate care acoperă ruta',
    /** Takes "12 firme". */
    count: (firms: string) => `${firms} cu documentele verificate acoperă această zonă.`,
    empty:
      'Nu avem încă firme verificate care să fi trecut această zonă în acoperirea lor. Publică o cerere: ajunge la toți transportatorii care fac ruta.',
    all: 'Vezi firmele',
  },

  documents: {
    title: 'Ce acte îți trebuie',
    body:
      'Pentru vehicul: actele care arată că este al tău și, la transport internațional, documentul de transport. Nu are nevoie de numere de înmatriculare ca să urce pe platformă. Transportatorul îți spune exact ce are nevoie înainte de încărcare.',
    link: 'Ce documente cerem firmelor',
  },

  verification: {
    title: 'Cum verificăm firmele',
    body:
      'Primim și aprobăm documentele fiecărei firme — licența, asigurarea și actele vehiculelor — și le reverificăm automat înainte să expire. O firmă cu un document expirat iese de pe listă până îl reînnoiește.',
    link: 'Cum verificăm firmele',
  },

  faq: {
    title: 'Întrebări frecvente',
  },

  related: {
    corridor_international: 'Alte țări',
    route_internal: 'Alte rute',
    county: 'Județe vecine',
    vehicle_type: 'Alte tipuri de vehicul',
  } as Record<string, string>,

  cta: {
    publish: 'Publică o cerere',
    publishNote: 'Publicarea este gratuită și nu cere cont de firmă.',
    departures: 'Vezi traseele disponibile',
  },

  breadcrumbHome: 'Acasă',
};
