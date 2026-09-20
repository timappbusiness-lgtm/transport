/**
 * „Sesizări" — the staff queue, and what it says to the person who wrote in.
 *
 * The tone is the one the rest of the staff area uses: it says what was
 * decided and why, and it never promises an investigation the platform
 * would not actually run. The resolution text is written for the
 * reporter, because the reporter is who receives it.
 */
export const reportsCopy = {
  meta: { title: 'Sesizări' },
  hero: {
    eyebrow: 'Staff',
    title: 'Sesizări',
    lede: 'Ce ne-au semnalat oamenii, în ordinea în care a venit. Când închizi una, textul pe care îl scrii ajunge pe e-mail la cel care a sesizat — deci scrie-l pentru el.',
  },
  empty: {
    title: 'Nicio sesizare deschisă.',
    body: 'Sesizările vin din pagina „Cum verificăm firmele”, de pe profilul unei firme și de pe o cerere. Când apare una, o găsești aici.',
    filtered: 'Nicio sesizare în starea asta.',
    action: 'Vezi toate sesizările',
  },
  filters: {
    label: 'Stare',
    all: 'Toate',
  },
  row: {
    reported: 'Despre',
    reporter: 'A sesizat',
    assigned: 'În lucru la',
    unassigned: 'nimeni încă',
    opened: 'Primită',
    closed: 'Închisă',
    notified: 'Anunțat pe e-mail',
    notNotified: 'Nu am putut trimite e-mail (adresă nelivrabilă sau cont de test).',
    evidence: 'Dovadă atașată',
    details: 'Ce ne-a scris',
    resolution: 'Ce am răspuns',
    notes: 'Notițe interne',
    notesHint: 'Nu ajung niciodată la cel care a sesizat.',
  },
  form: {
    take: 'Preiau eu',
    investigating: 'Marchează „în lucru”',
    resolve: 'Rezolvă',
    dismiss: 'Respinge',
    resolution: 'Ce îi răspundem',
    resolutionHint:
      'Obligatoriu la rezolvare și la respingere. Textul ăsta se trimite pe e-mail, așa cum l-ai scris.',
    notes: 'Notiță internă',
    save: 'Salvează',
    saving: 'Se salvează…',
    missingResolution: 'Scrie ce ai decis și de ce. Textul ajunge la cel care a sesizat.',
  },
  notice: {
    updated: 'Am salvat sesizarea.',
    closed: 'Sesizarea este închisă. I-am trimis răspunsul pe e-mail.',
    closedNoEmail: 'Sesizarea este închisă. Nu am putut trimite e-mail la adresa lui.',
  },
} as const;
