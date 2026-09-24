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
