/**
 * „Transportatori favoriți".
 *
 * Un ecran mic, cu o singură idee: lista este a firmei. Textul o spune
 * de două ori, pentru că un dispecer care pleacă și își ia lista cu el
 * este exact ce nu vrem, iar oamenii presupun contrariul.
 */
export const favouritesCopy = {
  meta: { title: 'Transportatori favoriți' },
  title: 'Transportatori favoriți',
  lede: 'Firmele cu care lucrezi. Le inviți la o cerere privată dintr-un clic și filtrezi ofertele după ele.',
  shared: 'Lista este a firmei, nu a ta: rămâne și după ce pleacă un coleg.',
  privacy: 'Transportatorul nu află că este pe lista ta.',

  empty: 'Niciun transportator în listă.',
  emptyBody:
    'Adaugi unul de pe profilul firmei, de pe o ofertă primită sau de pe o comandă încheiată.',

  add: 'Adaugă la favoriți',
  added: 'În favoriți',
  remove: 'Scoate din favoriți',
  note: 'Notă',
  notePlaceholder: 'De ce lucrezi cu ei',

  invite: 'Invită la o cerere',
  ratings: (n: number) => (n === 1 ? 'o evaluare' : `${n} evaluări`),
  noRatings: 'fără evaluări încă',

  /** Filtrul de pe ofertele primite. */
  filter: 'Doar favoriți',
  filterAll: 'Toate ofertele',
} as const;
