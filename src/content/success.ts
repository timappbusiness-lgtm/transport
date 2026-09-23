/**
 * The four moments worth marking, in Romanian.
 *
 * A request on the board, a firm verified, an offer accepted, a
 * transport finished. Each gets a drawing, one sentence and the next
 * thing to do — calm, because the next thing is usually a telephone
 * call, not a celebration.
 *
 * Three rules. No exclamation mark: the brief allows one on a success
 * screen, and none of these needed it. No promise: „o pot vedea", not
 * „vei primi oferte", because nobody guarantees an offer. And the
 * sentence says what is now possible, which is the only reason to stop
 * somebody and tell them anything.
 */
export const successCopy = {
  published: {
    title: 'Gata, cererea ta e pe panou.',
    body: 'Transportatorii verificați o pot vedea de acum.',
  },
  verified: {
    title: 'Firma ta e verificată.',
    body: 'De acum poți trimite oferte și publica trasee.',
    action: 'Vezi cererile',
  },
  offerAccepted: {
    title: 'Ai ales transportatorul.',
    // The fact the old note carried and must keep: this contact is not
    // counted against anybody's plan.
    body: 'Datele de contact sunt deschise pentru amândoi și nu se scad din abonament.',
  },
  offerWon: {
    title: 'Clientul ți-a acceptat oferta.',
    body: 'Ai transportul. Numărul clientului e mai jos și nu se scade din abonament.',
  },
  completed: {
    title: 'Transportul s-a încheiat.',
    body: 'Mulțumim că l-ai dus la capăt prin platformă.',
    action: 'Vezi toate transporturile',
  },
} as const;
