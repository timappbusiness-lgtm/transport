/**
 * The words every search panel shares: the button, its count, the chips.
 *
 * The boards keep their own copies of „Mai multe filtre" in
 * `cereri.ts` and `departures.ts`, beside the fields they label; the
 * directory and the staff lists use these.
 */
export const filtersCopy = {
  more: 'Mai multe filtre',
  active: (n: number) => (n === 1 ? 'un filtru activ' : `${n} filtre active`),
  apply: 'Caută',
  clear: 'Șterge filtrele',
  chipsHeading: 'Filtre active',
  removeChip: 'Scoate filtrul',
  any: 'Oricare',
  from: 'De la',
  to: 'Până la',
} as const;
