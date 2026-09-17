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
    skipToContent: 'Sari la conținut',
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
    needsAttention: 'Necesită atenție',
    nothingToDo: 'Nimic care să aibă nevoie de tine acum.',
    quickActions: 'Ce poți face',
    activity: 'Activitate',
  },

  carrier: {
    checklist: {
      title: 'Ce mai ai de făcut',
      lede: 'Firma poate trimite oferte după ce echipa noastră aprobă documentele.',
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
      title: 'Cereri pe traseele tale',
      lede: 'Potrivire după traseu: aceleași țări, în perioada în care ai drum.',
      empty: 'Nicio cerere nouă pe traseele tale.',
      action: 'Vezi toate cererile',
    },
    activity: {
      routes: 'Trasee active',
      seats: 'Locuri ocupate',
      contacts: 'Contacte folosite luna aceasta',
    },
    actions: {
      tur: 'Publică un traseu pe tur',
      retur: 'Publică un traseu pe retur',
      vehicle: 'Adaugă un vehicul',
      document: 'Încarcă un document',
    },
  },

  individual: {
    verifyPhone: {
      title: 'Confirmă numărul de telefon',
      body: 'Transportatorii răspund mai repede unei cereri de la un număr confirmat.',
      action: 'Confirmă acum',
    },
    /** Until the request flow exists, this is the honest state of the account. */
    noRequests: {
      title: 'Încă nu poți publica o cerere din cont',
      body:
        'Formularul de cerere este în lucru. Până atunci poți vedea traseele publicate de transportatori și lua legătura direct.',
      action: 'Vezi traseele disponibile',
    },
  },

  driver: {
    title: 'Transporturile mele',
    body:
      'Aici vei vedea transporturile care îți sunt repartizate: traseul, vehiculul și datele de contact. Deocamdată repartizarea se face de către dispecerul firmei, în afara platformei.',
  },

  errors: {
    notFound: {
      title: 'Pagina nu există',
      body: 'Verifică adresa sau întoarce-te în cont.',
      action: 'Înapoi în cont',
    },
    failed: {
      title: 'Ceva nu a mers',
      body: 'Încearcă din nou. Dacă se repetă, scrie-ne și ne uităm.',
      action: 'Încearcă din nou',
    },
  },
} as const;
