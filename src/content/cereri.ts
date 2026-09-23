/**
 * Romanian copy for publishing a request, the public board and the
 * client's own list.
 *
 * Two rules this file keeps. Nothing here promises anything the platform
 * does not do — there is no offer screen yet, so no sentence says an offer
 * will arrive; what carriers can do today is see the request and telephone.
 * And no number is written here: the plan's limits come from `plans`, and
 * the distances from the database.
 */
export const requestsCopy = {
  /** Cine vede cererea. */
  visibility: {
    title: 'Cine vede cererea',
    label: 'Unde apare cererea',
    public: 'Pe bursă, pentru toți transportatorii',
    publicHint: 'Primești oferte de la oricine circulă pe ruta ta.',
    private: 'Doar transportatorii pe care îi aleg',
    privateHint:
      'Nu apare pe panoul public și nimeni altcineva nu primește alertă pentru ea.',
    privateLede:
      'Cererea este privată: o văd numai firmele invitate, și numai ele pot trimite oferte.',
    invited: 'Transportatori invitați',
    saveInvites: 'Salvează invitațiile',
    noFavourites:
      'Nu ai încă transportatori favoriți. Adaugă-i din lista de firme, apoi îi inviți de aici.',
    openHint:
      'Dacă nu primești oferta pe care o vrei, deschide cererea pe bursă. Nu se poate reveni: odată publică, rămâne publică.',
    openAction: 'Deschide pe bursă',
    badgePrivate: 'Privată',
  },

  form: {
    eyebrow: 'Cerere de transport',
    title: 'Spune-ne ce ai de transportat',
    lede: 'Patru pași, sub două minute. Publicarea este gratuită, iar datele tale de contact le vede doar un transportator verificat.',
    steps: {
      ruta: 'Ruta',
      vehicul: 'Vehiculul',
      stare: 'Starea',
      contact: 'Contact',
    },
    stepOf: (current: number, total: number) => `Pasul ${current} din ${total}`,
    next: 'Continuă',
    back: 'Înapoi',
    submit: 'Publică cererea',
    submitting: 'Se publică…',
    saveDraft: 'Salvează ca ciornă',

    route: {
      title: 'De unde, până unde și când',
      fromCity: 'Oraș de plecare',
      fromCountry: 'Țara de plecare',
      toCity: 'Oraș de destinație',
      toCountry: 'Țara de destinație',
      cityHint: 'Scrie orice localitate. Cele din listă vin cu distanța calculată.',
      loadingFrom: 'Poate fi încărcat de la',
      loadingTo: 'Până la (opțional)',
      windowHint:
        'Un interval găsește mai repede un transportator decât o singură zi: platformele își fac ruta cu o săptămână înainte.',
    },

    vehicle: {
      title: 'Ce transportăm',
      category: 'Categoria',
      make: 'Marca',
      makePlaceholder: 'Volkswagen',
      model: 'Modelul',
      modelPlaceholder: 'Golf',
      year: 'Anul fabricației',
      weight: 'Greutatea, kg (opțional)',
      weightHint: 'Dacă o știi. Transportatorul o folosește pentru sarcina pe punte.',
      closedSuggestion:
        'Pentru un vehicul istoric îți recomandăm transportul în remorcă închisă — ferit de praf, pietre și vreme. Transportatorii care au remorcă închisă îți apar primii. Poți alege și platformă deschisă.',
      otherDescription: 'Ce transporți',
      otherDescriptionHint:
        'Obligatoriu pentru „Altceva": scrie ce este și cât cântărește, ca transportatorii să știe dacă pot.',
      otherDescriptionPlaceholder: 'Un generator de curent pe remorcă, aproximativ 400 kg.',
    },

    condition: {
      title: 'În ce stare este',
      lede: 'Este întrebarea care schimbă cel mai mult prețul. Un vehicul care urcă singur pe platformă și unul care are nevoie de troliu și de un al doilea om sunt două lucrări diferite.',
      isRunning: 'Pornește și se deplasează',
      wheelsTurn: 'Roțile se învârt',
      steeringWorks: 'Direcția funcționează',
      hasKeys: 'Are cheile',
      isDamaged: 'Are avarii',
      damageNotes: 'Ce este avariat',
      damageHint: 'Pe scurt: „aripa dreapta față lovită, ușa nu se deschide”.',
      winch: 'Transportatorul vine pregătit cu troliu.',
      service: 'Cum vrei să fie transportat',
      serviceStandard: 'Standard',
      serviceStandardNote: 'Pleacă atunci când platforma se umple pe ruta ta. Cea mai ieftină variantă.',
      serviceExpress: 'Expres',
      serviceExpressNote: 'Cursă dedicată, la data pe care o alegi tu. Costă mai mult.',
    },

    contact: {
      title: 'Cum te găsește transportatorul',
      lede: 'Numărul tău nu apare pe anunț. Îl vede doar un transportator verificat, după ce îl deschide din abonamentul lui, și fiecare deschidere se înregistrează.',
      name: 'Numele tău',
      phone: 'Telefon',
      phoneHint: 'Aici te sună transportatorul.',
      email: 'E-mail (opțional)',
      description: 'Altceva de spus (opțional)',
      descriptionHint:
        'Detalii utile: unde anume este mașina, dacă cineva o predă în locul tău, dacă ai flexibilitate la dată. Nu scrie aici numărul de telefon — este deja mai sus.',
    },

    account: {
      title: 'Mai e un pas: contul',
      body: 'Ca să publicăm cererea avem nevoie de un cont gratuit. Îl faci în câteva secunde, iar ce ai completat până acum te așteaptă aici.',
      signUp: 'Fă-ți cont gratuit',
      signIn: 'Am deja cont',
    },

    saved: {
      title: 'Cererea este salvată ca ciornă',
      published: 'Cererea ta este publicată',
      publishedBody:
        'Apare acum pe panoul de cereri, unde o văd transportatorii verificați. O găsești oricând în contul tău.',
      seeRequests: 'Vezi cererile mele',
      seeBoard: 'Vezi panoul de cereri',
    },

    duration: {
      label: 'Cât timp stă pe panou',
      hint: 'Îți scriem cu două zile înainte să iasă, ca să o prelungești sau să o închizi. O poți prelungi oricând.',
      option: (days: number) =>
        days === 3 ? '3 zile' : days === 30 ? 'o lună' : `${days} zile`,
    },

    photos: {
      title: 'Pozele vehiculului',
      hint: 'Până la 6 poze. Ajută cel mai mult dacă mașina e avariată sau nu pornește — un transportator care vede exact ce ridică dă un preț ferm din prima. Ștergem datele de localizare din poză înainte să o salvăm.',
      add: 'Adaugă poze',
      remove: 'Șterge poza',
      fromImport: 'din anunț',
      uploading: 'Se încarcă…',
      remaining: (left: number, max: number) =>
        left === 1 ? `Mai poți adăuga o poză (din ${max}).` : `Mai poți adăuga ${left} poze (din ${max}).`,
      full: (max: number) => `Ai adăugat toate cele ${max} poze.`,
    },

    errors: {
      generic: 'Nu am putut salva cererea. Mai încearcă o dată.',
      offline: 'Nu avem legătură cu baza de date. Cererea nu a fost salvată.',
    },
  },

  board: {
    // What the page is, in three words. The eyebrow above it said
    // „Panoul de cereri" and the heading said „Cereri de transport" —
    // the same thing twice, before a lede that said it a third time.
    title: 'Cereri de transport',
    // One sentence: what is on the page, and what to do next. It names
    // no offer on purpose — a visitor reading the board is not being sold
    // an account, and `tests/unit/cereri-content.test.ts` holds that rule.
    lede: 'Vehicule care așteaptă un transportator. Caută ruta ta și deschide cererea.',
    tabs: {
      toate: 'Toate',
      curse: 'De la firme',
      retur: 'De la persoane fizice',
    },
    count: (n: number) => (n === 1 ? 'O cerere' : `${n} cereri`),
    signedOutNote: 'Datele de contact se deschid după ce firma este verificată.',
    publish: 'Publică o cerere',
  },

  filters: {
    // „Caută" rather than „Filtre": it says what the box does, not what
    // it is. A dispatcher looking for work from Timiș is searching.
    title: 'Caută transport',
    // The three on screen. Short, because they sit over the field and
    // „Oraș de plecare" is three words for a box you type a town into.
    fromCityShort: 'De unde',
    toCityShort: 'Unde',
    categoryShort: 'Tip vehicul',
    cityPlaceholder: 'Orice localitate',
    more: 'Mai multe filtre',
    moreActive: (n: number) => `${n} active`,
    sort: 'Ordonează',
    tab: 'Cine a publicat',
    tabAll: 'Oricine',
    tabCompanies: 'Firme',
    tabIndividuals: 'Persoane fizice',
    fromCountry: 'Țara de plecare',
    fromCity: 'Oraș de plecare',
    toCountry: 'Țara de destinație',
    toCity: 'Oraș de destinație',
    dateFrom: 'Încărcare de la',
    dateTo: 'Încărcare până la',
    category: 'Categoria',
    condition: 'Starea vehiculului',
    conditionRunning: 'Pornește',
    conditionNotRunning: 'Nu pornește',
    service: 'Tip de serviciu',
    servicePeSens: 'Pe sens (mai ieftin)',
    serviceExpres: 'Expres (pleacă dedicat)',
    scope: 'Acoperire',
    scopeDomestic: 'Intern',
    scopeInternational: 'Internațional',
    near: 'Lângă localitatea',
    radius: 'Pe o rază de',
    radiusOption: (km: number) => `${km} km`,
    /**
     * Says what the radius is measured from, because the coordinates on
     * a request are a locality's centroid and not an address. Promising
     * more than that is how a filter starts lying.
     */
    radiusHint:
      'Distanța în linie dreaptă între localități. Cererile luate dintr-un sat pe care nu îl știm nu apar în rază.',
    maxWeight: 'Greutate maximă (kg)',
    maxWeightHint: 'Cererile fără greutate trecută rămân în listă — o vezi pe fiecare card.',
    any: 'Oricare',
    apply: 'Caută',
    clear: 'Șterge filtrele',
    mine: 'Doar cele potrivite cu firma mea',
    mineHint:
      'Acoperirea, categoriile și dotările din profil, plus ocolul pe care îl acceptă traseele tale publicate.',
    mineNoCompany:
      'Filtrul „potrivite cu firma mea” are nevoie de un cont de firmă cu profilul completat. Ți-am arătat deocamdată toate cererile.',
    /**
     * Says which window was examined, because the filter runs after the
     * query: „3 cereri" alone would read as „the board has three".
     */
    mineCount: (shown: number, scanned: number) =>
      `${shown} din cele mai recente ${scanned} cereri se potrivesc cu firma ta.`,
  },

  card: {
    winch: 'Are nevoie de troliu',
    running: 'Pornește și se deplasează',
    fromCompany: 'Firmă',
    fromIndividual: 'Persoană fizică',
    photos: (n: number) => (n === 1 ? 'O fotografie' : `${n} fotografii`),
    open: 'Vezi cererea',
    weight: (kg: number) => `${new Intl.NumberFormat('ro-RO').format(kg)} kg`,
  },

  empty: {
    mineTitle: 'Nicio cerere potrivită cu firma ta',
    mineBody: 'Filtrul cere acoperire, categorie, dotări și un ocol în toleranța traseelor tale.',
    mineClear: 'Vezi toate cererile',
    /** The board itself is empty. One sentence: what will be here. */
    title: 'Încă nu este nicio cerere aici',
    body: 'Aici apar vehiculele care așteaptă un transportator.',
    publish: 'Publică o cerere',
    /** The search found nothing. The action is the filters, not a form. */
    filteredTitle: 'Nicio cerere pentru această căutare',
    filteredBody: 'Șterge filtrele ca să vezi tot panoul.',
    clear: 'Vezi toate cererile',
    /** One level down: the alert, and the other board. */
    more: 'Altceva de făcut de aici',
    departures: 'Vezi traseele',
  },

  detail: {
    back: 'Înapoi la cereri',
    route: 'Ruta',
    window: 'Perioada de încărcare',
    vehicle: 'Vehiculul',
    condition: 'Starea',
    service: 'Serviciul',
    notes: 'De la client',
    published: 'Publicată',
    contact: 'Deschide datele de contact',
    contactHidden: 'Intră în cont ca transportator ca să deschizi datele de contact.',
    seePlans: 'Vezi planurile și limitele',
    missing: 'Cererea nu mai este pe panou.',
    missingBody: 'Fie a fost retrasă, fie perioada de încărcare a trecut.',
    anonBody:
      'Ruta, perioada și starea vehiculului sunt publice. Restul detaliilor și contactul se văd din contul unui transportator verificat.',
  },

  mine: {
    eyebrow: 'Cererile mele',
    title: 'Cererile mele',
    lede: 'Tot ce ai publicat, cu starea fiecărei cereri.',
    empty: 'Nu ai nicio cerere încă.',
    emptyBody: 'Publică prima cerere și transportatorii verificați o văd imediat pe panou.',
    publish: 'Publică o cerere',
    publishDraft: 'Publică',
    cancel: 'Retrage',
    cancelConfirm: 'Retragi cererea de pe panou? Rămâne în listă și o poți republica oricând.',
    reopen: 'Republică',
    reopenTitle: 'Alege datele noi',
    reopenFrom: 'Poate fi încărcat de la',
    reopenTo: 'Până la (opțional)',
    reopenSubmit: 'Republică cererea',
    view: 'Vezi anunțul',
    /**
     * The way in to the offers a request has received. The count is in
     * the label because „Oferte primite" on a request with none is a
     * click that ends in an empty box.
     */
    offers: (count: number) => (count === 0 ? 'Oferte primite' : `Oferte primite (${count})`),
    confirm: 'Da, continuă',
    back: 'Renunță',
    quotaTitle: 'Ai atins limita planului',
    quotaBody: 'Retrage o cerere activă sau treci la un plan superior ca să publici alta.',
  },

  /**
   * The statuses a client sees.
   *
   * `carrier_selected` became reachable with Faza 2: `accept_offer()`
   * writes it. `offers_received`, `in_progress` and `disputed` are still
   * in the enum with nothing writing them — the count of live offers is
   * derived rather than stored, and no screen starts a transport or
   * opens a dispute yet — but a label costs nothing and a blank badge on
   * somebody's dashboard costs trust.
   */
  status: {
    draft: 'Ciornă',
    active: 'Pe panou',
    offers_received: 'Are oferte',
    carrier_selected: 'Transportator ales',
    in_progress: 'În curs',
    delivered: 'Livrată',
    cancelled: 'Retrasă',
    expired: 'Expirată',
    suspended: 'Suspendată',
    disputed: 'În dispută',
    assigned: 'Transportator ales',
    completed: 'Livrată',
  },

  statusNote: {
    draft: 'Nu este vizibilă pentru transportatori.',
    expired: 'Perioada de încărcare a trecut. Alege date noi ca să revină pe panou.',
    cancelled: 'Ai retras-o. O poți republica cu date noi.',
    suspended: 'A fost scoasă de pe panou până se rezolvă documentele firmei.',
  },
} as const;
