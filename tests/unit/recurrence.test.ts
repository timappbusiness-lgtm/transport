import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_EVERY_N,
  MAX_SERIES_DAYS,
  addDays,
  daysBetween,
  describe as describeRule,
  expand,
  ruleHasErrors,
  toIso,
  upcoming,
  validateRule,
  weekdayOf,
  type RecurrenceRule,
} from '@/lib/recurrence';

/**
 * Regula de repetare.
 *
 * Testul care contează cel mai mult este cel cu ora de vară: în
 * România ceasul se dă înainte în ultima duminică din martie, iar acea
 * zi are 23 de ore. O aritmetică făcută pe milisecunde ar sări o zi sau
 * ar repeta una, și s-ar vedea o dată pe an, într-o duminică.
 */

const MIGRATION = 'supabase/migrations/20260927100000_serii_cereri_private_favoriti.sql';
const sql = () => readFileSync(MIGRATION, 'utf8');

function rule(over: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    kind: 'saptamanal',
    weekdays: [2, 4],
    everyNDays: null,
    startsOn: '2026-10-01',
    endsOn: '2026-10-31',
    ...over,
  };
}

describe('zilele săptămânii', () => {
  it('scoate exact zilele cerute', () => {
    const days = expand(rule({ weekdays: [2, 4] }));
    expect(days.every((d) => [2, 4].includes(weekdayOf(d)))).toBe(true);
    expect(days.length).toBeGreaterThan(6);
  });

  it('numerotează ca Postgres: 0 este duminică', () => {
    // 4 octombrie 2026 este o duminică.
    expect(weekdayOf('2026-10-04')).toBe(0);
    expect(weekdayOf('2026-10-05')).toBe(1);
    expect(weekdayOf('2026-10-10')).toBe(6);
  });

  it('nu scoate nimic pentru o listă goală', () => {
    expect(expand(rule({ weekdays: [] }))).toEqual([]);
  });

  it('respectă data de sfârșit', () => {
    const days = expand(rule({ endsOn: '2026-10-08' }));
    expect(days.every((d) => d <= '2026-10-08')).toBe(true);
  });

  it('și marginea de sus dată separat', () => {
    const days = expand(rule(), '2026-10-10');
    expect(days.every((d) => d <= '2026-10-10')).toBe(true);
  });
});

describe('la fiecare N zile', () => {
  it('păstrează pasul, ancorat la început', () => {
    const days = expand(rule({ kind: 'la_n_zile', weekdays: [], everyNDays: 3 }));
    expect(days[0]).toBe('2026-10-01');
    expect(days[1]).toBe('2026-10-04');
    expect(days[2]).toBe('2026-10-07');
    expect(days.every((d) => daysBetween('2026-10-01', d) % 3 === 0)).toBe(true);
  });

  it('„la fiecare zi" înseamnă fiecare zi', () => {
    const days = expand(rule({
      kind: 'la_n_zile', weekdays: [], everyNDays: 1,
      startsOn: '2026-10-01', endsOn: '2026-10-05',
    }));
    expect(days).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ]);
  });

  it('un pas lipsă se citește ca unu, nu ca o împărțire la zero', () => {
    const days = expand(rule({
      kind: 'la_n_zile', weekdays: [], everyNDays: null,
      startsOn: '2026-10-01', endsOn: '2026-10-03',
    }));
    expect(days).toHaveLength(3);
  });
});

describe('ora de vară', () => {
  // România trece la ora de vară în ultima duminică din martie (29
  // martie 2026) și înapoi în ultima duminică din octombrie (25
  // octombrie 2026). Ambele zile sunt duminici, deci o regulă
  // săptămânală pe duminică trece exact prin ele.
  it('nu sare și nu repetă ziua în care se dă ceasul înainte', () => {
    const days = expand(rule({
      weekdays: [0], startsOn: '2026-03-01', endsOn: '2026-04-30',
    }));
    expect(days).toContain('2026-03-29');
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((d) => weekdayOf(d) === 0)).toBe(true);
  });

  it('nici în cea în care se dă înapoi', () => {
    const days = expand(rule({
      weekdays: [0], startsOn: '2026-10-01', endsOn: '2026-11-30',
    }));
    expect(days).toContain('2026-10-25');
    expect(new Set(days).size).toBe(days.length);
  });

  it('și un pas de N zile trece peste ambele fără să se clatine', () => {
    const days = expand(rule({
      kind: 'la_n_zile', weekdays: [], everyNDays: 7,
      startsOn: '2026-03-22', endsOn: '2026-04-12',
    }));
    expect(days).toEqual(['2026-03-22', '2026-03-29', '2026-04-05', '2026-04-12']);
  });

  it('adunarea de zile rămâne pe zile', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });
});

describe('următoarele plecări', () => {
  it('pleacă de azi, nu de la începutul seriei', () => {
    const next = upcoming(rule({ startsOn: '2026-09-01' }), '2026-10-06', 3);
    expect(next.every((d) => d >= '2026-10-06')).toBe(true);
    expect(next).toHaveLength(3);
  });

  it('se opresc la câte s-au cerut', () => {
    expect(upcoming(rule(), '2026-10-01', 2)).toHaveLength(2);
  });

  it('și nu inventează nimic după sfârșit', () => {
    expect(upcoming(rule({ endsOn: '2026-10-02' }), '2026-10-05', 5)).toEqual([]);
  });

  it('o limită oprește o regulă scrisă greșit', () => {
    const days = expand(
      rule({ kind: 'la_n_zile', weekdays: [], everyNDays: 1, endsOn: '2030-01-01' }),
      undefined,
      10,
    );
    expect(days).toHaveLength(10);
  });
});

describe('cum se citește regula', () => {
  it('o zi, la singular', () => {
    expect(describeRule(rule({ weekdays: [2] }))).toBe('În fiecare marți');
  });

  it('două, cu „și"', () => {
    expect(describeRule(rule({ weekdays: [2, 4] }))).toBe('În fiecare marți și joi');
  });

  it('trei, cu virgulă și „și"', () => {
    expect(describeRule(rule({ weekdays: [1, 3, 5] })))
      .toBe('În fiecare luni, miercuri și vineri');
  });

  it('în ordinea săptămânii, oricum ar fi bifate', () => {
    expect(describeRule(rule({ weekdays: [5, 1] }))).toBe('În fiecare luni și vineri');
  });

  it('și pasul de zile', () => {
    expect(describeRule(rule({ kind: 'la_n_zile', weekdays: [], everyNDays: 3 })))
      .toBe('La fiecare 3 zile');
    expect(describeRule(rule({ kind: 'la_n_zile', weekdays: [], everyNDays: 1 })))
      .toBe('În fiecare zi');
  });

  it('spune când nu are ce spune', () => {
    expect(describeRule(rule({ weekdays: [] }))).toBe('Fără zile alese');
  });
});

describe('ce refuzăm înainte de bază', () => {
  const today = '2026-10-01';

  it('o regulă întreagă trece', () => {
    expect(ruleHasErrors(validateRule(rule(), today))).toBe(false);
  });

  it('săptămânal fără zile, nu', () => {
    expect(validateRule(rule({ weekdays: [] }), today).weekdays).toBeDefined();
  });

  it('nici un pas lipsă', () => {
    expect(validateRule(rule({ kind: 'la_n_zile', weekdays: [], everyNDays: null }), today)
      .everyNDays).toBeDefined();
  });

  it('nici unul prea mare', () => {
    expect(validateRule(
      rule({ kind: 'la_n_zile', weekdays: [], everyNDays: MAX_EVERY_N + 1 }), today,
    ).everyNDays).toBeDefined();
  });

  it('un sfârșit în trecut este refuzat', () => {
    expect(validateRule(rule({ endsOn: '2026-09-01' }), today).endsOn).toContain('trecut');
  });

  it('și unul peste un an', () => {
    expect(validateRule(rule({ endsOn: '2028-01-01' }), today).endsOn)
      .toContain('cel mult un an');
    expect(MAX_SERIES_DAYS).toBe(365);
  });

  it('un sfârșit înaintea începutului, la fel', () => {
    expect(validateRule(rule({ startsOn: '2026-10-20', endsOn: '2026-10-10' }), today).endsOn)
      .toBeDefined();
  });
});

// ---------------------------------------------------------------------
// Aceeași socoteală ca în Postgres
//
// `recurrence_dates()` din migrare și `expand()` de aici răspund la
// aceeași întrebare. Nu se pot compara rulând SQL de aici, deci ce se
// compară este forma: aceeași convenție pentru zilele săptămânii,
// aceeași ancorare a pasului, aceleași margini.
// ---------------------------------------------------------------------
describe('migrarea spune același lucru', () => {
  it('numără zilele săptămânii cu extract(dow), ca `weekdayOf`', () => {
    expect(sql()).toContain('extract(dow from d)::smallint = any');
  });

  it('ancorează pasul la începutul intervalului', () => {
    expect(sql()).toContain("(d::date - p_from) % greatest(coalesce(p_every_n_days, 1), 1) = 0");
  });

  it('lucrează pe `date`, nu pe momente', () => {
    const text = sql();
    expect(text).toContain('returns setof date');
    expect(text).toContain("generate_series(p_from, p_to, interval '1 day')");
  });

  it('și nu generează niciodată în trecut', () => {
    expect(sql()).toContain('greatest(coalesce(v_series.generated_through + 1, v_series.starts_on), p_now)');
  });
});

describe('toIso', () => {
  it('întoarce ziua, fără oră', () => {
    expect(toIso(Date.parse('2026-10-01T12:00:00.000Z'))).toBe('2026-10-01');
  });
});
