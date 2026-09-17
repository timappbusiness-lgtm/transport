/**
 * Romanian copy for the trust section and for /verificare.
 *
 * One rule governs this file, and a test enforces it: every sentence here
 * describes something the database or the product actually does. Where a
 * rule is not implemented, the sentence is absent rather than softened —
 * see the note on `items` below for the two places that cost us a claim.
 *
 * No figure is written here either. The number of verified carriers comes
 * from `verified_carriers_count()`, the document rules from
 * `v_document_requirements_public`, and the reminder schedule from the
 * requirement rows themselves.
 */

export const trustCopy = {
  /** The band that sits under the activity section. */
  cta: {
    strong: 'Cauți transportator?',
    soft: 'Publică cererea gratuit.',
    /** Shown only above the threshold the team sets. */
    count: (companies: string) => `${companies} de transport cu documente verificate`,
    primary: 'Publică o cerere',
    secondary: 'Cum verificăm firmele',
  },

  section: {
    eyebrow: 'Siguranță',
    strong: 'Transportatori cu acte valabile.',
    soft: 'Verificate la înscriere și urmărite în fiecare zi.',

    /**
     * Six, numbered. Two things a competitor would put here are missing on
     * purpose:
     *
     * - Ratings. `ratings` exists and the database already refuses a rating
     *   before delivery, but nothing in the product lets a client leave one
     *   yet. A promise nobody can act on is the kind of copy people find
     *   out about later, so item 06 is the one that is true today.
     * - Masking phone numbers inside messages. Nothing does that; what is
     *   enforced is that contact details are behind `reveal_contact`, which
     *   spends a contact from the carrier's plan and logs every opening.
     *   Item 04 says that instead.
     */
    items: [
      {
        title: 'Documente aprobate de un om',
        body:
          'Licența de transport, asigurarea CMR, RCA-ul, ITP-ul și copia conformă ARR sunt citite automat și verificate de echipa noastră. Până la aprobare, firma nu poate trimite oferte.',
      },
      {
        title: 'Expirări urmărite zilnic',
        body:
          'Documentele cu termen au data de valabilitate urmărită în fiecare zi. Transportatorul primește atenționări cu 30, 14, 7 și o zi înainte.',
      },
      {
        title: 'Blocare automată la expirare',
        body:
          'Dacă expiră RCA-ul sau ITP-ul unei platforme, aceasta iese de pe bursă. Dacă expiră licența firmei, firma nu mai poate trimite oferte până la reînnoire.',
      },
      {
        title: 'Contactul tău rămâne ascuns',
        body:
          'Transportatorii văd traseul și vehiculul, nu numărul tău de telefon. Datele de contact se deschid doar la cererea unui transportator, din alocarea planului lui, iar fiecare deschidere rămâne înregistrată.',
      },
      {
        title: 'Pe sens costă mai puțin',
        body:
          'Un transportator care are deja drum pe ruta ta îți poate oferi un loc liber pe platformă, la un preț mai bun.',
      },
      {
        title: 'Totul rămâne în platformă',
        body:
          'Cererea, ofertele și mesajele rămân în contul tău, cu istoric complet.',
      },
    ],

    /** A made-up company, labelled as such, showing the shape of the data. */
    example: {
      title: 'Documentele firmei',
      company: 'Transport Exemplu SRL',
      rows: [
        { label: 'Licență comunitară', value: 'valabilă până la 21.10.2027', state: 'Valid', tone: 'success' as const },
        { label: 'Asigurare CMR', value: 'valabilă până la 14.06.2027', state: 'Valid', tone: 'success' as const },
        { label: 'Platformă TM 00 EXP · RCA', value: 'expiră în 12 zile', state: 'Expiră curând', tone: 'warning' as const },
        { label: 'Platformă TM 00 EXP · ITP', value: 'valabil până la 03.03.2027', state: 'Valid', tone: 'success' as const },
      ],
      footer: 'Ultima verificare: 16.09.2026',
      link: 'Vezi cum verificăm firmele',
    },
  },
} as const;

export const verificationCopy = {
  meta: {
    title: 'Cum verificăm firmele de transport',
    description:
      'Ce documente cerem transportatorilor, cine le aprobă, ce se întâmplă când expiră unul și ce nu putem verifica automat.',
  },

  hero: {
    eyebrow: 'Verificare',
    strong: 'Cum verificăm',
    soft: 'firmele de transport.',
    lede:
      'Pe Coridor pot trimite oferte doar firmele cu documentele aprobate și în termen de valabilitate. Mai jos explicăm exact ce verificăm și ce nu.',
  },

  steps: {
    title: 'Pașii, de la înscriere la ofertă',
    items: [
      {
        title: 'Înscriere cu CUI',
        body: 'Datele firmei se preiau de la ANAF, pe baza codului fiscal. O firmă inactivă sau radiată se vede din acest pas.',
      },
      {
        title: 'Încărcare documente',
        body: 'Firma încarcă documentele ei și pe cele ale fiecărei platforme din flotă. Fiecare document primește o dată de valabilitate.',
      },
      {
        title: 'Verificare de către echipă',
        body: 'Documentele sunt citite automat, apoi un om le confirmă sau le respinge cu motiv. Până atunci firma nu poate trimite oferte.',
      },
      {
        title: 'Urmărire zilnică',
        body: 'Datele de expirare sunt verificate în fiecare zi, iar transportatorul primește atenționări înainte de termen.',
      },
      {
        title: 'Blocare și reactivare',
        body: 'La expirare, firma sau vehiculul iese de pe bursă. Revine după ce documentul nou este încărcat și aprobat.',
      },
    ],
  },

  documents: {
    title: 'Ce documente cerem',
    lede: 'Lista vine din regulile aplicate de platformă, nu dintr-un text scris separat.',
    columns: { document: 'Document', scope: 'Pentru cine', expiry: 'La expirare' },
    scopeCompany: 'Firmă',
    scopeVehicle: 'Vehicul',
    onlyTransport: 'firme de transport',
    onlyForwarder: 'case de expediții',
    except: (vehicles: string) => `Nu se cere pentru: ${vehicles.toLowerCase()}.`,
    noExpiry: 'Nu are termen de valabilitate.',
    blocksCompany: 'Firma nu mai poate trimite oferte.',
    blocksCompanyGrace: (days: string) => `Firma nu mai poate trimite oferte, după ${days} de la expirare.`,
    blocksVehicle: 'Vehiculul iese de pe bursă. Restul flotei rămâne activ.',
    optional: 'Nu blochează contul. Se cere doar pentru anumite transporturi.',
    reminders: (days: string) => `Atenționări cu ${days} înainte.`,
  },

  scope: {
    title: 'Ce verificăm și ce nu',
    weDo: {
      title: 'Verificăm',
      items: [
        'Existența firmei la ANAF și starea ei, pe baza codului fiscal.',
        'Documentele încărcate: sunt citite și confirmate de un om.',
        'Datele de valabilitate, urmărite zilnic după aprobare.',
        'Concordanța dintre document și firma sau vehiculul la care este atașat.',
      ],
    },
    weDont: {
      title: 'Nu verificăm automat',
      items: [
        'Baza de date a asigurătorilor, pentru că nu oferă o interogare automată publică.',
        'Registrele RAR și ARR, din același motiv.',
      ],
      note:
        'Echipa poate verifica manual în portalurile oficiale atunci când este cazul, de exemplu dacă un document pare modificat.',
    },
    caveat:
      'Verificarea reduce riscul, dar nu înlocuiește atenția ta. Verifică datele din comandă înainte de predarea vehiculului.',
  },

  report: {
    title: 'Ce faci dacă observi o problemă',
    body:
      'Dacă un document pare modificat, dacă cineva îți cere plata în afara platformei sau dacă ceva nu se potrivește, spune-ne. Citim fiecare sesizare.',
    button: 'Raportează firma',
    signedOutNote: 'Poți scrie și direct pe e-mail, fără cont.',
    form: {
      reason: 'Ce s-a întâmplat',
      reasonPlaceholder: 'Alege motivul',
      reasons: [
        'Document care pare modificat',
        'Cerere de plată în afara platformei',
        'Firma nu răspunde după acceptarea ofertei',
        'Altceva',
      ],
      company: 'Firma sau anunțul la care te referi',
      companyHint: 'Numele firmei, CUI-ul sau linkul anunțului, dacă îl ai.',
      details: 'Detalii',
      detailsHint: 'Ce s-a întâmplat, pe scurt. Nu trimite documente aici.',
      submit: 'Trimite sesizarea',
      sent: 'Am primit sesizarea. Revenim pe e-mail dacă avem nevoie de detalii.',
      missingReason: 'Alege un motiv.',
      missingDetails: 'Scrie câteva cuvinte despre ce s-a întâmplat.',
      cancel: 'Renunță',
    },
  },

  faq: {
    title: 'Întrebări despre verificare',
    reviewTime: {
      q: 'Cât durează verificarea?',
      a: (label: string) => `Documentele intră într-o coadă de verificare manuală și sunt confirmate ${label}. Dacă un document este neclar, cerem unul nou și termenul se reia.`,
    },
    items: [
      {
        q: 'Ce se întâmplă cu o comandă dacă expiră un document?',
        a: 'Comanda nu se anulează singură. Transportul aflat în curs este semnalat echipei noastre, iar firma nu mai poate prelua alte curse până la reînnoire.',
      },
      {
        q: 'Pot vedea documentele firmei?',
        a: 'Nu. Vezi starea lor — valabil, expiră curând, expirat — nu și fișierele. Documentele conțin date personale și date de firmă care nu ne aparțin.',
      },
      {
        q: 'Plătesc pentru verificare, ca client?',
        a: 'Nu. Publicarea cererii și primirea ofertelor sunt gratuite pentru clienți. Abonamentul este al transportatorilor.',
      },
    ],
  },
} as const;
