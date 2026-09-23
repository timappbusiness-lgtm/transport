import { straightLineKm, type LatLng } from './pricing';
import { cityLabel, findCity, type City } from './cities';
import type { CargoCategory } from './departures';
import { OFFERED_CATEGORIES, needsDescription } from './vehicle-categories';
import type { Prefill } from './price-prefill';
import type { VehicleClass } from './pricing';
import { validateEmail, validatePhone, type FieldErrors } from './validation/auth';

/**
 * The publish-a-request form, without React and without SQL.
 *
 * Every rule below has a twin in `create_cargo_request`. The database is
 * the boundary; this is the courtesy — being told that the loading date is
 * in the past while you are looking at the field beats being told after
 * four steps and a round trip. Where the two could disagree, the database
 * wins and its message is shown as it is.
 */

/**
 * Traseu, Vehicul, Serviciu, Contact — in the order a person thinks about
 * a move: where, what, how, and how to reach me. The vehicle's condition
 * sits with the vehicle, and the service, how long it stays up and who
 * sees it sit together as „how", which leaves the last step short.
 */
export const REQUEST_STEPS = ['ruta', 'vehicul', 'serviciu', 'contact'] as const;
export type RequestStep = (typeof REQUEST_STEPS)[number];

/** Only these two are offered. `tractare` stays in the schema, hidden. */
export const OFFERED_SERVICES = ['pe_sens', 'expres'] as const;
export type OfferedService = (typeof OFFERED_SERVICES)[number];

/**
 * Everything the form holds, as text where the field is text.
 *
 * Numbers stay strings on purpose: a half-typed year is a string, and a
 * draft restored from storage has to render exactly what was left behind,
 * including the half-typed parts.
 */
export interface RequestDraft {
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  loadingFrom: string;
  loadingTo: string;
  category: CargoCategory;
  make: string;
  model: string;
  year: string;
  weightKg: string;
  isRunning: boolean;
  wheelsTurn: boolean;
  steeringWorks: boolean;
  hasKeys: boolean;
  isDamaged: boolean;
  damageNotes: string;
  serviceType: OfferedService;
  /**
   * How long it stays on the board, in days.
   *
   * A string because it lives in a `<select>` and in sessionStorage, and
   * a draft that holds one type in the browser and another after a
   * round trip is a bug waiting for somebody to find it.
   */
  durationDays: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  /**
   * Privată înseamnă că o văd numai transportatorii invitați — regulă
   * de RLS, nu un filtru pe ecran. Implicit fals: bursa este locul
   * unde ajungi la cei mai mulți, iar cine vrea altfel alege anume.
   */
  isPrivate: boolean;
  /** Firmele invitate, când este privată. */
  invitedCarriers: string[];
}

export type RequestField = keyof RequestDraft;

/**
 * How long a request may stay on the board.
 *
 * Four choices rather than a free number: a board full of year-long
 * listings is a board nobody trusts, and the column's check constraint
 * holds the same four so the browser cannot invent a fifth.
 */
export const DURATION_OPTIONS = [3, 7, 14, 30] as const;
export const DEFAULT_DURATION_DAYS = 14;

export function isDurationDays(value: string): boolean {
  return (DURATION_OPTIONS as readonly number[]).includes(Number(value));
}

/** The chosen duration, or the default when the form sent nonsense. */
export function durationOrDefault(value: string): number {
  return isDurationDays(value) ? Number(value) : DEFAULT_DURATION_DAYS;
}

export const MAX_DESCRIPTION = 1200;
export const MAX_DAMAGE_NOTES = 500;
/** A car transporter is not taking anything heavier than this. */
export const MAX_WEIGHT_KG = 40000;

export function emptyDraft(): RequestDraft {
  return {
    fromCity: '',
    fromCountry: 'RO',
    toCity: '',
    toCountry: 'RO',
    loadingFrom: '',
    loadingTo: '',
    category: 'autoturism',
    make: '',
    model: '',
    year: '',
    weightKg: '',
    isRunning: true,
    wheelsTurn: true,
    steeringWorks: true,
    hasKeys: true,
    isDamaged: false,
    damageNotes: '',
    serviceType: 'pe_sens',
    durationDays: String(DEFAULT_DURATION_DAYS),
    description: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    isPrivate: false,
    invitedCarriers: [],
  };
}

/**
 * The calculator's five classes against the board's fourteen categories.
 *
 * Three of the five are the same car to a transporter, which is why the
 * calculator prices them apart and the board files them together: a
 * hatchback and a sedan differ in what they cost to move, not in what a
 * carrier searches for.
 */
export const CATEGORY_FROM_CLASS: Record<VehicleClass, CargoCategory> = {
  motocicleta: 'motocicleta',
  hatchback: 'autoturism',
  sedan: 'autoturism',
  suv: 'autoturism',
  autoutilitara: 'autoutilitara',
};

/** What the price calculator already asked, so nobody is asked it twice. */
export function draftFromPrefill(prefill: Prefill): RequestDraft {
  const draft = emptyDraft();
  if (prefill.from) {
    draft.fromCity = prefill.from.name;
    draft.fromCountry = prefill.from.country;
  } else if (prefill.fromCountry) {
    // A landing page for a corridor knows the country and not the town —
    // the car is somewhere in Germany, and which somewhere is the
    // visitor's to type. Filling the country leaves them one box.
    draft.fromCountry = prefill.fromCountry;
  }
  if (prefill.to) {
    draft.toCity = prefill.to.name;
    draft.toCountry = prefill.to.country;
  } else if (prefill.toCountry) {
    draft.toCountry = prefill.toCountry;
  }
  // The category is what the form asks for; the price class is coarser, so
  // an explicit category wins over one derived from a class.
  if (prefill.category) draft.category = prefill.category;
  else if (prefill.vehicleClass) draft.category = CATEGORY_FROM_CLASS[prefill.vehicleClass];
  if (prefill.isRunning !== null) {
    draft.isRunning = prefill.isRunning;
    // A car that does not start does not steer itself onto the platform
    // either, and the calculator only ever asked the one question. Leaving
    // the other two at "yes" would tell the carrier the opposite of what
    // the estimate was priced on.
    if (!prefill.isRunning) {
      draft.wheelsTurn = false;
      draft.steeringWorks = false;
    }
  }
  if (prefill.express !== null) draft.serviceType = prefill.express ? 'expres' : 'pe_sens';
  return draft;
}

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Today as `YYYY-MM-DD`. Takes the clock so a test can hold it still. */
export function isoToday(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function integer(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** The fields each step owns, so a step is checked without the ones after it. */
export const STEP_FIELDS: Record<RequestStep, readonly RequestField[]> = {
  ruta: ['fromCity', 'fromCountry', 'toCity', 'toCountry', 'loadingFrom', 'loadingTo'],
  // `description` is here as well as in `contact`: for „Altceva" the
  // description is asked on this step, and a step that lets somebody
  // walk past a rule the database enforces only tells them at the end,
  // three steps later, about a field they have stopped looking at.
  vehicul: [
    'category',
    'make',
    'model',
    'year',
    'weightKg',
    'description',
    'isRunning',
    'wheelsTurn',
    'steeringWorks',
    'hasKeys',
    'isDamaged',
    'damageNotes',
  ],
  // How it travels, how long it stays up and who sees it: three answers
  // to „how", chosen together.
  serviciu: ['serviceType', 'durationDays', 'isPrivate', 'invitedCarriers'],
  contact: ['description', 'contactName', 'contactPhone', 'contactEmail'],
};

/**
 * Every rule, at once. `today` is a parameter rather than a call to the
 * clock so this stays pure — React refuses to render a component that reads
 * the time, and a test should not have to wait until tomorrow.
 */
export function validateDraft(draft: RequestDraft, today: string): FieldErrors<RequestField> {
  const errors: FieldErrors<RequestField> = {};

  // The select offers four values and the column accepts the same four.
  // This is what catches a draft restored from an older sessionStorage,
  // which is the one way a fifth can turn up.
  if (!isDurationDays(draft.durationDays)) {
    errors.durationDays = 'Alege cât timp stă cererea pe panou.';
  }

  if (draft.fromCity.trim() === '') errors.fromCity = 'Scrie orașul de plecare.';
  else if (draft.fromCity.trim().length > 60) errors.fromCity = 'Numele este prea lung.';
  if (draft.toCity.trim() === '') errors.toCity = 'Scrie orașul de destinație.';
  else if (draft.toCity.trim().length > 60) errors.toCity = 'Numele este prea lung.';

  if (!/^[A-Za-z]{2}$/.test(draft.fromCountry)) errors.fromCountry = 'Alege țara de plecare.';
  if (!/^[A-Za-z]{2}$/.test(draft.toCountry)) errors.toCountry = 'Alege țara de destinație.';

  if (!isoDate(draft.loadingFrom)) {
    errors.loadingFrom = 'Alege data de la care poate fi încărcat.';
  } else if (draft.loadingFrom < today) {
    errors.loadingFrom = 'Data a trecut. Alege una de azi înainte.';
  }
  if (draft.loadingTo !== '') {
    if (!isoDate(draft.loadingTo)) errors.loadingTo = 'Data nu pare corectă.';
    else if (isoDate(draft.loadingFrom) && draft.loadingTo < draft.loadingFrom) {
      errors.loadingTo = 'Sfârșitul intervalului este înaintea începutului.';
    }
  }

  if (!(OFFERED_CATEGORIES as readonly string[]).includes(draft.category)) {
    errors.category = 'Alege categoria vehiculului.';
  }
  // „Altceva" is the one category that carries no information by itself.
  // The same rule is a trigger in Postgres — that one is the boundary,
  // this one is the courtesy of saying so before the round trip.
  if (needsDescription(draft.category) && draft.description.trim().length < 10) {
    errors.description = 'Scrie ce transporți, în cel puțin 10 caractere.';
  }
  if (draft.make.trim() === '') errors.make = 'Scrie marca.';
  if (draft.model.trim() === '') errors.model = 'Scrie modelul.';

  const year = integer(draft.year);
  const maxYear = Number(today.slice(0, 4)) + 1;
  if (year === null || year < 1900 || year > maxYear) {
    errors.year = `Anul trebuie să fie între 1900 și ${maxYear}.`;
  }

  if (draft.weightKg.trim() !== '') {
    const weight = integer(draft.weightKg);
    if (weight === null || weight <= 0 || weight > MAX_WEIGHT_KG) {
      errors.weightKg = `Greutatea trebuie să fie între 1 și ${MAX_WEIGHT_KG} kg.`;
    }
  }

  if (draft.isDamaged && draft.damageNotes.trim() === '') {
    errors.damageNotes = 'Scrie pe scurt ce este avariat.';
  }
  if (draft.damageNotes.length > MAX_DAMAGE_NOTES) {
    errors.damageNotes = `Cel mult ${MAX_DAMAGE_NOTES} de caractere.`;
  }
  if (draft.description.length > MAX_DESCRIPTION) {
    errors.description = `Cel mult ${MAX_DESCRIPTION} de caractere.`;
  }

  const phoneError = validatePhone(draft.contactPhone);
  if (phoneError) errors.contactPhone = phoneError;

  if (draft.contactEmail.trim() !== '') {
    const emailError = validateEmail(draft.contactEmail);
    if (emailError) errors.contactEmail = emailError;
  }

  return errors;
}

/** The errors that belong to one step, so Continuă checks only that step. */
export function validateStep(
  draft: RequestDraft,
  step: RequestStep,
  today: string,
): FieldErrors<RequestField> {
  const all = validateDraft(draft, today);
  const fields = STEP_FIELDS[step];
  const errors: FieldErrors<RequestField> = {};
  for (const field of fields) {
    const message = all[field];
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

export function firstStepWithError(draft: RequestDraft, today: string): RequestStep | null {
  for (const step of REQUEST_STEPS) {
    if (Object.keys(validateStep(draft, step, today)).length > 0) return step;
  }
  return null;
}

// ---------------------------------------------------------------------
// The draft that survives a sign-in
// ---------------------------------------------------------------------

/**
 * Publishing needs an account, and being sent to create one in the middle
 * of a form is where most people leave. The draft is kept in
 * `sessionStorage` so the trip through sign-up brings it back: one tab, one
 * origin, gone when the tab is closed, and never sent anywhere.
 *
 * The key carries a version. A draft written by an older shape of the form
 * is dropped rather than rendered half-missing.
 */
export const DRAFT_STORAGE_KEY = 'coridor.cerere.v1';

export function serialiseDraft(draft: RequestDraft): string {
  return JSON.stringify(draft);
}

/**
 * Never throws and never trusts. Storage can hold anything — another tab,
 * an older release, a person with a console — so every field is taken only
 * when it has the type it should, and anything else falls back to empty.
 */
export function parseDraft(raw: string | null): RequestDraft | null {
  if (raw === null || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const source = parsed as Record<string, unknown>;
  const draft = emptyDraft();
  for (const key of Object.keys(draft) as RequestField[]) {
    const value = source[key];
    const current = draft[key];
    if (typeof current === 'boolean' && typeof value === 'boolean') {
      (draft[key] as boolean) = value;
    } else if (typeof current === 'string' && typeof value === 'string') {
      (draft[key] as string) = value.slice(0, MAX_DESCRIPTION);
    }
  }
  // Two enums, both of which arrive as strings and neither of which may be
  // whatever the string happened to say.
  if (!(OFFERED_CATEGORIES as readonly string[]).includes(draft.category)) {
    draft.category = 'autoturism';
  }
  if (!(OFFERED_SERVICES as readonly string[]).includes(draft.serviceType)) {
    draft.serviceType = 'pe_sens';
  }
  return draft;
}

// ---------------------------------------------------------------------
// What the server sends to the database
// ---------------------------------------------------------------------

/**
 * Coordinates are looked up from the city list on the server, never taken
 * from the form. They are only used for the straight-line distance a card
 * shows, but a number a browser can choose is a number a browser can use to
 * make a request look closer than it is.
 */
export function coordinatesFor(city: string, country: string): City | null {
  return findCity(city, country);
}

/** "München (Bavaria)" when the city is known, the plain name otherwise. */
export function cityDisplay(city: string, country: string): string {
  const known = findCity(city, country);
  return known ? cityLabel(known) : city;
}

/**
 * The distance the board will show for this route, in whole kilometres,
 * or null while either end is a place we have no coordinates for.
 *
 * The same number `v_requests_public.estimated_km` will hold: the
 * great-circle distance between the two city centres, rounded — no road
 * factor, because the board does not use one, and a form that promised
 * 1.350 km for a card that then says 1.080 would be a form nobody trusts.
 */
export function estimatedKm(from: LatLng | null, to: LatLng | null): number | null {
  if (from === null || to === null) return null;
  return Math.round(straightLineKm(from, to));
}
