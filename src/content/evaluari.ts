/**
 * „Evaluări" — cuvintele pentru reputație.
 *
 * Un fișier pentru toți cei patru cititori: cineva care dă o notă,
 * cineva care o primește, cineva care caută un transportator, și echipa.
 * Tonul este neutru intenționat. Nicăieri nu scrie „lasă-ne o recenzie" —
 * un text care cere o notă bună nu mai măsoară nimic, iar un profil pe
 * care scrie „4,9" pentru că așa am cerut noi nu ajută pe nimeni să
 * aleagă.
 */
export const ratingsCopy = {
  meta: { title: 'Evaluări' },

  list: {
    title: 'Evaluări',
    lede: 'Ce ai de evaluat, ce ai evaluat și ce s-a spus despre tine.',
    boxes: {
      'de-dat': 'De dat',
      date: 'Date',
      primite: 'Primite',
    } as Record<string, string>,
    empty: {
      'de-dat': 'Nu ai nimic de evaluat.',
      'de-datBody':
        'După ce o comandă se încheie, apare aici, cu termenul până la care o poți evalua.',
      date: 'Nu ai evaluat nimic încă.',
      dateBody: 'Evaluările pe care le dai rămân aici, cu răspunsul firmei dacă vine unul.',
      primite: 'Nicio evaluare primită.',
      primiteBody: 'Clienții îți pot evalua firma după fiecare transport încheiat.',
    } as Record<string, string>,
    openOrder: 'Vezi comanda',
    deadline: (at: string) => `Poți evalua până la ${at}`,
    deadlineLeft: (left: string) => `mai ai ${left}`,
    rate: 'Evaluează',
    badge: (n: number) => (n === 1 ? 'o evaluare de dat' : `${n} evaluări de dat`),
  },

  form: {
    title: 'Cum a mers transportul?',
    titleCarrier: 'Cum a fost clientul?',
    score: 'Nota generală',
    scoreHint: 'Obligatorie. Restul sunt opționale.',
    subScores: 'Pe puncte',
    comment: 'Câteva cuvinte (opțional)',
    commentHint:
      'Ce ar fi util să știe altcineva înainte să lucreze cu firma asta. Numerele de telefon și adresele de e-mail se ascund automat.',
    charsLeft: (n: number) => `${n} caractere rămase`,
    preview: 'Vezi cum arată',
    previewTitle: 'Așa va apărea pe profil',
    back: 'Înapoi la formular',
    submit: 'Trimite evaluarea',
    submitting: 'Se trimite…',
    sent: 'Evaluarea a fost trimisă. Mulțumim.',
    editable: (left: string) => `O mai poți corecta o singură dată, în următoarele ${left}.`,
    notEditable: 'Evaluarea nu se mai poate schimba.',
    edit: 'Corectează evaluarea',
    editTitle: 'Corectează evaluarea',
    editHint: 'O singură dată. După ce salvezi, rămâne așa.',
    editSubmit: 'Salvează corectura',
    edited: 'Corectată',
  },

  reply: {
    title: 'Răspunde public',
    hint: 'Un singur răspuns, și rămâne așa cum îl scrii. Evaluarea la care răspunzi este deja definitivă, așa că și răspunsul este.',
    body: 'Răspunsul tău',
    submit: 'Publică răspunsul',
    submitting: 'Se publică…',
    sent: 'Răspunsul a fost publicat.',
    label: 'Răspunsul firmei',
  },

  report: {
    action: 'Sesizează evaluarea',
    title: 'De ce o sesizezi?',
    hint: 'Ne uităm peste ea. Nu ascundem o evaluare pentru că este mică — doar dacă încalcă regulile.',
    submit: 'Trimite sesizarea',
    sent: 'Am primit sesizarea. Ne uităm peste ea.',
  },

  profile: {
    title: 'Reputație',
    none: 'Firma nu are încă evaluări.',
    tooFew: 'Evaluări insuficiente',
    tooFewHint: (n: number) =>
      n === 1
        ? 'O singură evaluare nu este o medie. Arătăm media de la trei în sus.'
        : `${n} evaluări nu sunt încă o medie. O arătăm de la trei în sus.`,
    ratingsCount: (n: number) =>
      n === 1 ? 'dintr-o evaluare' : n < 20 ? `din ${n} evaluări` : `din ${n} de evaluări`,
    completedCarrier: 'Transporturi duse la capăt',
    completedClient: 'Transporturi comandate',
    punctuality: 'Punctualitate',
    responseRate: 'Rată de răspuns',
    disputes: 'Dispute',
    disputesValue: (opened: number, resolved: number) =>
      opened === 0
        ? 'niciuna în ultimul an'
        : `${opened} deschise, ${resolved} închise, în ultimul an`,
    verifiedSince: 'Verificată din',
    lastChecked: 'Ultima verificare a actelor',
    notEnough: 'Prea puține date',
    latest: 'Ultimele evaluări',
    afterDispute: 'după o dispută',
    more: 'Vezi mai multe',
    page: (n: number) => `Pagina ${n}`,
    previous: 'Înapoi',
    next: 'Mai departe',

    /**
     * Nota „Cum calculăm".
     *
     * Aceleași cuvinte ca în docs/02-data-model.md și aceleași nume de
     * coloane. Trei texte care trebuie să spună același lucru sunt trei
     * șanse să nu-l spună, așa că se scriu o dată și se citează.
     */
    howTitle: 'Cum calculăm',
    how: [
      'Nota este media evaluărilor primite după transporturi încheiate pe platformă. O arătăm de la trei evaluări în sus — sub atât, o medie spune mai mult decât știe.',
      'Punctualitatea este procentul comenzilor în care ridicarea și livrarea s-au făcut până la datele estimate din oferta acceptată, cu o zi toleranță. Se arată de la trei comenzi cu date estimate în sus.',
      'Rata de răspuns este procentul cererilor potrivite din ultimele 90 de zile la care firma a răspuns — cu o ofertă sau cu o întrebare — în primele 24 de ore.',
      'Transporturile duse la capăt sunt comenzile ajunse la starea finalizată. Disputele sunt cele din ultimele douăsprezece luni, deschise și închise.',
      'Nimic de aici nu se completează de mână și nimic nu se poate cumpăra. Evaluările conturilor noastre de test nu intră în niciun calcul, iar o evaluare ascunsă de echipă nu se numără.',
    ],
  },

  admin: {
    eyebrow: 'Administrare',
    title: 'Evaluări',
    lede: 'Toate evaluările platformei. Echipa nu schimbă o evaluare; o ascunde cu motiv, sau o repune.',
    filters: {
      title: 'Filtre',
      score: 'Nota',
      any: 'Oricare',
      company: 'Firma evaluată',
      hidden: 'Doar ascunse',
      afterDispute: 'Doar după dispute',
      apply: 'Filtrează',
          },
    list: {
      total: (n: string) => `${n} evaluări`,
      open: 'Deschide',
      order: 'Comanda',
      evidence: 'Dovezile comenzii',
      reports: (n: number) => (n === 1 ? 'o sesizare' : `${n} sesizări`),
      masked: 'Conținea date de contact, ascunse automat',
      hiddenLabel: 'Ascunsă',
    },
    empty: {
      title: 'Nicio evaluare pentru filtrele astea.',
      body: 'Schimbă nota, firma sau starea.',
    },
    hide: {
      title: 'Ascunde evaluarea',
      lede: 'Rândul rămâne și textul rămâne. Se schimbă doar cine îl vede. Nu ascundem o evaluare pentru că este mică.',
      reason: 'De ce o ascunzi',
      reasonHint: 'Motivul rămâne în jurnal, alături de numele tău.',
      submit: 'Ascunde',
      done: 'Evaluarea a fost ascunsă.',
    },
    unhide: {
      title: 'Repune evaluarea',
      reason: 'De ce o repui',
      submit: 'Repune',
      done: 'Evaluarea a fost repusă.',
    },
    hideReply: {
      action: 'Ascunde răspunsul',
      done: 'Răspunsul a fost ascuns.',
    },
  },

  widget: {
    title: 'Evaluări',
    pending: (n: number) =>
      n === 1 ? 'Ai o comandă de evaluat' : `Ai ${n} comenzi de evaluat`,
    soonest: (at: string) => `cea mai apropiată, până la ${at}`,
    action: 'Vezi evaluările',
  },
} as const;
