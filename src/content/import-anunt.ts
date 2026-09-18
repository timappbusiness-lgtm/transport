/**
 * Romanian for the import panel.
 *
 * One line here matters more than the rest and is checked by a test:
 * `disclaimer`. Everything the model produced is a guess about somebody
 * else's advert, and the moment a form presents a guess the way it
 * presents typing, the person stops reading it.
 */
export const importCopy = {
  title: 'Completează din anunț',
  lede:
    'Ai mașina într-un anunț? Pune linkul sau o poză și completăm ce găsim. Verifică apoi câmpurile — noi citim un anunț, nu vedem mașina.',

  tabs: {
    link: 'Link anunț',
    photo: 'Fotografie',
  },

  link: {
    label: 'Adresa anunțului',
    placeholder: 'https://...',
    hint: 'Citim doar ce publică pagina pentru alte programe: titlul, descrierea și localitatea.',
    submit: 'Completează din link',
    working: 'Citim anunțul...',
  },

  photo: {
    label: 'Poza anunțului sau a mașinii',
    hint: 'JPEG, PNG sau WebP, până în 6 MB. O micșorăm înainte s-o trimitem.',
    submit: 'Completează din poză',
    working: 'Citim poza...',
  },

  /** The one sentence the brief pins down, and a test with it. */
  disclaimer: 'Date completate automat. Verifică-le înainte de publicare.',

  /** The chip on each field something else filled. */
  autoChip: 'auto',
  autoChipTitle: 'Completat automat din anunț. Verifică valoarea.',

  dropped: {
    one: 'Un câmp a rămas gol pentru că nu era clar în anunț.',
    many: (n: number) => `${n} câmpuri au rămas goale pentru că nu erau clare în anunț.`,
  },

  nothing:
    'Nu am găsit nimic de completat în anunțul acela. Scrie datele manual — durează un minut.',

  attach: {
    label: 'Atașează și poza din anunț la cerere',
    hint:
      'Descărcăm o copie la noi și îi ștergem datele ascunse, inclusiv locul unde a fost făcută. Fără asta, poza ar arăta unde stai.',
    needsAccount: 'Poza se poate atașa după ce intri în cont.',
    attached: 'Poza este atașată.',
    failed: 'Nu am putut lua poza. Cererea merge mai departe fără ea.',
  },

  remaining: {
    some: (n: number) => `Îți mai rămân ${n} completări automate azi.`,
    last: 'Este ultima completare automată pe ziua de azi.',
  },

  manual: 'Sau completează câmpurile de mai jos, ca de obicei.',
} as const;
