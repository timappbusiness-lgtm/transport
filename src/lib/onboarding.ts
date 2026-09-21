/**
 * Înscrierea asistată, fără React și fără SQL.
 *
 * Regulile care contează sunt în Postgres — cine poate crea, cine poate
 * revendica, cele patru ocheri pe un document. Aici stau doar lucrurile
 * pe care le citește un om de pe ecran: în ce pas a rămas o înscriere,
 * cât mai are linkul, ce scrie pe eticheta stării.
 *
 * Aritmetica ferestrelor (7 zile linkul, 30 de zile anunțul, 60 de zile
 * ștergerea) este aceeași ca în migrare, iar ultimele teste din
 * `tests/unit/onboarding.test.ts` o compară cu textul ei — nu este o a
 * doua implementare, este aceeași constantă citită din două locuri.
 */

export type AssistedStatus = 'in_lucru' | 'trimis' | 'revendicat' | 'expirat';
export type ConsentChannel = 'in_persoana' | 'telefon' | 'email';

export const STATUS_LABELS: Record<AssistedStatus, string> = {
  in_lucru: 'În lucru',
  trimis: 'Trimis spre revendicare',
  revendicat: 'Revendicat',
  expirat: 'Expirat',
};

export const CONSENT_LABELS: Record<ConsentChannel, string> = {
  in_persoana: 'În persoană',
  telefon: 'Telefon',
  email: 'E-mail',
};

export const CONSENT_CHANNELS: ConsentChannel[] = ['in_persoana', 'telefon', 'email'];

/** Cât ține linkul, cât așteptăm înainte să sunăm, cât înainte să ștergem. */
export const CLAIM_DAYS = 7;
export const ALERT_DAYS = 30;
export const PURGE_DAYS = 60;

export function isAssistedStatus(value: unknown): value is AssistedStatus {
  return value === 'in_lucru' || value === 'trimis'
    || value === 'revendicat' || value === 'expirat';
}

export function isConsentChannel(value: unknown): value is ConsentChannel {
  return value === 'in_persoana' || value === 'telefon' || value === 'email';
}

// ---------------------------------------------------------------------
// Pașii
// ---------------------------------------------------------------------

/**
 * Cei patru pași ai vrăjitorului, în ordinea în care se fac.
 *
 * `firma` este primul pentru că restul atârnă de el: fără o firmă nu ai
 * unde să pui nici un document, nici o mașină.
 */
export const STEPS = ['firma', 'documente', 'vehicule', 'profil'] as const;
export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  firma: 'Date firmă',
  documente: 'Documente',
  vehicule: 'Vehicule',
  profil: 'Profil și acoperire',
};

export interface StepState {
  firma: boolean;
  documente: boolean;
  vehicule: boolean;
  profil: boolean;
}

export function parseStep(value: string | null | undefined): Step {
  return STEPS.includes(value as Step) ? (value as Step) : 'firma';
}

/** Câți pași sunt gata. Pentru bara de progres, nimic mai mult. */
export function doneCount(state: StepState): number {
  return STEPS.filter((step) => state[step]).length;
}

/**
 * Unde ar trebui să se întoarcă cineva care reia o înscriere.
 *
 * Primul pas nefăcut, nu următorul după ultimul făcut: cineva care a
 * sărit documentele și a adăugat mașinile trebuie dus înapoi la
 * documente, nu mai departe.
 */
export function resumeAt(state: StepState): Step {
  return STEPS.find((step) => !state[step]) ?? 'profil';
}

export function isComplete(state: StepState): boolean {
  return STEPS.every((step) => state[step]);
}

// ---------------------------------------------------------------------
// Ceasul
// ---------------------------------------------------------------------

/**
 * Câte zile mai are linkul. Negativ înseamnă expirat.
 *
 * Rotunjit în sus, pentru că „mai ai o zi" despre ceva care expiră peste
 * douăzeci și trei de ore este adevărat, iar „mai ai zero zile" nu.
 */
export function daysLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (expiresAt === null) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  const left = daysLeft(expiresAt, now);
  return left !== null && left <= 0;
}

/** „mai are 3 zile" / „a expirat" / „—". */
export function expiryLabel(expiresAt: string | null, now: Date = new Date()): string {
  const left = daysLeft(expiresAt, now);
  if (left === null) return '—';
  if (left <= 0) return 'a expirat';
  if (left === 1) return 'mai are o zi';
  return `mai are ${left} zile`;
}

/**
 * De când o înscriere nerevendicată este îngrijorătoare.
 *
 * Aceeași socoteală ca în `sweep_unclaimed_onboardings()`, ca ecranul să
 * arate ce urmează să facă jobul, nu altceva.
 */
export function needsChasing(
  sentAt: string | null,
  status: AssistedStatus,
  now: Date = new Date(),
): boolean {
  if (status !== 'trimis' || sentAt === null) return false;
  const days = (now.getTime() - new Date(sentAt).getTime()) / 86_400_000;
  return days >= ALERT_DAYS;
}

export function daysUntilPurge(
  createdAt: string,
  now: Date = new Date(),
): number {
  const age = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(PURGE_DAYS - age));
}

// ---------------------------------------------------------------------
// Ce se scrie în formular
// ---------------------------------------------------------------------

export const MAX_CONSENT_NOTE = 500;

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  channel: string;
  consentDate: string;
  consentConfirmed: boolean;
}

export type FieldErrors = Partial<Record<keyof ContactInput, string>>;

/**
 * Ce refuzăm înainte să întrebăm baza.
 *
 * Nu pentru că baza nu ar refuza și ea — o face, și acolo este regula —
 * ci pentru că un refuz venit după trei câmpuri completate este un refuz
 * care se citește ca o defecțiune.
 */
export function validateContact(input: ContactInput, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};

  if (input.name.trim().length < 3) {
    errors.name = 'Scrie numele persoanei cu care ai vorbit.';
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(input.email.trim())) {
    errors.email = 'Adresa de e-mail nu pare validă.';
  }
  if (!/^\+?[0-9 ().-]{9,20}$/.test(input.phone.trim())) {
    errors.phone = 'Scrie un număr de telefon cu prefix.';
  }
  if (!isConsentChannel(input.channel)) {
    errors.channel = 'Alege cum ai obținut acordul.';
  }
  if (!input.consentConfirmed) {
    errors.consentConfirmed = 'Fără acordul firmei nu putem crea nimic.';
  }

  const date = new Date(`${input.consentDate}T12:00:00`);
  if (input.consentDate === '' || Number.isNaN(date.getTime())) {
    errors.consentDate = 'Pune data la care ai vorbit cu firma.';
  } else {
    const days = (now.getTime() - date.getTime()) / 86_400_000;
    if (days < -1) errors.consentDate = 'Data acordului nu poate fi în viitor.';
    else if (days > 90) errors.consentDate = 'Acordul este mai vechi de 90 de zile. Întreabă din nou.';
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Numărul la forma pe care o cere baza.
 *
 * Aceeași ca `normalisePhone` din validarea conturilor; repetată aici ca
 * ecranul să nu depindă de un modul de autentificare pentru o virgulă.
 */
export function normaliseOnboardingPhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('0')) return `+4${digits}`;
  return `+${digits}`;
}

// ---------------------------------------------------------------------
// Linkul
// ---------------------------------------------------------------------

/** Cum arată un token emis de bază: 64 de cifre hexazecimale. */
export function looksLikeToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value.trim());
}

export function claimPath(token: string): string {
  return `/revendica/${token}`;
}

export function claimUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}${claimPath(token)}`;
}
