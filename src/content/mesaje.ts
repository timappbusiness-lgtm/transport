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
    attachHint:
      'Cel mult 5 imagini, JPG, PNG, WebP sau HEIC, maximum 10 MB fiecare. Scrie și câteva cuvinte alături de ele.',
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
      'Nu mai poate deschide conversații noi cu tine de pe cererile sau traseele tale. Firele comenzilor în curs rămân deschise — transportul tot trebuie făcut.',
    blockSubmit: 'Blochează',
    blockDone: 'Contul a fost blocat.',
    unblock: 'Deblochează',
    unblockDone: 'Blocarea a fost ridicată.',
  },

  entry: {
    send: 'Trimite mesaj',
    /** Spus înainte de a consuma din cotă, nu după. */
    gate:
      'Deschiderea unei conversații consumă un contact din abonament, o singură dată pe cerere sau traseu. Dacă ai scris deja aici, nu se mai numără.',
    gateFree: 'Ai deschis deja contactul aici. Nu se mai numără.',
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
      // Never „anunțuri": what clients publish is a „cerere de transport",
      // what carriers publish a „traseu", and one word for both is the
      // confusion the public side was built to avoid.
      title: 'Cereri și trasee',
      lede: 'Cererile de transport și traseele de pe platformă. Ce ascunzi iese de pe panoul public, dar rămâne la proprietar, cu motivul.',
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
      total: (n: string) => `${n} rezultate`,
      empty: 'Nimic pentru filtrele astea.',
      emptyBody: 'Schimbă starea, firma sau intervalul.',
      photos: (n: number) => (n === 1 ? 'o fotografie' : `${n} fotografii`),
      reports: (n: number) => (n === 1 ? 'o sesizare' : `${n} sesizări`),
      hiddenLabel: 'Ascuns',
      hide: 'Ascunde de pe panou',
      hideTitle: 'Scoate de pe panou',
      hideHint:
        'Motivul îl vede și proprietarul, în contul lui. Scrie-l ca pentru el, nu ca pentru noi.',
      hideSubmit: 'Ascunde',
      hideDone: 'Gata: nu mai apare pe panoul public.',
      restore: 'Repune pe panou',
      restoreTitle: 'Repune pe panou',
      restoreSubmit: 'Repune',
      restoreDone: 'Gata: apare din nou pe panoul public.',
      suspendCompany: 'Vezi firma',
      openListing: 'Vezi pe panou',
    },
    export: {
      title: 'Export sesizări și moderare',
      hint: 'CSV cu sesizările și deciziile de moderare dintr-un interval.',
      from: 'De la',
      to: 'Până la',
      submit: 'Descarcă CSV',
    },
  },

  /** What the owner of a hidden request or route sees in their account. */
  owner: {
    hidden: 'Scos de pe panou de echipa platformei',
    hiddenReason: 'Motivul:',
    hiddenWhat:
      'Nu mai apare pe panoul public până nu corectezi ce este de corectat. Scrie-ne după aceea și ne uităm din nou.',
  },
} as const;
