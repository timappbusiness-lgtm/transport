/**
 * Memento expirări auto — what every screen of it says.
 *
 * The words are chosen against one rule: **a memento is a date somebody
 * wrote down, never a checked document.** So nothing here says „valid" in
 * the platform's sense, „verificat", „conform" or „aprobat"; the states
 * are a reading of the date the person gave, and the screens say whose
 * date it is. Rovinieta has no public API to ask, so nothing claims it is
 * looked up: the person writes the date or photographs the receipt.
 */
export const mementoCopy = {
  name: 'Memento expirări auto',

  /** The public page: three lines of why, then the form. */
  landing: {
    eyebrow: 'Gratuit',
    title: 'Memento expirări auto',
    metaDescription:
      'Scrie o dată când expiră RCA-ul, ITP-ul, rovinieta și celelalte; primești un memento înainte de fiecare. Gratuit, pentru o mașină sau o flotă.',
    benefits: [
      'Scrii o singură dată când expiră RCA-ul, ITP-ul, rovinieta și celelalte.',
      'Primești un memento cu 30 de zile, o săptămână și o zi înainte, și în ziua expirării.',
      'Gratuit, pentru o mașină sau pentru o flotă întreagă.',
    ],
    note: 'Datele le scrii tu. Platforma nu le verifică și nu le arată nimănui.',
    rovinieta: 'Pentru rovinietă nu există o verificare publică automată: scrii data de pe chitanță sau din e-mailul de confirmare.',
    steps: {
      vehicul: 'Mașina',
      documente: 'Datele',
      cont: 'Contul',
    },
    vehicleTitle: 'Ce mașină?',
    datesTitle: 'Când expiră?',
    datesLede: 'Completează ce știi. Restul poți adăuga oricând.',
    next: 'Mai departe',
    back: 'Înapoi',
    accountTitle: 'Ultimul pas: contul',
    accountBody:
      'Ca să-ți trimitem mementourile ai nevoie de un cont: e-mail, parolă și telefon. Ce ai scris rămâne aici până te întorci.',
    signUp: 'Creează contul',
    signIn: 'Am deja cont',
    signedInTitle: 'Gata de salvat',
    signedInBody: 'Mementoul intră în contul tău. Îl găsești oricând la Memento auto.',
    save: 'Salvează mementoul',
    saving: 'Se salvează…',
    summary: (plate: string, count: number) =>
      count === 0 ? `${plate}, fără date încă` : count === 1 ? `${plate}, o dată` : `${plate}, ${count} date`,
    needPlate: 'Scrie numărul de înmatriculare.',
    needDate: 'Scrie cel puțin o dată, sau sari peste acest pas și adaugă-le din cont.',
    skipDates: 'Le adaug mai târziu',
  },

  fields: {
    plate: 'Număr de înmatriculare',
    platePlaceholder: 'B 123 ABC',
    make: 'Marca',
    model: 'Modelul',
    optional: 'opțional',
    vehicleKind: 'Ce fel de vehicul',
    expires: 'Expiră pe',
    reference: 'Serie sau număr poliță',
    note: 'Notă',
    customName: 'Ce document',
    customNamePlaceholder: 'De exemplu: autorizație GPL',
    dueKm: 'Sau la kilometri',
    more: 'Alte documente: trusă medicală, extinctor, revizie, altceva',
  },

  /** The account screens. */
  account: {
    eyebrow: 'Memento',
    title: 'Memento expirări auto',
    ledePersonal:
      'Datele scrise de tine pentru mașinile tale. Îți trimitem un memento înainte să expire fiecare.',
    ledeFirm:
      'Flota firmei și datele scrise de voi. Mementourile merg la persoana responsabilă de fiecare vehicul.',
    declared:
      'Memento: date scrise de voi, neverificate de platformă. Nu țin loc de documentele firmei trimise spre verificare.',
    declaredCarrier: 'Documentele pentru verificarea firmei rămân la Documente; mementoul nu le înlocuiește.',
    viewPersonal: 'Mașinile mele',
    viewFirm: 'Flota firmei',
    responsibleSection: 'Vehicule ale firmei în grija ta',
    add: 'Adaugă un vehicul',
    import: 'Importă din CSV',
    settings: 'Când primești mementourile',
    empty: 'Nicio mașină încă.',
    emptyBody: 'Adaugă prima: numărul, apoi datele. Durează mai puțin de un minut.',
    emptyFiltered: 'Niciun vehicul pentru filtrul ales.',
    filters: { toate: 'Toate', '30': 'Expiră în 30 de zile', expirate: 'Expirate' },
    filterLabel: 'Arată',
    sortLabel: 'Ordine',
    sorts: { urgenta: 'După dată', numar: 'După număr' },
    noDates: 'Fără date încă',
    addDates: 'Adaugă date',
    open: 'Deschide',
    responsible: (name: string) => `Mementouri către ${name}`,
    nextReminder: (day: string) => `Următorul memento: ${day}`,
    kmDue: (km: string) => `la ${km} km`,
    count: (n: number) => (n === 1 ? 'un vehicul' : n % 100 >= 1 && n % 100 <= 19 ? `${n} vehicule` : `${n} de vehicule`),
    states: { valabil: 'Valabil', curand: 'Expiră curând', expirat: 'Expirat' },
  },

  /** „Am reînnoit": one tap, the new date, the old one kept. */
  renew: {
    button: 'Am reînnoit',
    title: 'Data nouă',
    lede: 'Data veche rămâne în istoric.',
    save: 'Salvează data nouă',
    saving: 'Se salvează…',
    cancel: 'Renunță',
    done: (label: string, day: string) => `${label}: data nouă este ${day}.`,
    fromReminder: 'Din mementoul primit: scrie data nouă pentru fiecare document reînnoit.',
    needDate: 'Scrie data nouă.',
  },

  /** One vehicle's page. */
  vehicle: {
    back: 'Memento auto',
    details: 'Vehiculul',
    save: 'Salvează',
    saved: 'Salvat.',
    documents: 'Documente și date',
    addDocument: 'Adaugă un document',
    editDocument: 'Schimbă',
    saveDocument: 'Salvează data',
    deleteDocument: 'Scoate documentul',
    deleteDocumentConfirm: 'Scoți documentul și istoricul lui? Nu se poate anula.',
    history: 'Istoric',
    historyRow: (day: string, renewed: string) => `Valabil până la ${day} · reînnoit pe ${renewed}`,
    historyEmpty: 'Nicio reînnoire încă.',
    responsible: 'Cine primește mementourile',
    responsibleNone: 'Proprietarul și administratorii firmei',
    responsibleHint: 'Persoana aleasă primește mementourile acestui vehicul și poate apăsa „Am reînnoit".',
    saveResponsible: 'Salvează',
    delete: 'Scoate vehiculul din memento',
    deleteConfirm: 'Scoți vehiculul, datele și pozele lui din memento? Nu se poate anula.',
    deleted: (plate: string) => `${plate} a fost scos din memento.`,
    notFound: 'Vehiculul nu există sau nu este al tău.',
  },

  /** The optional photo, and the date read from it. */
  photo: {
    label: 'Poză',
    choose: 'Fotografiază sau alege o poză',
    replace: 'Altă poză',
    hint: 'Citim data din poză; tu o verifici înainte să salvezi.',
    reading: 'Citim data din poză…',
    read: (day: string) => `Din poză: ${day}. Verifică data și apasă „Salvează data".`,
    readNoDate: 'Poza s-a încărcat, dar nu am găsit o dată pe ea. Scrie data de mână.',
    unreadable: 'Nu am putut citi poza. Scrie data de mână.',
    unavailable: 'Citirea automată nu este disponibilă acum. Scrie data de mână.',
    attached: 'Poză atașată',
    view: 'Vezi poza',
  },

  /** The CSV import. */
  import: {
    title: 'Importă flota din CSV',
    lede: 'Un rând pe vehicul: numărul de înmatriculare, apoi datele de expirare.',
    columns:
      'Coloane recunoscute: numar, marca, model, rca, itp, rovinieta, casco, trusa medicala, extinctor, revizie. Datele ca 15.03.2027. Excel salvează cu „;", și asta merge.',
    example: 'Descarcă un fișier exemplu',
    exampleNote: 'Numerele din exemplu sunt inventate.',
    file: 'Alege fișierul CSV',
    paste: 'Sau lipește conținutul aici',
    read: (n: number) => (n === 1 ? 'Am citit un vehicul.' : `Am citit ${n % 100 >= 1 && n % 100 <= 19 ? n : `${n} de`} vehicule.`),
    errorsTitle: 'Corectează rândurile de mai jos și încarcă fișierul din nou. Nu s-a importat nimic.',
    ignored: (cols: string) => `Coloane pe care nu le folosim: ${cols}.`,
    submit: (n: number) => (n === 1 ? 'Importă vehiculul' : `Importă ${n % 100 >= 1 && n % 100 <= 19 ? n : `${n} de`} vehicule`),
    submitting: 'Se importă…',
    done: (added: number, updated: number, dates: number) =>
      `Gata: ${added} adăugate, ${updated} actualizate, ${dates} date salvate.`,
    backToList: 'Înapoi la listă',
    preview: 'Ce intră',
  },

  /** The days before. */
  schedule: {
    title: 'Când primești mementourile',
    lede: 'Zilele dinainte de expirare. Implicit: 30, 7, 1 și în ziua expirării (0).',
    all: 'Toate documentele',
    days: 'Zile înainte',
    daysHint: 'Numere despărțite prin virgulă, de exemplu 30, 7, 1, 0. Gol: fără mementouri pentru acest document.',
    defaultLabel: 'implicit',
    save: 'Salvează',
    saved: 'Salvat.',
    reset: 'Înapoi la implicit',
    invalid: 'Scrie cel mult opt numere între 0 și 365, despărțite prin virgulă.',
    channels: 'Pe ce cale (e-mail, în aplicație, pe telefon) și orele de liniște se aleg la Notificări.',
    channelsLink: 'Setări → Notificări',
    grouped: 'Când mai multe documente expiră aproape unul de altul, primești un singur e-mail pentru toate.',
  },

  /** The one calm line per context. Never a pop-up. */
  conversion: {
    cerere: { text: 'Ai nevoie să muți o mașină?', link: 'Publică o cerere gratuit' },
    transport: { text: 'Faci transport auto?', link: 'Primești cereri de transport pe platformă' },
  },

  /** In the account: the dates close enough to say so on arrival. */
  notice: {
    soon: (n: number) =>
      n === 1 ? 'Memento: un document expiră în următoarele 7 zile.' : `Memento: ${n} documente expiră în următoarele 7 zile.`,
    expired: (n: number) => (n === 1 ? 'Memento: un document a expirat.' : `Memento: ${n} documente au expirat.`),
    open: 'Vezi mementourile',
  },

  /** The link in a reminder e-mail. */
  unsubscribe: {
    title: 'Oprește mementourile pe e-mail',
    body:
      'Nu-ți mai trimitem pe e-mail mementourile de expirare. Datele rămân în cont; în aplicație și pe telefon le primești în continuare, dacă sunt pornite.',
    button: 'Oprește mementourile pe e-mail',
    done: 'Gata. Nu mai primești mementouri pe e-mail. Le poți porni din nou la Setări → Notificări.',
    invalid: 'Linkul nu mai este valabil. Poți opri mementourile din cont, la Setări → Notificări.',
    settings: 'Setări → Notificări',
  },

  /** Staff: the limits, the retention and the default days. */
  admin: {
    title: 'Memento expirări auto',
    lede: 'Limitele pe cont, ritmul permis și cât timp rămân datele expirate.',
    maxIndividual: 'Vehicule pe un cont personal',
    maxCompany: 'Vehicule pe o firmă',
    vehiclesPerHour: 'Vehicule adăugate pe oră',
    importsPerHour: 'Importuri CSV pe oră',
    importMaxRows: 'Rânduri pe un import',
    aiReadsPerDay: 'Citiri automate de poze pe zi (0 = oprit)',
    historyDays: 'Zile păstrate după expirare și în istoric',
    defaultDays: 'Zilele implicite ale mementourilor',
    save: 'Salvează',
    saved: 'Setările mementoului au fost salvate.',
  },
} as const;
