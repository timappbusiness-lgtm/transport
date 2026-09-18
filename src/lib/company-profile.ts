import type { CargoCategory } from './departures';
import { isCountyCode } from './counties';

/**
 * The company profile: what a firm says it does, and whether it has said
 * enough of it to be worth showing.
 *
 * Every rule here has a twin in migration `20260918090000`, which is where
 * it is enforced. These exist so the form can say what is wrong before the
 * round trip, and so the rules can be argued about in a test — not because
 * the browser is trusted with them. A check that passes here and fails in
 * Postgres is a bug in this file; the other way round is a security hole,
 * which is why nothing here is more permissive than the trigger.
 *
 * Free of React and of Supabase.
 */

export type CoverageScope = 'judetean' | 'national' | 'international';

export const COVERAGE_SCOPES: readonly CoverageScope[] = [
  'judetean',
  'national',
  'international',
];

/** The five tabs, in the order they appear. */
export const PROFILE_TABS = [
  'identitate',
  'acoperire',
  'dotari',
  'alerte',
  'public',
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

/**
 * A forwarder does not own the truck, so the tab about what is on it has
 * nothing for it to fill in. Everything else is the same.
 */
export function tabsFor(companyType: 'transport' | 'expeditie' | 'both'): ProfileTab[] {
  return PROFILE_TABS.filter((tab) => tab !== 'dotari' || companyType !== 'expeditie');
}

export function hasEquipmentTab(companyType: 'transport' | 'expeditie' | 'both'): boolean {
  return companyType !== 'expeditie';
}

/** What the form holds, before anything is sent. */
export interface ProfileDraft {
  contactPhone: string;
  contactEmail: string;
  website: string;
  county: string;
  city: string;
  address: string;
  baseAddressHidden: boolean;
  coverageScope: CoverageScope;
  coverageCounties: string[];
  coverageCountries: string[];
  vehicleTypesAccepted: CargoCategory[];
  equipment: string[];
  services: string[];
  indicativeRate: string;
  indicativeRateNote: string;
  alertsEnabled: boolean;
  alertsEmail: string;
  publicDescription: string;
}

export type ProfileField = keyof ProfileDraft;

export const MAX_PUBLIC_DESCRIPTION = 300;
export const MAX_RATE_NOTE = 200;
export const MIN_RATE = 0.1;
export const MAX_RATE = 100;

/**
 * Which fields belong to which tab.
 *
 * Saving is per tab, so an error has to be attributable to one: a message
 * about the telephone number shown on the coverage tab is a message nobody
 * can act on.
 */
export const TAB_FIELDS: Record<ProfileTab, readonly ProfileField[]> = {
  identitate: ['contactPhone', 'contactEmail', 'website', 'county', 'city', 'address'],
  acoperire: ['coverageScope', 'coverageCounties', 'coverageCountries'],
  dotari: ['vehicleTypesAccepted', 'equipment', 'services', 'indicativeRate', 'indicativeRateNote'],
  alerte: ['alertsEnabled', 'alertsEmail'],
  public: ['publicDescription', 'baseAddressHidden'],
};

export type ProfileErrors = Partial<Record<ProfileField, string>>;

export function validateProfile(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};

  if (draft.contactPhone.trim() !== '' && normalisePhone(draft.contactPhone) === null) {
    errors.contactPhone = 'Scrie numărul în forma +40722000111.';
  }
  if (draft.contactEmail.trim() !== '' && !isEmail(draft.contactEmail)) {
    errors.contactEmail = 'Adresa de e-mail nu este validă.';
  }
  if (draft.website.trim() !== '' && normaliseWebsite(draft.website) === null) {
    errors.website = 'Scrie adresa în forma https://firma.ro.';
  }

  if (draft.coverageScope === 'judetean' && draft.coverageCounties.length === 0) {
    errors.coverageCounties = 'Alege cel puțin un județ în care transporți.';
  }
  if (draft.coverageCounties.some((code) => !isCountyCode(code))) {
    errors.coverageCounties = 'Unul dintre județe nu este recunoscut.';
  }
  if (draft.coverageScope === 'international' && draft.coverageCountries.length === 0) {
    errors.coverageCountries = 'Alege cel puțin o țară în afara României.';
  }
  if (draft.coverageCountries.some((code) => !/^[A-Za-z]{2}$/.test(code.trim()))) {
    errors.coverageCountries = 'Codurile de țară au două litere, de exemplu DE.';
  }

  const rate = draft.indicativeRate.trim().replace(',', '.');
  if (rate !== '') {
    const value = Number(rate);
    if (!Number.isFinite(value) || value < MIN_RATE || value > MAX_RATE) {
      errors.indicativeRate = `Tariful orientativ este între ${MIN_RATE} și ${MAX_RATE} lei pe kilometru.`;
    }
  } else if (draft.indicativeRateNote.trim() !== '') {
    errors.indicativeRate = 'Scrie tariful înainte de observația despre el.';
  }
  if (draft.indicativeRateNote.length > MAX_RATE_NOTE) {
    errors.indicativeRateNote = `Observația are cel mult ${MAX_RATE_NOTE} de caractere.`;
  }

  if (draft.alertsEmail.trim() !== '' && !isEmail(draft.alertsEmail)) {
    errors.alertsEmail = 'Adresa de e-mail nu este validă.';
  }
  // An alert with nowhere to go is a switch that does nothing.
  if (
    draft.alertsEnabled &&
    draft.alertsEmail.trim() === '' &&
    draft.contactEmail.trim() === ''
  ) {
    errors.alertsEmail = 'Lasă o adresă de e-mail la care să primești alertele.';
  }

  if (draft.publicDescription.length > MAX_PUBLIC_DESCRIPTION) {
    errors.publicDescription = `Descrierea are cel mult ${MAX_PUBLIC_DESCRIPTION} de caractere.`;
  }

  return errors;
}

/** The errors belonging to one tab, so a save there reports only its own. */
export function validateTab(tab: ProfileTab, draft: ProfileDraft): ProfileErrors {
  const all = validateProfile(draft);
  const fields = TAB_FIELDS[tab];
  const errors: ProfileErrors = {};
  for (const field of fields) {
    const message = all[field];
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

/**
 * E.164, or null.
 *
 * The same three shapes `public.normalise_phone` accepts, because the same
 * three are how a Romanian writes a Romanian number: `0722…`, `0040722…`
 * and `+40722…`.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^0-9+]/g, '');
  if (digits === '') return null;

  let value = digits;
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  else if (value.startsWith('0')) value = `+40${value.slice(1)}`;
  else if (!value.startsWith('+')) value = `+${value}`;

  return /^\+[1-9][0-9]{6,14}$/.test(value) ? value : null;
}

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_eid',
  'mc_cid',
  'igshid',
  'ttclid',
  'twclid',
  'yclid',
  'ref',
  'referrer',
  'source',
]);

/**
 * https, lower-cased host, no fragment, no tracking parameters — or null.
 *
 * `URL` does most of it; what it will not do is decide that a campaign's
 * query string is not part of the company's address. Storing those would
 * have every visit from this directory reported to somebody else's
 * analytics for as long as the profile exists.
 */
export function normaliseWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  // http is upgraded rather than refused: the address is right and the
  // scheme is a habit.
  url.protocol = 'https:';
  url.hash = '';

  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname)) return null;

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(key);
    }
  }

  const value = url.toString().replace(/\/$/, (match, offset: number) =>
    // A trailing slash is worth dropping on a bare host and worth keeping
    // on a path, where it can be what the server routes on.
    offset === url.origin.length ? '' : match,
  );

  return value.length <= 200 ? value : null;
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(value.trim());
}

/** Trim, case-fold, drop blanks, de-duplicate, sort — as `tidy_codes` does. */
export function tidyCodes(codes: readonly string[], upper: boolean): string[] {
  const seen = new Set<string>();
  for (const code of codes) {
    const value = code.trim();
    if (value === '') continue;
    seen.add(upper ? value.toUpperCase() : value.toLowerCase());
  }
  return [...seen].sort();
}

// ---------------------------------------------------------------------
// How complete a profile is
//
// Shown, never enforced. Nothing on this platform is withheld because a
// firm has not filled in a box — a carrier with an empty profile still
// publishes, still bids and still appears on the board. The card is a
// suggestion about being found more often, and the moment it becomes a
// gate it stops being honest about that.
// ---------------------------------------------------------------------

export interface CompletenessItem {
  /** Which tab fixes it. */
  tab: ProfileTab;
  /** What is missing, in the words the tab uses. */
  label: string;
  done: boolean;
}

export interface Completeness {
  items: CompletenessItem[];
  done: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
}

export interface CompletenessInput {
  companyType: 'transport' | 'expeditie' | 'both';
  contactPhone: string | null;
  contactEmail: string | null;
  city: string | null;
  county: string | null;
  coverageScope: CoverageScope;
  coverageCounties: readonly string[];
  coverageCountries: readonly string[];
  vehicleTypesAccepted: readonly string[];
  equipment: readonly string[];
  services: readonly string[];
  publicDescription: string | null;
  logoPath: string | null;
  publicProfileEnabled: boolean;
  /** Counted from the fleet, never claimed. */
  vehiclesTotal: number;
}

export function completeness(input: CompletenessInput): Completeness {
  const filled = (value: string | null): boolean => (value ?? '').trim() !== '';

  const items: CompletenessItem[] = [
    { tab: 'identitate', label: 'Telefon de contact', done: filled(input.contactPhone) },
    { tab: 'identitate', label: 'E-mail de contact', done: filled(input.contactEmail) },
    { tab: 'identitate', label: 'Județul și localitatea', done: filled(input.county) && filled(input.city) },
    {
      tab: 'acoperire',
      label: 'Unde transporți',
      done:
        input.coverageScope === 'national' ||
        (input.coverageScope === 'judetean' && input.coverageCounties.length > 0) ||
        (input.coverageScope === 'international' && input.coverageCountries.length > 0),
    },
    {
      tab: 'dotari',
      label: 'Ce vehicule transporți',
      done: input.vehicleTypesAccepted.length > 0,
    },
    { tab: 'dotari', label: 'Servicii oferite', done: input.services.length > 0 },
    { tab: 'dotari', label: 'Dotări', done: input.equipment.length > 0 },
    { tab: 'dotari', label: 'Cel puțin un vehicul în flotă', done: input.vehiclesTotal > 0 },
    { tab: 'public', label: 'Descriere publică', done: filled(input.publicDescription) },
    { tab: 'public', label: 'Siglă', done: filled(input.logoPath) },
    { tab: 'public', label: 'Profil public activat', done: input.publicProfileEnabled },
  ];

  // A forwarder is not asked about the kit on a truck it does not own, so
  // those lines are not counted against it either.
  const relevant = hasEquipmentTab(input.companyType)
    ? items
    : items.filter((item) => item.label !== 'Dotări' && item.label !== 'Cel puțin un vehicul în flotă');

  const done = relevant.filter((item) => item.done).length;
  return {
    items: relevant,
    done,
    total: relevant.length,
    percent: relevant.length === 0 ? 100 : Math.round((done / relevant.length) * 100),
  };
}
