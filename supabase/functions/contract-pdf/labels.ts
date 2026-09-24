/**
 * The Romanian names the contract prints for codes stored in the snapshot.
 *
 * Copies of maps the application keeps in `src/lib/departures.ts`,
 * `src/lib/vehicles.ts` and `src/content/firma.ts`: an edge function
 * cannot import the application. `tests/unit/contract-model.test.ts`
 * compares each one with the application's, so a label changed there and
 * not here fails CI instead of printing an old word on a contract.
 *
 * A code this file does not know prints as the code, never as nothing.
 */

export const CARGO_CATEGORY: Record<string, string> = {
  autoturism: 'Autoturism / SUV',
  autoutilitara: 'Autoutilitară',
  motocicleta: 'Motocicletă',
  utilaj_agricol: 'Utilaj agricol',
  microbuz: 'Microbuz',
  utilaj_constructii: 'Utilaj de construcții',
  rulota: 'Rulotă',
  cap_tractor: 'Cap tractor',
  camion: 'Camion',
  remorca: 'Remorcă ușoară (până la 750 kg)',
  utilaj_manipulare: 'Utilaj de manipulare',
  container: 'Container',
  ambarcatiune: 'Ambarcațiune',
  altele: 'Altceva',
  atv_quad: 'ATV sau quad',
  cvadriciclu: 'Cvadriciclu sau vehicul electric mic',
  istoric: 'Vehicul istoric sau de colecție',
};

export const SERVICE_TYPE: Record<string, string> = {
  pe_sens: 'Pe sens',
  expres: 'Expres',
  tractare: 'Tractare',
};

/** One line on what each service level means, printed under the level. */
export const SERVICE_TYPE_NOTE: Record<string, string> = {
  pe_sens: 'transportul se face pe ruta obișnuită a transportatorului, în intervalul convenit',
  expres: 'transport direct, la data convenită',
  tractare: 'vehiculul este încărcat cu troliu sau prin tractare, fiindcă nu poate fi urcat singur',
};

export const VEHICLE_TYPE: Record<string, string> = {
  platforma_auto: 'Platformă auto (deschisă)',
  platforma_auto_inchisa: 'Platformă auto închisă',
  platforma_tractari: 'Platformă de tractări',
  troliu: 'Vehicul cu troliu',
  autoutilitara_3_5t: 'Autoutilitară până în 3,5 t',
  duba: 'Dubă',
  prelata: 'Prelată',
  platforma: 'Platformă',
  frigorific: 'Frigorific',
  basculanta: 'Basculantă',
  cisterna: 'Cisternă',
  container: 'Port-container',
  agabaritic: 'Agabaritic',
  autospeciala: 'Autospecială',
};

export const COUNTRY: Record<string, string> = {
  RO: 'România',
  DE: 'Germania',
  IT: 'Italia',
  FR: 'Franța',
  ES: 'Spania',
  NL: 'Țările de Jos',
  BE: 'Belgia',
  AT: 'Austria',
  CH: 'Elveția',
  GB: 'Marea Britanie',
  IE: 'Irlanda',
  PT: 'Portugalia',
  DK: 'Danemarca',
  SE: 'Suedia',
  NO: 'Norvegia',
  PL: 'Polonia',
  CZ: 'Cehia',
  SK: 'Slovacia',
  HU: 'Ungaria',
  BG: 'Bulgaria',
  GR: 'Grecia',
  HR: 'Croația',
  SI: 'Slovenia',
  RS: 'Serbia',
  MD: 'Republica Moldova',
  UA: 'Ucraina',
};

/** The label for a code, or the code itself. */
export function label(map: Record<string, string>, code: string | null | undefined): string | null {
  if (!code) return null;
  return map[code] ?? code;
}

/** A country as its Romanian name: `RO` -> „România"; a name already written out stays as it is. */
export function countryLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim();
  return COUNTRY[trimmed.toUpperCase()] ?? trimmed;
}
