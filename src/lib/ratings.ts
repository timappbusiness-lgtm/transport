import type { Database } from './supabase/database.types';

/**
 * Evaluările și reputația, așa cum le citesc ecranele.
 *
 * Fără React și fără bază de date, pentru că aceleași trei întrebări se
 * pun pe șase ecrane și răspunsurile nu au voie să difere: cât de bine
 * stă firma asta, ce înseamnă numărul de lângă nume, și cât mai are omul
 * ca să evalueze.
 *
 * Fiecare formulă de aici este *aceeași* cu cea din
 * `recompute_company_reputation()`. Nu este o a doua implementare: baza
 * calculează numerele, fișierul ăsta doar hotărăște dacă se arată și cu
 * ce cuvinte. Unde apare totuși aritmetică — procentul rotunjit, pragul —
 * există un test care o compară cu migrarea.
 */

export type RatingRow = Database['public']['Tables']['ratings']['Row'];

// ---------------------------------------------------------------------
// Stelele
// ---------------------------------------------------------------------

/**
 * Ce înseamnă fiecare notă, în cuvinte.
 *
 * Cuvintele nu sunt decor. O linie de cinci stele galbene nu spune nimic
 * cuiva care nu distinge culorile și nimic unui cititor de ecran, iar
 * „Bine" citit cu voce tare este mai util decât „patru stele pline și una
 * goală". Ele sunt și eticheta accesibilă a fiecărui buton din formular.
 */
export const SCORE_LABELS: Record<number, string> = {
  1: 'Foarte slab',
  2: 'Slab',
  3: 'Acceptabil',
  4: 'Bine',
  5: 'Foarte bine',
};

export function scoreLabel(score: number): string {
  return SCORE_LABELS[score] ?? String(score);
}

/** „4,5" — cu virgulă, cum se scriu zecimalele în română. */
export function formatScore(value: number | null): string | null {
  if (value === null || Number.isNaN(value)) return null;
  return value.toFixed(1).replace('.', ',');
}

// ---------------------------------------------------------------------
// Sub-scorurile, pe partea lor
// ---------------------------------------------------------------------

export interface SubScore {
  key: 'punctuality' | 'communication' | 'vehicle_care' | 'info_accuracy' | 'handover_availability';
  label: string;
  /** Ce citește cineva care se uită la reputația firmei, nu la formular. */
  publicLabel: string;
}

/** Ce întreabă un client despre transportator. */
export const CARRIER_SUBSCORES: readonly SubScore[] = [
  { key: 'punctuality', label: 'Punctualitate', publicLabel: 'Punctualitate' },
  { key: 'communication', label: 'Comunicare', publicLabel: 'Comunicare' },
  { key: 'vehicle_care', label: 'Grija față de vehicul', publicLabel: 'Grija față de vehicul' },
];

/** Ce întreabă un transportator despre client. */
export const CLIENT_SUBSCORES: readonly SubScore[] = [
  { key: 'punctuality', label: 'Punctualitate', publicLabel: 'Punctualitate' },
  { key: 'communication', label: 'Comunicare', publicLabel: 'Comunicare' },
  {
    key: 'info_accuracy',
    label: 'Corectitudinea informațiilor',
    publicLabel: 'Informații corecte',
  },
  {
    key: 'handover_availability',
    label: 'Disponibilitate la predare',
    publicLabel: 'Disponibilitate',
  },
];

export type RatingSide = 'client' | 'carrier';

/**
 * Ce sub-scoruri i se arată părții ăsteia.
 *
 * `side` este partea celui care evaluează, nu a celui evaluat: un client
 * evaluează un transportator, deci primește întrebările despre
 * transportator.
 */
export function subScoresFor(side: RatingSide): readonly SubScore[] {
  return side === 'client' ? CARRIER_SUBSCORES : CLIENT_SUBSCORES;
}

export const MAX_COMMENT = 500;

// ---------------------------------------------------------------------
// Ce se arată public, și ce nu
// ---------------------------------------------------------------------

/**
 * Pragurile, așa cum le are baza în `rating_settings`.
 *
 * Nu sunt constante: sunt valorile implicite, folosite când pagina nu a
 * apucat să citească setările. Orice ecran care are rândul din baza de
 * date îl trimite mai departe, și atunci astea nu se ating.
 */
export const DEFAULT_THRESHOLDS = {
  minPublicRatings: 3,
  minPunctualityOrders: 3,
  minResponseSample: 5,
  windowDays: 14,
  editHours: 48,
} as const;

export interface Reputation {
  ratingAvg: number | null;
  ratingCount: number;
  punctuality: number | null;
  communication: number | null;
  vehicleCare: number | null;
  infoAccuracy: number | null;
  handover: number | null;
  completedAsCarrier: number;
  completedAsClient: number;
  punctualityPct: number | null;
  punctualitySample: number;
  responsePct: number | null;
  responseSample: number;
  disputesOpened12m: number;
  disputesResolved12m: number;
  verifiedSince: string | null;
  computedAt: string | null;
}

/**
 * Media, sau nimic.
 *
 * Sub prag nu se arată o cifră mai mică, se arată propoziția. O firmă cu
 * o singură evaluare de o stea nu este „1,0" — este o firmă despre care
 * nu știm încă nimic, iar diferența contează pentru cine citește.
 */
export function publicAverage(
  rep: Pick<Reputation, 'ratingAvg' | 'ratingCount'>,
  minPublic: number = DEFAULT_THRESHOLDS.minPublicRatings,
): string | null {
  if (rep.ratingAvg === null || rep.ratingCount < minPublic) return null;
  return formatScore(rep.ratingAvg);
}

/** Adevărat când firma are evaluări, dar prea puține ca să le mediem. */
export function tooFewRatings(
  rep: Pick<Reputation, 'ratingAvg' | 'ratingCount'>,
  minPublic: number = DEFAULT_THRESHOLDS.minPublicRatings,
): boolean {
  return rep.ratingCount < minPublic;
}

/**
 * Procentele, cu eșantionul lor.
 *
 * Baza pune deja `null` sub prag, iar funcția asta nu recalculează
 * pragul — l-ar putea aplica altfel. Se uită doar dacă are ce afișa.
 */
export function percentLabel(pct: number | null): string | null {
  return pct === null ? null : `${pct}%`;
}

/** „din 12 comenzi" / „dintr-o comandă" — acordul la 1 și „de" de la 20. */
export function sampleLabel(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `dintr-${one}`;
  if (n < 20) return `din ${n} ${few}`;
  return `din ${n} de ${many}`;
}

// ---------------------------------------------------------------------
// Timpul
// ---------------------------------------------------------------------

export interface Deadline {
  /** Data limită, formatată pentru citit. */
  at: string;
  /** Câte zile au mai rămas, în cuvinte. */
  left: string;
  passed: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATETIME_FMT = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string | null): string {
  if (value === null) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d);
}

export function formatMoment(value: string | null): string {
  if (value === null) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : DATETIME_FMT.format(d);
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `o ${one}`;
  if (n < 20) return `${n} ${few}`;
  return `${n} de ${many}`;
}

/**
 * „Poți evalua până la 12 octombrie" și cât mai e.
 *
 * Orele până la două zile, zilele după. La 47 de ore „o zi" ar fi și
 * greșit, și în direcția proastă — sună ca mai puțin timp decât are omul.
 * Aceeași regulă ca la termenul de confirmare a livrării, și din același
 * motiv.
 */
export function ratingDeadline(deadline: string | null, now: Date = new Date()): Deadline | null {
  if (deadline === null) return null;
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime())) return null;

  const minutes = Math.floor((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return { at: formatDate(deadline), left: '', passed: true };

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return { at: formatDate(deadline), left: plural(hours, 'oră', 'ore', 'ore'), passed: false };
  }
  return {
    at: formatDate(deadline),
    left: plural(Math.floor(hours / 24), 'zi', 'zile', 'zile'),
    passed: false,
  };
}

/** Cât mai poate fi corectată o evaluare, dacă mai poate. */
export function editWindowLeft(
  createdAt: string,
  editHours: number = DEFAULT_THRESHOLDS.editHours,
  now: Date = new Date(),
): string | null {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const ends = created.getTime() + editHours * 3_600_000;
  const minutes = Math.floor((ends - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return plural(minutes, 'minut', 'minute', 'minute');
  return plural(Math.floor(minutes / 60), 'oră', 'ore', 'ore');
}

// ---------------------------------------------------------------------
// De ce nu poate evalua
// ---------------------------------------------------------------------

export type BlockedReason =
  | 'not_completed'
  | 'disputed'
  | 'individual'
  | 'done'
  | 'window_closed';

/**
 * Propoziția pentru cineva care nu poate evalua.
 *
 * Un buton absent fără explicație este o pagină care pare stricată.
 * Fiecare motiv de aici spune și ce urmează, când urmează ceva.
 */
export const BLOCKED_TEXT: Record<BlockedReason, string> = {
  not_completed: 'Poți evalua după ce comanda este finalizată.',
  disputed: 'Comanda este în dispută. Poți evalua după ce echipa o închide.',
  individual: 'Clienții persoane fizice nu se evaluează.',
  done: 'Ai evaluat deja comanda asta.',
  window_closed: 'Perioada în care se putea evalua a trecut.',
};

export function blockedText(reason: string | null): string | null {
  if (reason === null) return null;
  return BLOCKED_TEXT[reason as BlockedReason] ?? null;
}

// ---------------------------------------------------------------------
// Validarea formularului
// ---------------------------------------------------------------------

export interface RatingDraft {
  score: number | null;
  subScores: Partial<Record<SubScore['key'], number | null>>;
  comment: string;
}

export function validateRating(draft: RatingDraft): Record<string, string> {
  const errors: Record<string, string> = {};

  if (draft.score === null || draft.score < 1 || draft.score > 5) {
    errors.score = 'Alege o notă de la 1 la 5.';
  }
  for (const [key, value] of Object.entries(draft.subScores)) {
    if (value !== null && value !== undefined && (value < 1 || value > 5)) {
      errors[key] = 'Nota este între 1 și 5.';
    }
  }
  if (draft.comment.length > MAX_COMMENT) {
    errors.comment = `Comentariul are cel mult ${MAX_COMMENT} de caractere.`;
  }
  return errors;
}

/** Câte caractere mai încap, pentru contorul de sub casetă. */
export function charsLeft(comment: string): number {
  return MAX_COMMENT - comment.length;
}
