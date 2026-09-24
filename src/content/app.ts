/**
 * Romanian copy for the application shell.
 *
 * Calm and literal: a shell is furniture, and furniture that talks about
 * itself gets in the way. The sentences that carry a figure take it as an
 * argument, so nothing here can state a number the data does not support.
 */

export const appCopy = {
  shell: {
    navLabel: 'Navigare în cont',
    moreLabel: 'Mai mult',
    moreTitle: 'Restul meniului',
    close: 'Închide',
    /** After a count on a menu item, for a screen reader: „3 care așteaptă". */
    waiting: 'care așteaptă',
    // The site's own „Sari la conținut" comes first and lands before this
    // menu; this one goes past it, so it says so.
    skipToContent: 'Sari peste meniu',
    help: 'Ajutor',
    publish: 'Publică',
    publishMenu: 'Ce vrei să publici',
    notifications: 'Notificări',
    account: 'Contul meu',
    signOut: 'Ieșire',
    settings: 'Setări',
    admin: 'Administrare',
    switcher: 'Firma activă',
    switcherAction: 'Schimbă',
    trial: (days: string) => `Perioadă gratuită · ${days}`,
    trialEnded: 'Perioada gratuită s-a încheiat',
    planActive: (name: string) => `Plan ${name}`,
    noPlan: 'Fără abonament',
  },

  banners: {
    documentsExpiring: {
      title: 'Documente care expiră curând',
      body: (count: string) =>
        `${count} expiră în mai puțin de 30 de zile. Încarcă-le acum, ca vehiculele să rămână pe bursă.`,
      action: 'Vezi documentele',
    },
    trialEnding: {
      title: 'Perioada gratuită se încheie curând',
      body: (days: string) =>
        `Mai sunt ${days}. După aceea contul rămâne al tău, dar contactele noi se blochează.`,
      action: 'Vezi planurile',
    },
    quotaReached: {
      title: 'Ai folosit toate contactele incluse',
      body:
        'Poți vedea în continuare cererile și traseele. Contactele noi se deblochează cu un plan superior sau luna viitoare.',
      action: 'Vezi planurile',
    },
    dismiss: 'Am înțeles',
  },

  home: {
    /** Takes the first name, when we know it. */
    greeting: (name: string | null) => (name ? `Bună, ${name}` : 'Bună'),
    // Literal, and phrased the way somebody would ask it: a dispatcher
    // opening the application wants the answer to one question, and
    // „Necesită atenție" is a heading for a report, not an answer.
    needsAttention: 'Ce ai de făcut acum',
    nothingToDo: 'Nimic de făcut acum. Panoul de cereri e deschis oricând.',
    quickActions: 'Ce poți face',
    activity: 'Activitate',
  },

  carrier: {
    checklist: {
      title: 'Ce mai ai de făcut',
      lede: 'Poți trimite oferte după ce ne uităm peste documente și le aprobăm.',
    },
    bookings: {
      title: 'Rezervări de confirmat',
      /** Takes "3 ore". */
      expiresIn: (left: string) => `Expiră în ${left}`,
      expired: 'A expirat',
      action: 'Vezi traseele',
    },
    documents: {
      title: 'Documente',
      /** Takes "2 documente". */
      expiring: (count: string) => `${count} expiră în mai puțin de 30 de zile`,
      rejected: (count: string) => `${count} au fost respinse și trebuie încărcate din nou`,
      action: 'Deschide documentele',
    },
    vehicles: {
      title: 'Vehicule oprite',
      /** Takes "2 vehicule". */
      body: (count: string) => `${count} nu apar pe bursă până când actele sunt în termen.`,
      action: 'Vezi flota',
    },
    matches: {
      title: 'Cereri pentru tine',
      lede: 'Alese după unde circuli, ce transporți și traseele pe care le-ai publicat.',
      empty: 'Deocamdată nimic nou pe rutele tale.',
      action: 'Vezi toate cererile',
      /** Why a card is here. Codes come from `matchReasons`. */
      reasons: {
        ruta: 'Pe un traseu publicat',
        judet: 'În județele tale',
        tara: 'În țările tale',
        categorie: 'Categorie acceptată',
        troliu: 'Ai troliu',
        tractare: 'Faci tractări',
      } as Record<string, string>,
      /** Shown when the profile is empty enough that matching says little. */
      completeProfile: 'Spune-ne unde circuli și ce transporți, și potrivirile se strâng pe ce faci tu.',
      /**
       * The detour, in the words a dispatcher uses: extra kilometres to
       * pick the vehicle up and drop it off, not how near the request
       * passes. The same sentence the alert e-mail carries, so the
       * screen and the e-mail cannot disagree.
       */
      detour: (km: number, tolerance: number, from: string, to: string) =>
        from === '' || to === ''
          ? `Ocol de ${km} km față de traseele tale (toleranță ${tolerance} km).`
          : `Ocol de ${km} km față de traseul ${from} — ${to} (toleranță ${tolerance} km).`,
    },
    orders: {
      title: 'Transporturi',
      nextPickup: 'Următoarea ridicare',
      awaiting: (n: number) =>
        n === 1 ? 'O comandă așteaptă un pas de la tine' : `${n} comenzi așteaptă un pas de la tine`,
      disputes: (n: number) => (n === 1 ? 'O comandă în dispută' : `${n} comenzi în dispută`),
      action: 'Vezi transporturile',
      none: 'Niciun transport în lucru acum.',
    },

    activity: {
      routes: 'Trasee active',
      seats: 'Locuri ocupate',
      contacts: 'Contacte folosite luna aceasta',
    },
    // The two publish actions come from `publishActions`, in the header's
    // order and under the header's words; these are the dashboard's own.
    actions: {
      vehicle: 'Adaugă un vehicul',
      document: 'Încarcă un document',
    },
  },

  /** The same widget for a client, who reads it from the other side. */
  clientOrders: {
    title: 'Transporturi',
    awaiting: 'O comandă așteaptă confirmarea ta',
    awaitingMany: (n: number) => `${n} comenzi așteaptă confirmarea ta`,
    inFlight: (n: number) =>
      n === 1 ? 'Un vehicul este pe drum' : `${n} vehicule sunt pe drum`,
    action: 'Vezi transporturile',
  },

  individual: {
    verifyPhone: {
      title: 'Confirmă numărul de telefon',
      body: 'Transportatorii răspund mai repede unei cereri de la un număr confirmat.',
      action: 'Confirmă acum',
    },
    /**
     * The phone number is not a formality here: `guard_cargo_listing_publish`
     * refuses to put a private person's request on the board without a
     * confirmed one, so this card is the difference between a request that is
     * published and one that waits as a draft.
     */
    noRequests: {
      title: 'Nu ai nicio cerere încă',
      body:
        'Spune-ne ce ai de transportat și de unde până unde. Publicarea este gratuită, iar cererea ajunge pe panoul pe care îl urmăresc transportatorii verificați.',
      action: 'Publică o cerere',
    },
    /** What the dashboard shows above the last few requests. */
    requests: {
      title: 'Cererile mele',
      all: 'Vezi toate cererile',
    },
    routes: {
      title: 'Trasee disponibile',
      body:
        'Platforme care circulă oricum pe ruta ta. Dacă găsești una potrivită, poți lua legătura direct.',
      action: 'Vezi traseele disponibile',
    },
  },

  driver: {
    title: 'Transporturile mele',
    body:
      'Aici vei vedea transporturile care îți sunt repartizate: traseul, vehiculul și datele de contact. Deocamdată repartizarea se face de către dispecerul firmei, în afara platformei.',
  },

  /**
   * The two error screens, for every page on the site. Formal and short:
   * no drawing, no accent, no exclamation, and the same words for a page
   * that never existed and one the visitor may not see — a 404 that
   * sounded different for the second would confirm it.
   */
  errors: {
    notFound: {
      title: 'Pagina nu există',
      body: 'Verifică adresa sau pornește din nou de la prima pagină.',
      action: 'Prima pagină',
    },
    failed: {
      title: 'Ceva nu a mers',
      body: 'Încearcă din nou. Dacă se repetă, scrie-ne și ne uităm.',
      action: 'Încearcă din nou',
      home: 'Prima pagină',
    },
  },
} as const;
