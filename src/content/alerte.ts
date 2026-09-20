/**
 * „Alertele mele" — saved searches and what they found.
 *
 * The tone is the one the rest of the account area uses: it says what
 * happens, when, and what to do about it, and it never promises an
 * e-mail the platform would not actually send.
 */
export const alertsCopy = {
  meta: { title: 'Alerte' },
  hero: {
    eyebrow: 'Cont',
    title: 'Alertele mele',
    lede: 'Căutările pe care le-ai salvat de pe panou. Când apare o cerere care se potrivește, îți scriem — și îți spunem exact de ce ți-am trimis-o.',
  },
  empty: {
    title: 'Nu ai nicio căutare salvată.',
    body: 'Caută pe panoul de cereri ce te interesează — rută, tip de vehicul, stare — și apasă „Salvează căutarea". De atunci încolo te anunțăm noi.',
    action: 'Mergi la panoul de cereri',
  },
  quota: {
    title: 'Ai atins limita planului',
    action: 'Vezi planurile',
    hint: 'Poți șterge una dintre cele existente ca să faci loc.',
  },
  list: {
    criteria: 'Ce caută',
    frequency: 'Cât de des',
    channel: 'Unde',
    channelEmail: 'E-mail',
    channelNone: 'Doar în cont',
    lastMatch: 'Ultima potrivire',
    matches7d: 'Potriviri în 7 zile',
    never: 'încă niciuna',
    paused: 'Oprită',
    active: 'Activă',
    pause: 'Oprește',
    resume: 'Pornește',
    delete: 'Șterge',
    deleteConfirm: 'Sigur ștergi căutarea? Nu se mai poate recupera.',
    rename: 'Redenumește',
    save: 'Salvează',
    matchesTitle: 'Ce a găsit',
    matchesEmpty: 'Nimic încă. Îți scriem în clipa în care apare ceva.',
    why: 'De ce s-a potrivit',
  },
  form: {
    title: 'Salvează căutarea',
    lede: 'Îți scriem când apare o cerere care se potrivește cu filtrele de acum.',
    name: 'Cum o numim',
    namePlaceholder: 'Germania → România, autoturisme',
    frequency: 'Cât de des îți scriem',
    email: 'Trimite-mi e-mail',
    emailHint: 'Dacă îl oprești, potrivirile rămân vizibile aici, dar nu primești nimic.',
    submit: 'Salvează căutarea',
    submitting: 'Se salvează…',
  },
} as const;
