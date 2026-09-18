import { COUNTRY_OPTIONS } from './vehicles';
import { FILTERABLE_CATEGORIES } from './departures';
import { MAX_WEIGHT_KG, type RequestDraft, type RequestField } from './request-form';

/**
 * Turning what a listing said into what the form holds.
 *
 * The rule the whole file exists to enforce: **nothing here is verified
 * data.** The edge function read a page's public metadata and a model
 * guessed at it, and both can be wrong in ways nobody notices — a 2018
 * that is a 2013, a Golf that is a Polo. So every value goes through a
 * check the form would have applied anyway, and anything that fails is
 * dropped rather than corrected.
 *
 * Dropping is always the right answer here. An empty box costs somebody
 * ten seconds. A wrong year they did not look at costs them a transport
 * quoted for a different car, and they find out when it arrives.
 */

/** A value the form accepted, and where it came from. */
export type ImportedField = Extract<
  RequestField,
  | 'make'
  | 'model'
  | 'year'
  | 'category'
  | 'fromCity'
  | 'fromCountry'
  | 'weightKg'
  | 'isRunning'
  | 'isDamaged'
>;

/** What the edge function returns, before any of it is believed. */
export interface ExtractionResult {
  ok: boolean;
  fields?: Record<string, string>;
  dropped?: string[];
  image_url?: string | null;
  remaining?: number;
  reason?: string;
}

/**
 * What the file input accepts.
 *
 * Here rather than next to the resizing, because the resizing imports
 * sharp and a client component that reaches for this would drag a
 * native module into the browser bundle.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((c) => c.code));
const CATEGORIES = new Set<string>(FILTERABLE_CATEGORIES);

/** The names the function uses, against the names the draft uses. */
const FIELD_NAMES: Record<string, ImportedField> = {
  make: 'make',
  model: 'model',
  year: 'year',
  category: 'category',
  from_city: 'fromCity',
  from_country: 'fromCountry',
  weight_kg: 'weightKg',
  is_running: 'isRunning',
  is_damaged: 'isDamaged',
};

function boolish(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (text === 'true' || text === 'da' || text === 'yes') return true;
  if (text === 'false' || text === 'nu' || text === 'no') return false;
  return null;
}

export interface AppliedImport {
  draft: RequestDraft;
  /** Which fields the form is now showing because something else filled them. */
  filled: ImportedField[];
}

/**
 * Applies what survived onto a draft, without ever overwriting typing.
 *
 * Somebody who typed "Golf" and then pasted a link meant the link to help,
 * not to argue. A field that already holds something keeps it.
 */
export function applyExtraction(
  draft: RequestDraft,
  fields: Record<string, string>,
  today: string,
): AppliedImport {
  const next: RequestDraft = { ...draft };
  const filled: ImportedField[] = [];

  const set = <K extends ImportedField>(key: K, value: RequestDraft[K]): void => {
    next[key] = value;
    filled.push(key);
  };

  for (const [rawKey, rawValue] of Object.entries(fields)) {
    const key = FIELD_NAMES[rawKey];
    if (key === undefined) continue;
    const value = String(rawValue ?? '').trim();
    if (value === '') continue;

    switch (key) {
      case 'make':
      case 'model': {
        if (draft[key].trim() !== '') break;
        if (value.length > 40) break;
        set(key, value);
        break;
      }

      case 'fromCity': {
        if (draft.fromCity.trim() !== '') break;
        if (value.length > 60) break;
        set('fromCity', value);
        break;
      }

      case 'year': {
        if (draft.year.trim() !== '') break;
        const year = Number(value);
        const maxYear = Number(today.slice(0, 4)) + 1;
        if (!Number.isInteger(year) || year < 1900 || year > maxYear) break;
        set('year', String(year));
        break;
      }

      case 'weightKg': {
        if (draft.weightKg.trim() !== '') break;
        const weight = Number(value);
        if (!Number.isInteger(weight) || weight <= 0 || weight > MAX_WEIGHT_KG) break;
        set('weightKg', String(weight));
        break;
      }

      case 'category': {
        if (!CATEGORIES.has(value)) break;
        // 'autoturism' is the default the form starts on, so a listing
        // that agrees with it has told us nothing worth a chip.
        if (value === draft.category) break;
        set('category', value as RequestDraft['category']);
        break;
      }

      case 'fromCountry': {
        const code = value.toUpperCase();
        if (!COUNTRY_CODES.has(code)) break;
        if (code === draft.fromCountry) break;
        set('fromCountry', code);
        break;
      }

      case 'isRunning': {
        const state = boolish(value);
        // Only a listing that says it does NOT run tells us anything: the
        // form already assumes a car that drives, and a silent advert is
        // not a promise.
        if (state !== false) break;
        set('isRunning', false);
        break;
      }

      case 'isDamaged': {
        const state = boolish(value);
        if (state !== true) break;
        // The note stays empty on purpose. What is damaged is the one
        // thing a carrier prices on, and it is not ours to invent — the
        // condition step asks for it in the person's own words.
        set('isDamaged', true);
        break;
      }
    }
  }

  return { draft: next, filled };
}

/**
 * One sentence per refusal, and never "încearcă din nou" on a refusal
 * that trying again cannot change.
 *
 * A person who is told to retry will retry, and every retry on a
 * permanent refusal spends a slot they could have used on a link that
 * would have worked.
 */
export interface Refusal {
  /** What happened, in one line. */
  message: string;
  /** Whether a second attempt could possibly go differently. */
  retryable: boolean;
}

export const REFUSALS: Record<string, Refusal> = {
  robots_disallow: {
    message: 'Site-ul acela nu permite citirea automată a paginilor. Completează câmpurile manual.',
    retryable: false,
  },
  fetch_failed: {
    message: 'Nu am putut deschide linkul. Verifică-l sau completează manual.',
    retryable: true,
  },
  fetch_timeout: {
    message: 'Pagina a răspuns prea greu. Mai încearcă o dată sau completează manual.',
    retryable: true,
  },
  http_error: {
    message: 'Pagina nu ne-a răspuns. Poate a expirat anunțul sau site-ul ne refuză.',
    retryable: false,
  },
  not_html: {
    message: 'Linkul nu duce la o pagină de anunț.',
    retryable: false,
  },
  too_large: {
    message: 'Fișierul este prea mare. Încearcă o poză mai mică de 6 MB.',
    retryable: true,
  },
  no_metadata: {
    message: 'Pagina nu spune nimic despre vehicul în formatul pe care îl putem citi.',
    retryable: false,
  },
  model_error: {
    message: 'Ceva nu a mers la citire. Mai încearcă o dată.',
    retryable: true,
  },
  model_refused: {
    message: 'Nu am putut citi conținutul acela.',
    retryable: false,
  },
  bad_request: {
    message: 'Linkul nu pare valid. Trebuie să înceapă cu https:// și să ducă la un anunț public.',
    retryable: false,
  },
  daily_limit: {
    message:
      'Ai atins limita de completări automate pe ziua de azi. Revino mâine sau completează câmpurile manual — formularul merge la fel.',
    retryable: false,
  },
  budget: {
    message:
      'Completarea automată e oprită temporar. Completează câmpurile manual — formularul merge la fel.',
    retryable: false,
  },
  disabled: {
    message: 'Completarea automată nu este disponibilă acum. Completează câmpurile manual.',
    retryable: false,
  },
  anonymous_unavailable: {
    message: 'Pentru completare automată intră în cont. Fără cont, completează câmpurile manual.',
    retryable: false,
  },
  unknown: {
    message: 'Ceva nu a mers. Completează câmpurile manual — formularul merge la fel.',
    retryable: true,
  },
};

export function refusalFor(reason: string | undefined): Refusal {
  return REFUSALS[reason ?? 'unknown'] ?? REFUSALS.unknown!;
}

/**
 * Whether a link is worth sending at all.
 *
 * The cheap half of the check the edge function does properly. Catching
 * "nu e link" in the browser spares a slot; everything that matters —
 * the private ranges, the redirects — is decided on the server, because
 * this one runs where anybody can change it.
 */
export function looksLikeListingUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.length > 2048) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}
