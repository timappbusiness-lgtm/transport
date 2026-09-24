/**
 * A carrier's and a forwarder's way in, in Romanian: the firm, the
 * vehicles, the documents — each asked when it pays off.
 *
 * Two rules from `onboarding.ts` hold here too: say what happens next in
 * the words somebody uses on the telephone, and never promise what
 * nothing measures. „Durează aproximativ" is about the typing and the
 * photographs, which docs/17-viteza-inscriere.md measured; how long our
 * check takes is not promised anywhere.
 */

export const inscriereCopy = {
  /** The banner above the boards, before the firm can work. */
  board: {
    title: 'Poți vedea toate cererile',
    body: (minutes: number) =>
      `Poți trimite oferte după ce îți verificăm actele. Durează aproximativ ${minutes} ${minutes === 1 ? 'minut' : 'minute'} să le încarci.`,
    addCompany: 'Adaugă firma',
    addVehicle: 'Adaugă vehiculele',
    documents: 'Încarcă actele',
    submit: 'Trimite la verificare',
    inReviewTitle: 'Actele sunt la verificat',
    inReviewBody: 'Poți vedea toate cererile. Îți scriem pe e-mail când firma este verificată.',
  },

  /** Right after sign-up, before the e-mail link has been opened. */
  confirmEmail: {
    title: 'Ți-am trimis un link de confirmare',
    body: (email: string) =>
      `Deschide e-mailul trimis la ${email} și apasă pe link — pe acest dispozitiv, ca să rămâi pe pagina asta. Până atunci, uită-te prin cereri.`,
    resend: 'Nu a venit? Trimite din nou',
  },

  /** Step 3: the firm. */
  company: {
    eyebrow: 'Firma',
    title: 'Datele firmei',
    lede: 'Scrie CUI-ul: restul îl luăm de la ANAF. Durează în jur de două minute.',
    cuiLabel: 'CUI',
    cuiHint: 'Cu sau fără RO. Căutăm singuri la ANAF, nu trebuie să apeși nimic.',
    looking: 'Caut la ANAF…',
    found: (name: string) => `Găsită la ANAF: ${name}`,
    fromAnaf: 'Date preluate de la ANAF',
    fromAnafNote: 'Le poți corecta oricând. Păstrăm și ce a răspuns ANAF, ca să le comparăm la verificare.',
    typo: 'Cifra de control nu se potrivește. Verifică CUI-ul — o cifră greșită e cea mai des întâlnită problemă.',
    notFound:
      'Nu am găsit acest CUI la ANAF. Verifică cifrele sau completează datele de mână; le verificăm noi la aprobare.',
    unavailable:
      'ANAF nu răspunde acum, așa că nu am putut completa datele singuri. Completează-le de mână; le verificăm noi la aprobare.',
    retry: 'Caută din nou la ANAF',
    inactive:
      'ANAF arată firma ca inactivă. O firmă inactivă nu poate fi verificată, deci nu vei putea trimite oferte cu ea până nu se schimbă situația la ANAF. Dacă e o eroare, scrie-ne.',
    struckOff:
      'ANAF arată firma ca radiată. O firmă radiată nu poate fi verificată, deci nu vei putea trimite oferte cu ea. Dacă e o eroare, scrie-ne.',
    regCom: 'Nr. Reg. Com.',
    vat: 'TVA',
    vatPayer: 'plătitor de TVA',
    vatNonPayer: 'neplătitor de TVA',
    seat: 'Sediu',
    legalName: 'Denumire',
    type: 'Ce face firma',
    county: 'Județ',
    city: 'Localitate',
    contact: 'Pe unde te caută clienții',
    contactHint: 'Le-am luat din contul tău. Schimbă-le dacă firma are alt număr.',
    phone: 'Telefon',
    email: 'E-mail',
    save: 'Salvează firma',
    optional: '(opțional)',
  },

  /** Step 4: the vehicles, without their documents. */
  vehicles: {
    eyebrow: 'Vehiculele',
    title: 'Ce vehicule ai',
    lede: 'Numărul, tipul și câte mașini încap. Actele vehiculelor le ceri tu când ai nevoie de ele.',
    plate: 'Număr de înmatriculare',
    type: 'Tip',
    slots: 'Câte mașini încap',
    slotsHint: 'Pentru o platformă auto. Îl completăm singuri pe traseele tale.',
    more: 'Mai multe detalii (opțional)',
    add: 'Adaugă vehiculul',
    addAnother: 'Adaugă încă un vehicul',
    added: (plate: string) => `${plate} a fost adăugat.`,
    done: 'Gata, mergi mai departe',
    later: 'Adaug vehiculele mai târziu',
    documentsFor: 'Actele vehiculului',
  },

  /** The one screen for every document, phone first. */
  documents: {
    eyebrow: 'Actele',
    titleCompany: 'Actele firmei',
    titleVehicle: (plate: string) => `Actele vehiculului ${plate}`,
    lede: 'Fă o poză la fiecare act sau alege-le pe toate din galerie — recunoaștem noi ce e fiecare. Tu doar confirmi data. Le verificăm, apoi poți lucra.',
    gallery: 'Alege din galerie, mai multe deodată',
    galleryHint: 'Poze sau PDF-uri. Recunoaștem singuri ce act e fiecare; tu confirmi.',
    camera: 'Fotografiază',
    replace: 'Încarcă altul',
    orFile: 'sau alege un fișier',
    companySection: 'Firma',
    vehicleSection: (plate: string) => `Vehiculul ${plate}`,
    blocking: 'Obligatoriu',
    optional: 'Poate aștepta',
    optionalNote: 'Actele care pot aștepta nu opresc verificarea. Le poți adăuga oricând.',
    example: 'Exemplu',
    states: {
      missing: 'Lipsește',
      in_review: 'Încărcat — îl verificăm',
      ok: 'Valabil',
      rejected: 'Respins',
      expired: 'Expirat',
    },
    rejectedBecause: (reason: string) => `Motivul: ${reason}`,
    reading: 'Citim actul…',
    read: (date: string) => `Am citit: valabil până la ${date}.`,
    readNothing: 'Nu am putut citi data de pe act. Scrie-o tu.',
    unreadable: 'Poza e într-un format pe care nu îl putem citi automat. Scrie data tu; o verificăm noi.',
    dateLabel: 'Valabil până la',
    confirmDate: 'Confirmă data',
    confirmed: (date: string) => `Data confirmată: ${date}.`,
    mismatch: 'Nu seamănă cu actul de pe acest rând. Verifică dacă ai fotografiat actul potrivit.',
    classifying: 'Recunoaștem actul…',
    assignTitle: 'Din galerie: confirmă ce e fiecare',
    assignKind: 'Ce act este',
    assignVehicle: 'Pentru vehiculul',
    chooseKind: 'Alege actul',
    chooseVehicle: 'Alege vehiculul',
    recognised: 'recunoscut automat',
    notRecognised: 'Nu am recunoscut actul. Alege tu ce este.',
    confirm: 'Confirmă',
    progress: (done: number, total: number) => `${done} din ${total} încărcate`,
    allBlocking: 'Ai încărcat toate actele obligatorii.',
    stillMissing: (labels: string) => `Mai lipsesc: ${labels}.`,
    addVehicle: 'Adaugă încă un vehicul',
    otherVehicles: 'Actele celorlalte vehicule',
    backToFleet: 'Înapoi la flotă',
    back: 'Înapoi de unde ai plecat',
    waitingFiles: (n: number) =>
      n === 1 ? 'Un act ales data trecută n-a apucat să ajungă. Îl trimitem acum.' : `${n} acte alese data trecută n-au apucat să ajungă. Le trimitem acum.`,
    retry: 'Încearcă din nou',
    discard: 'Renunță',
    history: 'Istoricul actelor',
    tooLarge: 'Încarcă un PDF sau o fotografie de cel mult 10 MB.',
    wrongType: 'Încarcă un PDF sau o fotografie (JPG, PNG, WebP, HEIC).',
  },

  /** Why each document is asked for, in one line. Regulatory names stay Romanian. */
  reasons: {
    licenta_comunitara: 'Arată că firma are voie să transporte mărfuri contra cost, și în afara țării.',
    certificat_casa_expeditii: 'Arată că firma are voie să organizeze transporturi pentru alții.',
    certificat_inregistrare_onrc: 'Arată că firma există și cine o conduce. Nu expiră: îl încarci o singură dată.',
    asigurare_cmr: 'Acoperă mașina clientului dacă pățește ceva pe drum — primul lucru pe care îl întreabă un client.',
    asigurare_raspundere_expeditor: 'Acoperă greșelile de organizare ale casei de expediții.',
    copie_conforma:
      'Copia conformă a licenței, câte una pe vehicul — o cere poliția la control. Autoutilitarele sub 3,5 t nu au nevoie de ea.',
    itp: 'Arată că vehiculul a trecut inspecția tehnică și poate circula.',
    rca: 'Asigurarea obligatorie a vehiculului. Fără ea, vehiculul nu are voie pe drum.',
    carte_verde: 'RCA-ul recunoscut în afara țării. Contează doar dacă ieși din România.',
    autorizatie_adr: 'Pentru mărfuri periculoase. Doar dacă transporți așa ceva.',
    fallback: 'Îl cerem ca să putem verifica firma.',
  } as Record<string, string>,

  /** Why the platform stopped here, on the documents screen. One line each. */
  because: {
    oferta: 'Ca să trimiți oferta, avem nevoie de actele de mai jos. Le verificăm noi, apoi oferi.',
    traseu: 'Ca să publici traseul, avem nevoie de actele de mai jos. Le verificăm noi, apoi publici.',
    contact: 'Ca să vezi datele de contact, avem nevoie de actele de mai jos. Le verificăm noi, apoi le vezi.',
  },

  /** At the three places a firm that cannot work yet is stopped. */
  gate: {
    oferta: {
      title: 'Poți oferta după ce îți verificăm actele',
      in_review: 'Actele tale sunt la verificat. Poți oferta imediat ce le aprobăm — îți scriem pe e-mail.',
    },
    traseu: {
      title: 'Poți publica trasee după ce îți verificăm actele',
      in_review: 'Actele tale sunt la verificat. Poți publica imediat ce le aprobăm — îți scriem pe e-mail.',
    },
    contact: {
      title: 'Vezi contactul după ce îți verificăm actele',
      in_review: 'Actele tale sunt la verificat. Vezi contactele imediat ce le aprobăm — îți scriem pe e-mail.',
    },
    steps: {
      no_company: 'Mai întâi firma: CUI-ul și restul îl completăm de la ANAF.',
      no_vehicle: 'Mai întâi vehiculele: numărul și tipul.',
      documents: (minutes: number) =>
        `Încarcă actele — durează aproximativ ${minutes} ${minutes === 1 ? 'minut' : 'minute'}.`,
      ready_to_submit: 'Actele sunt încărcate. Mai rămâne să le trimiți la verificare.',
      rejected: 'Mai e ceva de corectat în acte. Îți spunem exact ce, pe ecranul actelor.',
      suspended: 'Firma este suspendată până actualizezi actele expirate.',
    },
    action: {
      no_company: 'Adaugă firma',
      no_vehicle: 'Adaugă vehiculele',
      documents: 'Încarcă actele',
      ready_to_submit: 'Trimite la verificare',
      rejected: 'Vezi ce e de corectat',
      suspended: 'Actualizează actele',
    },
  },
} as const;
