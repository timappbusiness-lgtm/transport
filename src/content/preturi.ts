/**
 * Romanian copy for the indicative prices page. Components hold no text.
 *
 * Two rules run through all of it. Nothing here is a quote — the figures
 * are reference points we set, and the carrier decides the price — and no
 * number is written into this file. They come from `price_rates` and
 * `price_settings`, so changing a rate is an admin action and an audit row,
 * never a deploy.
 */

export const pricesCopy = {
  meta: {
    title: 'Prețuri orientative',
    description:
      'Tarife orientative pe kilometru pentru transport auto în România și Europa, cu un calculator de rută. Prețul final îl stabilește transportatorul.',
  },

  hero: {
    eyebrow: 'Prețuri orientative',
    strong: 'Cât costă',
    soft: 'un transport auto.',
    lede:
      'Tarifele de mai jos sunt reperele noastre pe kilometru, pe clase de vehicule. Sunt orientative: prețul final îl stabilește transportatorul care preia cursa, în funcție de rută, perioadă și locurile libere de pe platformă.',
    // Nothing is "mai jos" while the table is unpublished.
    ledeUnpublished:
      'Prețul unui transport auto depinde de rută, de clasa vehiculului și de perioadă. Aici publicăm reperele noastre pe kilometru, ca să ai un ordin de mărime înainte să ceri oferte. Prețul final îl stabilește transportatorul care preia cursa.',
  },

  /** Before the team publishes. No figures, no calculator, one way forward. */
  unpublished: {
    title: 'Prețurile orientative vor fi publicate în curând.',
    body:
      'Stabilim tarifele pe clase de vehicule împreună cu transportatorii din platformă. Până atunci poți publica o cerere și primești oferte pentru ruta ta, fără cost și fără cont.',
    cta: 'Publică o cerere',
    secondary: 'Vezi traseele disponibile',
  },

  service: {
    legend: 'Tip de serviciu',
    standard: 'Standard',
    express: 'Expres',
    standardNote:
      'Vehiculul merge cu o platformă care oricum face ruta. Costă mai puțin și depinde de programul ei.',
    expressNote: (pct: number) =>
      `Cursă dedicată, la data cerută. Tarifele de mai jos includ majorarea de ${pct}%.`,
  },

  table: {
    title: 'Tarife pe kilometru',
    updated: (month: string) => `Actualizat: ${month}`,
    caption:
      'Tarife orientative pe kilometru, pe clase de vehicule și pe cele trei tipuri de distanță.',
    columns: {
      vehicle: 'Clasă vehicul',
      local: 'Local (sub 50 km)',
      national: 'Național',
      international: 'Internațional',
    },
    minimum: 'Minimum pe cursă',
    minimumNote:
      'Sub aceste sume o cursă nu se justifică, oricât de scurtă ar fi: încărcarea, actele și drumul până la vehicul rămân aceleași.',
    note:
      'Tarifele interne sunt în lei, cele internaționale în euro, pentru că așa se decontează drumul: motorină, taxe de drum și traversări.',
    notRunning: (pct: number) =>
      `Un vehicul care nu pornește și nu rulează are nevoie de troliu și de un om în plus. Se adaugă aproximativ ${pct}%.`,
  },

  calculator: {
    title: 'Calculează o estimare',
    lede:
      'Alege ruta și clasa vehiculului. Rezultatul este un interval calculat din tarifele de mai jos, nu o ofertă.',
    from: 'De unde',
    to: 'Unde',
    choose: 'Alege localitatea',
    romania: 'România',
    europe: 'Europa',
    vehicleClass: 'Clasă vehicul',
    running: 'Pornește și rulează',
    yes: 'Da',
    no: 'Nu',
    result: 'Estimare',
    empty: 'Alege plecarea și destinația pentru o estimare.',
    same: 'Alege două localități diferite.',
    distance: (km: string) => `${km} km estimați pe șosea`,
    zone: 'Tarif aplicat',
    minimumApplied: 'S-a aplicat minimul pe cursă.',
    surcharges: 'Majorări incluse',
    notRunningTag: 'Nu pornește',
    expressTag: 'Expres',
    disclaimer:
      'Estimare orientativă. Prețul final îl stabilește transportatorul, după ce vede vehiculul și ruta.',
    cta: 'Publică o cerere cu aceste date',
    cityNote:
      'Lista de localități este deocamdată scurtă. Alege reședința de județ sau orașul mare cel mai apropiat — pentru o estimare, diferența intră în interval.',
  },

  faq: {
    title: 'Întrebări despre preț',
    items: [
      {
        q: 'De ce este un interval și nu un preț fix?',
        a:
          'Pentru că prețul nu îl stabilim noi. Intervalul arată unde se încadrează de obicei o cursă ca a ta; oferta vine de la transportatorul care are loc pe platformă în perioada cerută, iar el cunoaște costul real al drumului.',
      },
      {
        q: 'Ce schimbă prețul față de estimare?',
        a:
          'Perioada și direcția contează cel mai mult: o cursă pe retur, pe un traseu pe care platforma oricum îl face, costă mai puțin decât una dedicată. Mai schimbă prețul starea vehiculului, accesul la locul de încărcare și dacă se cere o dată fixă.',
      },
      {
        q: 'Cum obțin un preț exact?',
        a:
          'Publici cererea, gratuit și fără cont, cu ruta, vehiculul și perioada. Primești oferte de la transportatori cu documente valabile și alegi. Până accepți o ofertă nu ai niciun angajament.',
      },
    ],
  },

  /**
   * What the request form says back when it is opened from the calculator.
   * Until the form exists, this is the proof the handoff works.
   */
  handoff: {
    title: 'Datele din calculator',
    body:
      'Rămân în adresa paginii, ca să nu le reintroduci când formularul este gata.',
    running: 'pornește și rulează',
    notRunning: 'nu pornește',
  },

  /** The staff screen. English is the code; the screen is still Romanian. */
  admin: {
    title: 'Prețuri orientative',
    lede:
      'Tarifele pe kilometru și majorările. Fiecare modificare trece printr-un RPC și lasă o urmă în jurnal, cu valoarea dinainte și cea de după.',
    statusPublished: 'Publicat',
    statusDraft: 'Nepublicat',
    publishedNote: (when: string) => `Publicat la ${when}.`,
    draftNote: 'Nimeni din afara echipei nu vede tabelul până la publicare.',
    publish: 'Publică prețurile',
    unpublish: 'Retrage prețurile',
    confirmPublish:
      'Publici tarifele? De acum sunt vizibile pe pagina publică și pe prima pagină.',
    confirmUnpublish:
      'Retragi tarifele? Pagina publică revine la mesajul „în curând”, iar calculatorul dispare.',
    confirmYes: 'Da, continuă',
    cancel: 'Renunță',
    afterPublishWarning:
      'Tarifele sunt publicate. O modificare de acum se vede imediat pe site și este marcată ca atare în jurnal.',

    rates: {
      title: 'Tarife pe clasă',
      weight: 'Indicație de greutate',
      local: 'Local (lei/km)',
      national: 'Național (lei/km)',
      international: 'Internațional (€/km)',
      minimumRon: 'Minim (lei)',
      minimumEur: 'Minim (€)',
      save: 'Salvează',
      saved: 'Tarif salvat.',
      invalidNumber: 'Introdu un număr mai mare decât zero.',
      invalidLabel: 'Scrie o indicație de greutate.',
      invalidClass: 'Clasă de vehicul necunoscută.',
    },

    settings: {
      title: 'Majorări și calcul',
      notRunning: 'Majorare vehicul care nu pornește (%)',
      express: 'Majorare Expres (%)',
      roadFactor: 'Factor distanță rutieră',
      roadFactorHint:
        'Raportul dintre distanța în linie dreaptă și cea pe șosea. 1,25 este valoarea uzuală în Europa.',
      spread: 'Lățimea intervalului afișat (%)',
      month: 'Luna pentru care sunt valabile',
      save: 'Salvează setările',
      saved: 'Setări salvate.',
      invalidPercent: 'Introdu un procent între 0 și 200.',
      invalidSpread: 'Introdu un procent între 0 și 100.',
      invalidFactor: 'Introdu un număr între 1 și 3.',
      invalidMonth: 'Alege o lună.',
    },

    preview: {
      title: 'Previzualizare',
      lede: 'Exact ce vede un vizitator după publicare.',
    },

    history: {
      title: 'Ce s-a schimbat',
      empty: 'Nicio modificare înregistrată.',
      actions: {
        'price_rate.updated': 'Tarif modificat',
        'price_settings.updated': 'Setări modificate',
        'prices.published': 'Tarife publicate',
        'prices.unpublished': 'Tarife retrase',
      } as Record<string, string>,
      published: 'după publicare',
    },

    noAccess: 'Nu ai drepturi pentru această acțiune.',
  },

  /** The compact band on the homepage. */
  home: {
    eyebrow: 'Prețuri orientative',
    strong: 'Un reper de preț,',
    soft: 'înainte să ceri oferte.',
    lede:
      'Tarife orientative pe kilometru, pe clase de vehicule. Prețul final îl stabilește transportatorul.',
    ledeUnpublished:
      'Stabilim tarifele orientative împreună cu transportatorii din platformă. Le publicăm aici, pe clase de vehicule și pe distanță.',
    link: 'Toate clasele și calculatorul',
    linkUnpublished: 'Cum calculăm prețul',
  },
} as const;
