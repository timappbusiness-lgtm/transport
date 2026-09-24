/**
 * „Transporturi" — the words for an order in flight.
 *
 * One file for all four readers, because a client, a dispatcher, a
 * driver and a staff member look at one thing and a second file is how
 * they start describing it differently.
 *
 * The tone is flatter than elsewhere on purpose. Everything here is a
 * step, a deadline or a piece of evidence, and all three read as more
 * serious without decoration — especially on a phone at a loading bay.
 */
export const ordersCopy = {
  /** «Publică returul», de pe pagina comenzii. */
  returnLeg: {
    title: 'Te întorci gol?',
    lede: 'Pregătim un traseu pe retur din localitatea de livrare, cu același vehicul și cu o dată după livrare. Verifici și publici tu.',
    action: 'Publică returul',
    /** Când comanda nu are încă un vehicul repartizat. */
    noVehicle: 'Repartizează întâi un vehicul, ca returul să plece cu el.',
  },

  meta: { title: 'Transporturi' },

  list: {
    title: 'Transporturi',
    lede: 'Comenzile la care ești parte, cu pasul la care a ajuns fiecare.',
    needsMe: 'Necesită acțiunea ta',
    empty: {
      active: 'Nicio comandă în lucru.',
      activeBody:
        'O comandă apare aici după ce o ofertă este acceptată sau o rezervare este confirmată.',
      finalizate: 'Nicio comandă finalizată încă.',
      finalizateBody: 'Aici rămân comenzile duse până la capăt, cu fotografiile și fișele lor.',
      anulate: 'Nicio comandă anulată și nicio dispută.',
      anulateBody: 'Sperăm să rămână așa.',
    },
    filterAll: 'Toate',
    filterNeedsMe: 'Doar ce așteaptă de la mine',
    open: 'Deschide comanda',
    flagged: 'Vehiculul nu mai are actele în termen',
  },

  detail: {
    title: 'Comanda',
    back: 'Înapoi la transporturi',
    notFound: 'Comanda nu există sau nu îți aparține.',
    summary: 'Ce s-a stabilit',
    route: 'Traseu',
    price: 'Preț convenit',
    paymentTerm: 'Termen de plată',
    paymentTermValue: (days: number) =>
      days === 1 ? 'o zi' : days >= 20 ? `${days} de zile` : `${days} zile`,
    agreedOn: 'Confirmată',
    request: 'Cererea',
    offer: 'Oferta acceptată',
    crew: 'Șofer și vehicul',
    noCrew: 'Nealocat',
    assign: 'Alege șoferul și vehiculul',
    reassign: 'Schimbă șoferul sau vehiculul',
    driver: 'Șofer',
    vehicle: 'Vehicul',
    pickupWindow: 'Ridicare',
    deliveryWindow: 'Livrare',
    parties: 'Părțile',
    client: 'Client',
    carrier: 'Transportator',
    profile: 'Vezi profilul firmei',
  },

  timeline: {
    title: 'Unde a ajuns',
    waiting: 'Urmează',
    aside: 'Alte evenimente',
    autoCompleted: 'Închisă automat, fără răspuns de la client.',
  },

  actions: {
    schedulePickup: 'Programează ridicarea',
    scheduleDelivery: 'Programează livrarea',
    from: 'De la',
    to: 'Până la (opțional)',
    windowHint: 'Clientul primește un e-mail cu intervalul ales.',
    save: 'Salvează',
    saving: 'Se salvează…',
    cancel: 'Renunță',
    /** Said to whoever cannot press the button, so the screen is never mute. */
    waitingOn: (who: string) => who,
    blocked: 'Nu poți face pasul acesta',
    missing: (gaps: string[]) => `Mai ai nevoie de: ${gaps.join(', ')}.`,
  },

  evidence: {
    title: 'Dovezi',
    lede: 'Fotografiile și fișele rămân neschimbate. Nimeni nu le poate modifica sau șterge, nici noi.',
    empty: 'Nicio dovadă încă.',
    kinds: {
      pickup_photo: 'Fotografii la ridicare',
      condition_report: 'Fișa de stare',
      transport_document: 'Documente de transport',
      delivery_photo: 'Fotografii la livrare',
      recipient_confirmation: 'Confirmarea primirii',
      incident_note: 'Incidente',
    } as Record<string, string>,
    hidden: 'Ascunsă de echipa platformei.',
    hide: 'Ascunde dovada',
    hideReason: 'De ce o ascunzi',
    hideReasonHint: 'Motivul rămâne în jurnal, alături de numele tău. Fișierul nu se șterge.',
    hideSubmit: 'Ascunde',
    hidden_ok: 'Dovada a fost ascunsă.',
    at: 'Făcută',
    by: 'de',
    location: 'Locație atașată',
    addIncident: 'Adaugă un incident',
    incidentNote: 'Ce s-a întâmplat',
    incidentSend: 'Salvează incidentul',
    incidentSaved: 'Incidentul a fost salvat.',
    compareTitle: 'Comparație',
    comparePickup: 'La ridicare, față de fotografiile clientului',
    compareDelivery: 'La livrare, față de cele de la ridicare',
    fromClient: 'De la client, la publicarea cererii',
    noComparison: 'Nu există încă fotografii de comparat.',
  },

  capture: {
    title: 'Fotografii',
    /** The four shots, prompted in the order somebody walks round a car. */
    prompts: ['Fața', 'Spatele', 'Lateral stânga', 'Lateral dreapta'],
    promptHint: (n: number, total: number) => `Fotografia ${n} din ${total}`,
    add: 'Adaugă fotografie',
    retake: 'Refă fotografia',
    uploading: 'Se încarcă…',
    uploaded: 'Încărcată',
    failed: 'Nu s-a încărcat. Fotografia a rămas pe telefon — trimite-o din nou când ai semnal.',
    retry: 'Trimite din nou',
    waiting: (count: number) =>
      count === 1
        ? 'O fotografie făcută mai devreme n-a apucat să plece. E păstrată pe telefon.'
        : `${count} fotografii făcute mai devreme n-au apucat să plece. Sunt păstrate pe telefon.`,
    sendWaiting: 'Trimite-le acum',
    discardWaiting: 'Renunță la ele',
    offline: 'Pare că nu ai semnal. Fotografiile rămân aici până revine.',
    location: 'Atașează locația la aceste fotografii',
    locationHint: 'Opțional. Se cere o singură dată și se salvează doar la fotografiile astea.',
    locationDenied: 'Locația nu a fost permisă. Fotografiile se încarcă oricum.',
  },

  checklist: {
    title: 'Fișa de stare a vehiculului',
    lede: 'Se completează o singură dată, la ridicare. Rămâne neschimbată.',
    states: { 'fără': 'Fără', 'ușoare': 'Ușoare', vizibile: 'Vizibile' } as Record<string, string>,
    yes: 'Da',
    no: 'Nu',
    note: 'Observații',
    noteHint: 'Opțional. Orice nu încape în rândurile de mai sus.',
    save: 'Salvează fișa',
    saved: 'Fișa a fost salvată.',
  },

  handover: {
    title: 'Codul de confirmare',
    clientHint: 'Dă acest cod șoferului la predare.',
    driverTitle: 'Codul de la client',
    driverHint: 'Cere-i clientului codul din pagina comenzii, sau semnătura persoanei care primește.',
    recipient: 'Cine primește vehiculul',
    recipientHint: 'Numele persoanei care semnează sau dă codul.',
    codeLabel: 'Cod (6 cifre)',
    signature: 'Semnătură',
    signatureHint: 'Semnează cu degetul. Se salvează ca imagine, alături de nume.',
    signatureClear: 'Șterge semnătura',
    signatureDone: 'Semnătura a fost salvată.',
    orCode: 'sau cere codul',
    orSignature: 'sau cere semnătura',
    deliver: 'Confirm livrarea vehiculului',
  },

  confirm: {
    title: 'Confirmi livrarea?',
    body: 'Uită-te întâi peste fotografiile de la livrare și peste confirmarea primirii.',
    deadline: (left: string) => `Dacă nu spui nimic, comanda se închide singură peste ${left}.`,
    passed: 'Termenul de confirmare a trecut. Comanda se va închide la următoarea verificare.',
    submit: 'Da, am primit vehiculul',
    done: 'Ai confirmat livrarea. Comanda este închisă.',
    disputeInstead: 'Ceva nu este în regulă',
  },

  cancel: {
    title: 'Anulezi comanda?',
    body: 'Cealaltă parte primește un e-mail cu motivul pe care îl scrii.',
    reason: 'De ce anulezi',
    relist: 'Pune cererea înapoi pe panou',
    relistHint: 'Dacă intervalul de încărcare nu a trecut. Altfel cererea rămâne expirată.',
    submit: 'Anulează comanda',
    submitting: 'Se anulează…',
    done: 'Comanda a fost anulată.',
    afterPickup: 'Vehiculul este deja ridicat, așa că nu mai poate fi anulată din cont. Scrie-ne și rezolvăm împreună.',
  },

  dispute: {
    title: 'Deschide o dispută',
    lede: 'Comanda se blochează până când ne uităm peste ea. Ambele părți primesc un e-mail.',
    category: 'Ce s-a întâmplat',
    reason: 'Descrie pe scurt',
    reasonHint: 'Cu cât scrii mai exact, cu atât mai repede o rezolvăm.',
    photos: 'Adaugă fotografii (opțional)',
    submit: 'Deschide disputa',
    submitting: 'Se deschide…',
    done: 'Disputa a fost deschisă. Ne uităm peste ea și revenim.',
    openTitle: 'Comandă în dispută',
    openedAt: 'Deschisă',
    resolvedAt: 'Închisă',
    decision: 'Decizia echipei',
    noMoney: 'Nu decidem despre bani: platforma nu încasează și nu ține plăți.',
  },

  driver: {
    title: 'Transporturile mele',
    today: 'Astăzi',
    upcoming: 'Urmează',
    none: 'Niciun transport alocat.',
    noneBody: 'Când dispecerul te alocă pe o comandă, apare aici.',
    openOrder: 'Deschide',
    step: 'Pasul următor',
  },

  /** The staff screen, which reads and decides disputes. */
  admin: {
    eyebrow: 'Administrare',
    title: 'Transporturi',
    lede: 'Toate comenzile platformei. Echipa nu schimbă un transport; deschide și închide dispute, anulează cu motiv și ascunde o dovadă cu motiv.',
    filters: {
      title: 'Filtre',
      status: 'Stare',
      any: 'Oricare',
      company: 'Transportator',
      disputed: 'Doar disputele',
      from: 'De la',
      to: 'Până la',
      apply: 'Filtrează',
      clear: 'Vezi toate',
    },
    list: {
      total: (n: string) => `${n} comenzi`,
      page: (page: number, last: number) => `Pagina ${page} din ${last}`,
      previous: 'Pagina anterioară',
      next: 'Pagina următoare',
      open: 'Deschide',
      evidence: (n: number) => (n === 1 ? 'o dovadă' : `${n} dovezi`),
      noEvidence: 'fără dovezi',
    },
    empty: {
      title: 'Nicio comandă pentru filtrele astea.',
      body: 'Schimbă starea, transportatorul sau intervalul de date.',
    },
    resolve: {
      title: 'Închide disputa',
      lede: 'Uită-te peste fotografiile de la ridicare și de la livrare, și peste istoricul comenzii.',
      outcome: 'Cum se închide',
      completed: 'Finalizată',
      cancelled: 'Anulată',
      note: 'Decizia, pe scurt',
      noteHint: 'O văd ambele părți în e-mail și în pagina comenzii. Rămâne în jurnal.',
      submit: 'Închide disputa',
      done: 'Disputa a fost închisă.',
    },
  },
} as const;
