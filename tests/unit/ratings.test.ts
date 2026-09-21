import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_TEXT,
  CARRIER_SUBSCORES,
  CLIENT_SUBSCORES,
  DEFAULT_THRESHOLDS,
  MAX_COMMENT,
  SCORE_LABELS,
  blockedText,
  charsLeft,
  editWindowLeft,
  formatScore,
  percentLabel,
  publicAverage,
  ratingDeadline,
  sampleLabel,
  scoreLabel,
  subScoresFor,
  tooFewRatings,
  validateRating,
  type RatingDraft,
} from '@/lib/ratings';

/**
 * Partea de browser a regulilor de evaluare.
 *
 * Fiecare dintre ele este aplicată din nou în Postgres, de
 * `post_rating()` și de `recompute_company_reputation()`. Ce se câștigă
 * aici este un buton care lipsește în loc de unul care dă eroare, și
 * niște numere despre care pagina nu minte cât timp baza tace.
 *
 * Ultimele trei teste citesc migrarea înapoi. Sunt lente și urâte, și
 * există pentru că pragurile scrise în două locuri se depărtează în
 * tăcere: dacă fereastra devine 21 de zile în SQL și rămâne 14 aici,
 * nimic nu cade, iar oamenii văd un termen greșit până se plânge cineva.
 */

const MIGRATION = 'supabase/migrations/20260924100000_faza2_evaluari.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');

const NOW = new Date('2026-10-01T12:00:00Z');

function draft(over: Partial<RatingDraft> = {}): RatingDraft {
  return { score: 5, subScores: {}, comment: '', ...over };
}

describe('stelele au cuvinte, nu doar culoare', () => {
  it('fiecare notă are o etichetă', () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(SCORE_LABELS[n]).toBeTruthy();
    }
  });

  it('o notă din afara scalei se citește ca număr, nu ca „undefined"', () => {
    expect(scoreLabel(9)).toBe('9');
  });

  it('zecimalele se scriu cu virgulă', () => {
    expect(formatScore(4.5)).toBe('4,5');
    expect(formatScore(5)).toBe('5,0');
  });

  it('și nimic nu se inventează dintr-un null', () => {
    expect(formatScore(null)).toBeNull();
  });
});

describe('fiecare parte primește întrebările ei', () => {
  it('clientul este întrebat despre grija față de vehicul', () => {
    const keys = subScoresFor('client').map((s) => s.key);
    expect(keys).toContain('vehicle_care');
    expect(keys).not.toContain('info_accuracy');
  });

  it('transportatorul, despre informații și disponibilitate', () => {
    const keys = subScoresFor('carrier').map((s) => s.key);
    expect(keys).toContain('info_accuracy');
    expect(keys).toContain('handover_availability');
    expect(keys).not.toContain('vehicle_care');
  });

  it('punctualitatea și comunicarea se întreabă în ambele direcții', () => {
    for (const list of [CARRIER_SUBSCORES, CLIENT_SUBSCORES]) {
      const keys = list.map((s) => s.key);
      expect(keys).toContain('punctuality');
      expect(keys).toContain('communication');
    }
  });

  it('niciuna dintre cele două liste nu cere „payment"', () => {
    // Coloana există din faza 0 și rămâne citibilă, dar formularul nu o
    // mai cere — nu descrie niciuna dintre părțile fluxului ăstuia.
    const keys = [...CARRIER_SUBSCORES, ...CLIENT_SUBSCORES].map((s) => s.key as string);
    expect(keys).not.toContain('payment');
  });
});

describe('media se arată numai când înseamnă ceva', () => {
  it('sub trei evaluări nu se arată nicio cifră', () => {
    expect(publicAverage({ ratingAvg: 1, ratingCount: 2 })).toBeNull();
    expect(tooFewRatings({ ratingAvg: 1, ratingCount: 2 })).toBe(true);
  });

  it('de la trei în sus, da', () => {
    expect(publicAverage({ ratingAvg: 4.25, ratingCount: 3 })).toBe('4,3');
    expect(tooFewRatings({ ratingAvg: 4.25, ratingCount: 3 })).toBe(false);
  });

  it('pragul se poate schimba din setări, nu din cod', () => {
    expect(publicAverage({ ratingAvg: 5, ratingCount: 3 }, 10)).toBeNull();
    expect(publicAverage({ ratingAvg: 5, ratingCount: 10 }, 10)).toBe('5,0');
  });

  it('o firmă fără nicio evaluare nu are medie', () => {
    expect(publicAverage({ ratingAvg: null, ratingCount: 0 })).toBeNull();
  });
});

describe('procentele și eșantionul din spatele lor', () => {
  it('un procent lipsă nu devine zero', () => {
    expect(percentLabel(null)).toBeNull();
    expect(percentLabel(0)).toBe('0%');
  });

  it('acordul la unu', () => {
    expect(sampleLabel(1, 'o comandă', 'comenzi', 'comenzi')).toBe('dintr-o comandă');
  });

  it('și „de" de la douăzeci în sus', () => {
    expect(sampleLabel(12, 'o comandă', 'comenzi', 'comenzi')).toBe('din 12 comenzi');
    expect(sampleLabel(20, 'o comandă', 'comenzi', 'comenzi')).toBe('din 20 de comenzi');
    expect(sampleLabel(101, 'o comandă', 'comenzi', 'comenzi')).toBe('din 101 de comenzi');
  });
});

describe('termenul de evaluare', () => {
  it('spune data și cât a mai rămas', () => {
    const d = ratingDeadline('2026-10-11T12:00:00Z', NOW);
    expect(d?.passed).toBe(false);
    expect(d?.at).toContain('octombrie');
    expect(d?.left).toBe('10 zile');
  });

  it('numără zile întregi, nu zile începute', () => {
    // 71 de ore sunt două zile și 23 de ore. „Trei zile" ar promite o zi
    // pe care omul nu o are.
    expect(ratingDeadline('2026-10-04T11:00:00Z', NOW)?.left).toBe('2 zile');
    expect(ratingDeadline('2026-10-04T13:00:00Z', NOW)?.left).toBe('3 zile');
  });

  it('sub două zile numără în ore', () => {
    // La 47 de ore „o zi" ar fi și greșit, și în direcția proastă: sună
    // ca mai puțin timp decât are omul.
    expect(ratingDeadline('2026-10-03T11:00:00Z', NOW)?.left).toBe('47 de ore');
    expect(ratingDeadline('2026-10-01T15:00:00Z', NOW)?.left).toBe('3 ore');
  });

  it('o oră se scrie „o oră"', () => {
    expect(ratingDeadline('2026-10-01T13:30:00Z', NOW)?.left).toBe('o oră');
  });

  it('un termen trecut o spune, fără să numere înapoi', () => {
    const d = ratingDeadline('2026-09-30T12:00:00Z', NOW);
    expect(d?.passed).toBe(true);
    expect(d?.left).toBe('');
  });

  it('fără termen nu inventează unul', () => {
    expect(ratingDeadline(null, NOW)).toBeNull();
    expect(ratingDeadline('nu e o dată', NOW)).toBeNull();
  });
});

describe('fereastra de corectare', () => {
  it('spune cât a mai rămas din ea', () => {
    expect(editWindowLeft('2026-10-01T00:00:00Z', 48, NOW)).toBe('36 de ore');
  });

  it('sub o oră numără în minute', () => {
    expect(editWindowLeft('2026-09-29T12:30:00Z', 48, NOW)).toBe('30 de minute');
  });

  it('și după ea nu mai spune nimic', () => {
    expect(editWindowLeft('2026-09-28T12:00:00Z', 48, NOW)).toBeNull();
  });
});

describe('de ce nu poți evalua', () => {
  it('fiecare motiv are o propoziție', () => {
    for (const reason of Object.keys(BLOCKED_TEXT)) {
      expect(blockedText(reason)).toBeTruthy();
    }
  });

  it('un motiv necunoscut nu devine text tehnic pe ecran', () => {
    expect(blockedText('altceva')).toBeNull();
    expect(blockedText(null)).toBeNull();
  });

  it('propoziția despre dispută spune și ce urmează', () => {
    expect(BLOCKED_TEXT.disputed).toContain('după ce echipa o închide');
  });
});

describe('formularul', () => {
  it('cere nota generală', () => {
    expect(validateRating(draft({ score: null })).score).toBeTruthy();
    expect(validateRating(draft({ score: 0 })).score).toBeTruthy();
    expect(validateRating(draft({ score: 6 })).score).toBeTruthy();
  });

  it('acceptă un sub-scor lipsă, pentru că este opțional', () => {
    expect(validateRating(draft({ subScores: { punctuality: null } }))).toEqual({});
  });

  it('dar nu unul în afara scalei', () => {
    expect(validateRating(draft({ subScores: { punctuality: 7 } })).punctuality).toBeTruthy();
  });

  it('și oprește un comentariu prea lung', () => {
    expect(validateRating(draft({ comment: 'x'.repeat(MAX_COMMENT) }))).toEqual({});
    expect(validateRating(draft({ comment: 'x'.repeat(MAX_COMMENT + 1) })).comment).toBeTruthy();
  });

  it('contorul de caractere scade', () => {
    expect(charsLeft('')).toBe(MAX_COMMENT);
    expect(charsLeft('abc')).toBe(MAX_COMMENT - 3);
  });
});

describe('pragurile sunt aceleași ca în migrare', () => {
  it('fereastra de evaluare este 14 zile în amândouă', () => {
    expect(sql()).toMatch(/window_days integer not null default 14\b/);
    expect(DEFAULT_THRESHOLDS.windowDays).toBe(14);
  });

  it('fereastra de corectare este 48 de ore în amândouă', () => {
    expect(sql()).toMatch(/edit_hours integer not null default 48\b/);
    expect(DEFAULT_THRESHOLDS.editHours).toBe(48);
  });

  it('pragul de afișare a mediei este 3 în amândouă', () => {
    expect(sql()).toMatch(/min_public_ratings integer not null default 3\b/);
    expect(DEFAULT_THRESHOLDS.minPublicRatings).toBe(3);
  });

  it('pragurile de punctualitate și de rată de răspuns la fel', () => {
    expect(sql()).toMatch(/min_punctuality_orders integer not null default 3\b/);
    expect(sql()).toMatch(/min_response_sample integer not null default 5\b/);
    expect(DEFAULT_THRESHOLDS.minPunctualityOrders).toBe(3);
    expect(DEFAULT_THRESHOLDS.minResponseSample).toBe(5);
  });

  it('comentariul are aceeași limită de 500 în amândouă', () => {
    expect(sql()).toMatch(/length\(comment\) <= 500/);
    expect(MAX_COMMENT).toBe(500);
  });

  it('cele trei sub-scoruri noi există ca și coloane', () => {
    const text = sql();
    for (const column of ['vehicle_care', 'info_accuracy', 'handover_availability']) {
      expect(text).toContain(`add column ${column} integer check`);
    }
  });

  it('și migrarea nu mai scrie niciodată „payment"', () => {
    // Coloana rămâne, dar `post_rating` nu o mai completează. Dacă o
    // repune cineva, testul ăsta cade și întrebarea se pune din nou.
    const insert = sql().slice(sql().indexOf('insert into public.ratings'));
    const columnList = insert.slice(0, insert.indexOf('values'));
    expect(columnList).not.toContain('payment');
  });
});
