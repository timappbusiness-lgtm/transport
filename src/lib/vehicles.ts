import type { Database } from '@/lib/supabase/database.types';

type VehicleType = Database['public']['Enums']['vehicle_type'];

/** The launch market is vehicle transport: platforms first. */
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
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

export const VEHICLE_TYPE_ORDER: readonly VehicleType[] = [
  'platforma_auto', 'platforma_auto_inchisa', 'platforma_tractari', 'troliu', 'autoutilitara_3_5t',
  'duba', 'prelata', 'platforma', 'frigorific', 'basculanta', 'cisterna', 'container', 'agabaritic', 'autospeciala',
];

/** "tm 01 crd" -> "TM01CRD": one spelling per plate, so duplicates are caught. */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** "TM01CRD" -> "TM 01 CRD" for display, when it has the Romanian shape. */
export function formatPlate(plate: string): string {
  const m = /^([A-Z]{1,2})(\d{2,3})([A-Z]{3})$/.exec(plate);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : plate;
}

export const COUNTRY_OPTIONS: readonly { code: string; name: string }[] = [
  { code: 'RO', name: 'România' }, { code: 'DE', name: 'Germania' }, { code: 'IT', name: 'Italia' },
  { code: 'NL', name: 'Olanda' }, { code: 'BE', name: 'Belgia' }, { code: 'FR', name: 'Franța' },
  { code: 'ES', name: 'Spania' }, { code: 'AT', name: 'Austria' }, { code: 'HU', name: 'Ungaria' },
  { code: 'PL', name: 'Polonia' }, { code: 'CZ', name: 'Cehia' }, { code: 'BG', name: 'Bulgaria' },
  { code: 'MD', name: 'Republica Moldova' }, { code: 'GB', name: 'Regatul Unit' }, { code: 'CH', name: 'Elveția' },
  { code: 'DK', name: 'Danemarca' }, { code: 'SE', name: 'Suedia' },
];
