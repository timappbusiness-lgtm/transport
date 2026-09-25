/**
 * „Oferte" — the words on both sides of the same transaction.
 *
 * One file for the carrier's side and the client's, because the two
 * screens describe one thing and a second file is how they start
 * describing it differently.
 */
export const offersCopy = {
  meta: { title: 'Oferte' },

  form: {
    title: 'Trimite ofertă',
    lede: 'Clientul vede prețul, datele estimate și condițiile tale alături de celelalte oferte. Datele de contact rămân ascunse până când cineva acceptă.',
    price: 'Preț',
    currency: 'Moneda',
    priceHint: (max: string) => `Cel mult ${max}.`,
    pickup: 'Ridic pe',
    delivery: 'Livrez pe',
    datesHint: 'Estimări. Dacă se schimbă, vorbiți direct după confirmare.',
    vehicle: 'Vehiculul care face transportul',
    vehicleHint: 'Doar vehiculele active cu actele în termen.',
    vehicleNone: 'Niciun vehicul cu actele în termen. Actualizează-le în Flotă.',
    conditions: 'Ce include prețul',
    conditionsHint: 'Dacă prețul include TVA, asigurare, taxe, ce nu este inclus. Cel mult 1000 de caractere.',
    paymentTerm: 'Termen de plată (zile)',
    validity: 'Oferta este valabilă',
    validityHours: (h: number) => `${h} ore`,
    validityDays: (d: number) => (d === 1 ? 'o zi' : `${d} zile`),
    message: 'Mesaj pentru client',
    messageHint: 'Opțional. Numerele de telefon și adresele de e-mail se ascund automat.',
    submit: 'Trimite oferta',
    submitting: 'Se trimite…',
    cancel: 'Renunță',
    sent: 'Oferta a fost trimisă. Clientul a fost anunțat.',
    priceRange: (low: string, high: string) =>
      `Estimarea noastră pentru ruta asta: ${low} – ${high}. Este orientativă, nu o limită, și nu precizează dacă include TVA.`,
  },

  quota: {
    title: 'Ai atins limita planului',
    action: 'Vezi planurile',
    /** Takes the plan name and the ceiling it carries. */
    body: (plan: string, allowed: number) =>
      allowed === 1
        ? `Planul ${plan} include o ofertă pe lună și ai trimis-o deja.`
        : `Planul ${plan} include ${allowed} ${allowed >= 20 ? 'de oferte' : 'oferte'} pe lună și le-ai trimis pe toate.`,
    /** What is left, shown beside the button while there is room. */
    left: (left: number) =>
      left === 1 ? 'Îți mai rămâne o ofertă luna asta.' : `Îți mai rămân ${left} ${left >= 20 ? 'de oferte' : 'oferte'} luna asta.`,
  },

  /**
   * Why the „Trimite ofertă" button is not there.
   *
   * Every sentence names the thing to do next, because „nu poți" with no
   * next step is how a carrier decides the site is broken. The rules
   * themselves are `guard_offer_insert()` and `guard_offer_terms()`; these
   * are the same rules said out loud before somebody meets them.
   */
  entry: {
    signIn: 'Intră în cont ca să trimiți o ofertă.',
    signInAction: 'Intră în cont',
    /** A visitor on a request page: one card, one primary action. */
    visitor: {
      body: 'Ofertele și datele de contact sunt pentru transportatorii verificați.',
      signIn: 'Intră în cont ca să trimiți o ofertă',
      join: 'Ești transportator și nu ai cont?',
      joinAction: 'Înscrie firma gratuit',
    },
    needsCompany: 'Ofertele pe cererile de transport se trimit dintr-un cont de firmă.',
    needsCompanyAction: 'Adaugă firma',
    unverified: 'Firma trebuie verificată înainte de a trimite oferte.',
    unverifiedAction: 'Vezi verificarea',
    suspended: 'Contul firmei este suspendat, așa că nu poți trimite oferte.',
    suspendedAction: 'Vezi contul firmei',
    own: 'Este cererea ta.',
    closed: 'Cererea nu mai primește oferte.',
    already: 'Ai deja o ofertă în așteptare pe cererea asta.',
    alreadyAction: 'Vezi oferta',
  },

  sent: {
    title: 'Ofertele trimise',
    empty: 'Nu ai trimis nicio ofertă încă.',
    emptyBody: 'Deschide panoul de cereri și trimite prima ofertă. Cererile potrivite cu firma ta sunt marcate ca atare.',
    emptyAction: 'Vezi cererile',
    withdraw: 'Retrage',
    withdrawing: 'Se retrage…',
    withdrawConfirm: 'Retragi oferta? Clientul va fi anunțat. Poți trimite alta după.',
    withdrawn: 'Oferta a fost retrasă.',
    again: 'Trimite ofertă nouă',
    seeOrder: 'Vezi comanda',
  },

  received: {
    title: 'Oferte primite',
    empty: 'Nicio ofertă încă.',
    emptyBody: 'Transportatorii verificați văd cererea pe panou. Primele oferte vin de obicei în câteva ore.',
    sortBy: 'Sortează după',
    compare: 'Compară',
    compareTitle: 'Comparație',
    compareHint: (n: number) => `Primele ${n} oferte, una lângă alta.`,
    closeCompare: 'Închide comparația',
    accept: 'Acceptă',
    reject: 'Refuză',
    ask: 'Cere lămuriri',
    verified: 'Firmă verificată',
    verifiedOn: (date: string) => `Verificată pe ${date}`,
    notVerified: 'Firmă neverificată',
    profile: 'Vezi profilul firmei',
    vehicle: 'Vehicul',
    pickup: 'Ridicare',
    delivery: 'Livrare',
    conditions: 'Condiții',
    paymentTerm: (days: number) => `Plată la ${days} de zile`,
    noDate: 'nu a spus',
    rejected: 'Oferta a fost refuzată.',
  },

  accept: {
    title: 'Accepți oferta?',
    body: 'După ce accepți, comanda este creată și vă vedeți datele de contact.',
    others: 'Celelalte oferte vor fi refuzate automat.',
    confirm: 'Da, accept',
    confirming: 'Se confirmă…',
    cancel: 'Nu încă',
    done: 'Ai ales transportatorul',
    nextSteps: 'Ce urmează',
    steps: [
      'Sunați transportatorul ca să stabiliți ora exactă a încărcării.',
      'La încărcare, verificați actele mașinii și starea vehiculului.',
      'Plata se face între dumneavoastră, după termenul din ofertă.',
    ],
  },

  thread: {
    title: 'Întrebări despre ofertă',
    lede: 'Numerele de telefon și adresele de e-mail se ascund automat până când comanda este confirmată.',
    placeholder: 'Scrie întrebarea…',
    send: 'Trimite',
    sending: 'Se trimite…',
    empty: 'Nicio întrebare încă.',
    masked: 'Am ascuns datele de contact din mesaj. Le veți vedea după confirmarea comenzii.',
    willMask: 'Mesajul pare să conțină date de contact. Le vom ascunde până la confirmarea comenzii.',
    hidden: 'Mesaj ascuns de echipa platformei.',
    open: 'Cere lămuriri',
  },

  /**
   * The order, as far as Faza 2 goes.
   *
   * A summary and the two telephone numbers, not an execution screen.
   * Loading, proof of delivery and ratings are the phases after this
   * one, and the page says so rather than showing empty boxes for them.
   */
  order: {
    title: 'Comanda',
    back: 'Înapoi la oferte',
    notFound: 'Comanda nu există sau nu îți aparține.',
    summary: 'Ce s-a stabilit',
    route: 'Traseu',
    price: 'Preț convenit',
    paymentTerm: 'Termen de plată',
    paymentTermValue: (days: number) => (days === 1 ? 'o zi' : `${days} de zile`),
    agreedOn: 'Confirmată pe',
    vehicle: 'Vehicul',
    status: 'Stare',
    statusLabels: {
      agreed: 'Confirmată',
      loading: 'La încărcare',
      in_transit: 'În transport',
      delivered: 'Livrată',
      invoiced: 'Facturată',
      closed: 'Închisă',
      disputed: 'În dispută',
      cancelled: 'Anulată',
    } as Record<string, string>,
    offer: 'Vezi oferta',
    request: 'Vezi cererea',
    soonTitle: 'Ce urmează pe platformă',
    soonBody:
      'Încărcarea, dovada livrării și evaluările se adaugă în etapa următoare. Până atunci, transportul se desfășoară între dumneavoastră, cu datele de contact de mai sus.',
  },

  /** The staff screen, which reads and never writes. */
  admin: {
    eyebrow: 'Administrare',
    title: 'Oferte',
    lede: 'Toate ofertele trimise pe platformă. Ecranul citește; nimic de aici nu schimbă o ofertă.',
    filters: {
      title: 'Filtre',
      status: 'Stare',
      any: 'Oricare',
      company: 'Firma care a trimis',
      from: 'De la',
      to: 'Până la',
      apply: 'Filtrează',
      clear: 'Vezi toate',
    },
    list: {
      total: (n: string) => `${n} oferte`,
      page: (page: number, last: number) => `Pagina ${page} din ${last}`,
      previous: 'Pagina anterioară',
      next: 'Pagina următoare',
      open: 'Deschide',
      messages: (n: number) => (n === 1 ? 'un mesaj' : `${n} mesaje`),
      noMessages: 'fără mesaje',
      individual: 'Persoană fizică',
      noRequest: 'Cerere ștearsă',
    },
    empty: {
      title: 'Nicio ofertă pentru filtrele astea.',
      body: 'Schimbă starea, firma sau intervalul de date.',
    },
    detail: {
      back: 'Înapoi la oferte',
      title: 'Ofertă',
      terms: 'Termenii ofertei',
      parties: 'Părțile',
      carrier: 'Transportator',
      client: 'Client',
      request: 'Cererea',
      requestStatus: 'Starea cererii',
      sentAt: 'Trimisă',
      validUntil: 'Valabilă până la',
      expiredAt: 'A expirat',
      vehicle: 'Vehicul',
      transport: 'Comanda creată',
      noTransport: 'Nicio comandă',
      readOnly: 'Echipa nu poate schimba o ofertă. Singura acțiune de aici este ascunderea unui mesaj.',
      thread: 'Discuția despre ofertă',
      threadEmpty: 'Nicio întrebare pe oferta asta.',
      masked: 'Date de contact ascunse automat',
      hide: 'Ascunde mesajul',
      hideReason: 'De ce îl ascunzi',
      hideReasonHint: 'Motivul rămâne în jurnalul de acțiuni, alături de numele tău.',
      hideSubmit: 'Ascunde',
      hideCancel: 'Renunță',
      hidden: 'Mesajul a fost ascuns.',
      hiddenBadge: 'Ascuns',
      hiddenBy: (reason: string) => `Motiv: ${reason}`,
      notFound: 'Oferta nu există sau a fost ștearsă.',
    },
  },

  contact: {
    title: 'Date de contact',
    open: 'Vezi datele de contact',
    free: 'Nu consumă din abonament: aveți o comandă confirmată.',
    name: 'Persoana de contact',
    phone: 'Telefon',
    email: 'E-mail',
  },
} as const;
