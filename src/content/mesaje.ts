/**
 * „Mesaje" — cuvintele pentru inbox și pentru moderare.
 *
 * Tonul este scurt. O căsuță de mesaje este un loc unde oamenii vin să
 * facă ceva, nu să citească; fiecare propoziție de aici fie spune ce se
 * întâmplă, fie explică o regulă care altfel ar părea o defecțiune.
 */
export const messagesCopy = {
  meta: { title: 'Mesaje' },

  list: {
    title: 'Mesaje',
    lede: 'Toate discuțiile tale, într-un singur loc.',
    search: 'Caută după firmă sau oraș',
    searchAction: 'Caută',
    empty: {
      toate: 'Nicio conversație.',
      toateBody:
        'Scrie-i cuiva de pe o cerere sau de pe un traseu, sau așteaptă să îți scrie. Comenzile își deschid singure firul.',
      necitite: 'Nimic necitit.',
      necititeBody: 'Ai citit tot.',
      comenzi: 'Nicio conversație pe o comandă.',
      comenziBody: 'Fiecare comandă vine cu firul ei, de la confirmare.',
      oferte: 'Nicio discuție pe o ofertă.',
      oferteBody: 'Se deschide de pe ofertă, când ai o lămurire de cerut.',
    } as Record<string, string>,
    open: 'Deschide',
    noMessages: 'Fără mesaje încă',
  },

  thread: {
    back: 'Înapoi la mesaje',
    notFound: 'Conversația nu există sau nu îți aparține.',
    context: {
      cerere: 'Vezi cererea',
      traseu: 'Vezi traseul',
      oferta: 'Vezi oferta',
      comanda: 'Vezi comanda',
    } as Record<string, string>,
    linked: 'Discuția de dinainte de comandă',
    /**
     * Linia care explică masca.
     *
     * Apare numai când chiar s-a mascat ceva. Un avertisment permanent
     * despre o regulă care nu s-a aplicat este zgomot, iar oamenii
     * încetează să-l citească exact până în ziua în care contează.
     */
    masked:
      'Numerele de telefon și adresele de e-mail se afișează după confirmarea comenzii. Mesajele scrise înainte rămân așa cum au fost trimise.',
    hidden: 'Mesaj ascuns de echipa platformei.',
    today: 'Azi',
    yesterday: 'Ieri',
  },

  composer: {
    placeholder: 'Scrie un mesaj…',
    hint: 'Enter trimite, Shift+Enter trece pe rând nou.',
    send: 'Trimite',
    sending: 'Se trimite…',
    attach: 'Adaugă imagini',
    attachHint: 'Cel mult 5 imagini, JPG, PNG, WebP sau HEIC, maximum 10 MB fiecare.',
    attachRemove: 'Scoate imaginea',
    offline: 'Pare că nu ai semnal. Mesajul rămâne scris până revine.',
  },

  actions: {
    menu: 'Acțiuni',
    report: 'Sesizează mesajul',
    reportTitle: 'De ce sesizezi mesajul?',
    reportHint: 'Ne uităm peste conversație. O sesizare este singurul motiv pentru care o citim.',
    reportSubmit: 'Trimite sesizarea',
    reportSent: 'Am primit sesizarea. Ne uităm peste ea.',
    block: 'Blochează expeditorul',
    blockTitle: 'Blochezi acest cont?',
    blockHint:
      'Nu mai poate deschide conversații noi cu tine de pe anunțuri. Firele comenzilor în curs rămân deschise — transportul tot trebuie făcut.',
    blockSubmit: 'Blochează',
    blockDone: 'Contul a fost blocat.',
    unblock: 'Deblochează',
    unblockDone: 'Blocarea a fost ridicată.',
  },

  entry: {
    send: 'Trimite mesaj',
    /** Spus înainte de a consuma din cotă, nu după. */
    gate:
      'Deschiderea unei conversații consumă un contact din abonament, o singură dată pe anunț. Dacă ai scris deja aici, nu se mai numără.',
    gateFree: 'Ai deschis deja contactul pentru anunțul acesta. Nu se mai numără.',
    orderTab: 'Mesaje',
  },

  admin: {
    conversations: {
      eyebrow: 'Administrare',
      title: 'Conversații',
      lede: 'Doar conversațiile sesizate și cele de pe o comandă în dispută. Restul rămân între cele două părți — nu le putem deschide, și pagina de confidențialitate spune asta.',
      empty: 'Nicio conversație de verificat.',
      emptyBody: 'Apar aici când cineva sesizează un mesaj sau când o comandă intră în dispută.',
      open: 'Deschide',
      reports: (n: number) => (n === 1 ? 'o sesizare' : `${n} sesizări`),
      disputed: 'Comandă în dispută',
      messages: (n: number) => (n === 1 ? 'un mesaj' : `${n} mesaje`),
      hide: 'Ascunde mesajul',
      hideReason: 'De ce îl ascunzi',
      hideDone: 'Mesajul a fost ascuns.',
    },
    listings: {
      eyebrow: 'Administrare',
      title: 'Anunțuri',
      lede: 'Cererile și traseele de pe platformă. Un anunț ascuns iese de pe panoul public, dar rămâne la proprietar, cu motivul.',
      tabs: { cereri: 'Cereri', trasee: 'Trasee' } as Record<string, string>,
      filters: {
        title: 'Filtre',
        status: 'Stare',
        any: 'Oricare',
        company: 'Firmă',
        hidden: 'Doar ascunse',
        reported: 'Doar sesizate',
        from: 'De la',
        to: 'Până la',
        apply: 'Filtrează',
        clear: 'Vezi toate',
      },
      total: (n: string) => `${n} anunțuri`,
      empty: 'Niciun anunț pentru filtrele astea.',
      emptyBody: 'Schimbă starea, firma sau intervalul.',
      photos: (n: number) => (n === 1 ? 'o fotografie' : `${n} fotografii`),
      reports: (n: number) => (n === 1 ? 'o sesizare' : `${n} sesizări`),
      hiddenLabel: 'Ascuns',
      hide: 'Ascunde de pe panou',
      hideTitle: 'Ascunde anunțul',
      hideHint:
        'Motivul îl vede și proprietarul, în contul lui. Scrie-l ca pentru el, nu ca pentru noi.',
      hideSubmit: 'Ascunde',
      hideDone: 'Anunțul a fost ascuns.',
      restore: 'Repune pe panou',
      restoreTitle: 'Repune anunțul',
      restoreSubmit: 'Repune',
      restoreDone: 'Anunțul a fost repus.',
      suspendCompany: 'Vezi firma',
      openListing: 'Vezi anunțul',
    },
    export: {
      title: 'Export sesizări și moderare',
      hint: 'CSV cu sesizările și deciziile de moderare dintr-un interval.',
      from: 'De la',
      to: 'Până la',
      submit: 'Descarcă CSV',
    },
  },

  /** Ce vede proprietarul unui anunț ascuns, în contul lui. */
  owner: {
    hidden: 'Scos de pe panou de echipa platformei',
    hiddenReason: 'Motivul:',
    hiddenWhat:
      'Anunțul nu mai apare pe panoul public. Corectează ce este de corectat și scrie-ne — îl punem la loc.',
  },
} as const;
