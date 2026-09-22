import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARGO_CATEGORIES, CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { VEHICLE_CLASS_ORDER } from '@/lib/pricing';
import {
  OFFERED_CATEGORIES,
  RETIRED_CATEGORIES,
  VEHICLE_CATEGORIES,
  categoryMeta,
  matchesAutomatically,
  needsDescription,
  resolvePriceClass,
  suggestsClosedTransport,
  weightHintKg,
} from '@/lib/vehicle-categories';

/**
 * The categories, and the several places that must agree about them.
 *
 * A category that exists on the form and not in the filter, or in the
 * filter and not in matching, is the failure this file exists to make
 * loud. There used to be two lists — `CARGO_CATEGORIES` and a shorter
 * `FILTERABLE_CATEGORIES` — and the form showed one while the board
 * filtered by the other.
 */

/** Every migration, concatenated, so a later redefinition wins. */
function migrations(): string {
  const dir = 'supabase/migrations';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n');
}

describe('the offered list is the whole offer', () => {
  it('holds exactly the ten categories of the niche', () => {
    expect([...OFFERED_CATEGORIES]).toEqual([
      'autoturism',
      'autoutilitara',
      'microbuz',
      'motocicleta',
      'atv_quad',
      'rulota',
      'remorca',
      'cvadriciclu',
      'istoric',
      'altele',
    ]);
  });

  it('offers nothing that needs another kind of lorry', () => {
    // Boats, containers, machinery, lorries, tractor units. The
    // competitor lists them; they need different equipment and different
    // authorisations, and a board that offers what its carriers cannot
    // take loses the carriers first.
    for (const retired of RETIRED_CATEGORIES) {
      expect(OFFERED_CATEGORIES, retired).not.toContain(retired);
    }
  });

  it('accounts for every value the enum can hold, once', () => {
    // Offered plus retired is the whole enum: a value in neither list is
    // a value nobody decided about.
    const known = [...OFFERED_CATEGORIES, ...RETIRED_CATEGORIES].sort();
    expect(known).toEqual([...CARGO_CATEGORIES].sort());
    expect(new Set(known).size).toBe(known.length);
  });

  it('keeps SUV inside autoturism, and says so in the label', () => {
    expect(OFFERED_CATEGORIES).not.toContain('suv');
    expect(CARGO_CATEGORY_LABELS.autoturism).toBe('Autoturism / SUV');
  });
});

describe('every place that names a category names the same ones', () => {
  it('the labels cover every value, offered or retired', () => {
    // Wider than the offer on purpose: an old listing still renders.
    for (const code of CARGO_CATEGORIES) {
      expect(CARGO_CATEGORY_LABELS[code], code).toBeTruthy();
    }
  });

  it('the database agrees about what is still offered', () => {
    // `cargo_category_is_offered()` is the same list in SQL, because the
    // description rule is enforced there and needs it.
    const sql = migrations();
    const at = sql.lastIndexOf('create or replace function public.cargo_category_is_offered');
    expect(at, 'no migration defines cargo_category_is_offered').toBeGreaterThan(-1);
    const body = sql.slice(at, sql.indexOf('$fn$;', at));

    const inSql = [...body.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1]!)
      .filter((value) => (CARGO_CATEGORIES as readonly string[]).includes(value));
    expect(inSql.sort()).toEqual([...OFFERED_CATEGORIES].sort());
  });

  it('and about the label of every one of them', () => {
    const sql = migrations();
    const at = sql.lastIndexOf('create or replace function public.cargo_category_label');
    const body = sql.slice(at, sql.indexOf('$fn$;', at));
    for (const [code, label] of Object.entries(CARGO_CATEGORY_LABELS)) {
      expect(body, code).toContain(`when '${code}' then '${label}'`);
    }
  });

  it('nothing offers a category the form cannot show', () => {
    // Every source of a category list in src/ reads OFFERED_CATEGORIES.
    // A file that writes its own array is the drift this guards.
    const files = ['src/lib/request-form.ts', 'src/lib/departure-filters.ts', 'src/lib/listing-import.ts'];
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      expect(body, file).toContain('OFFERED_CATEGORIES');
    }
  });
});

describe('what each category carries with it', () => {
  it('a weight hint, for every one of them', () => {
    for (const code of OFFERED_CATEGORIES) {
      expect(weightHintKg(code), code).toBeGreaterThan(0);
      expect(categoryMeta(code)?.weightHint, code).toBeTruthy();
    }
  });

  it('with a figure in the sentence, except where there cannot be one', () => {
    for (const code of OFFERED_CATEGORIES) {
      if (code === 'altele') continue;
      expect(categoryMeta(code)?.weightHint, code).toMatch(/\d/);
    }
    // „Altceva" has no typical weight — that is what makes it „altceva".
    // Its sentence sends the person to the description instead, which is
    // the field that category actually depends on.
    expect(categoryMeta('altele')?.weightHint).toContain('descriere');
  });

  it('weights that are plausible for the thing named', () => {
    // A motorbike is not two tonnes and a minibus is not two hundred
    // kilograms. The point is to catch a copy-paste, not to be exact.
    expect(weightHintKg('motocicleta')).toBeLessThan(500);
    expect(weightHintKg('atv_quad')).toBeLessThan(700);
    expect(weightHintKg('remorca')).toBeLessThanOrEqual(750);
    expect(weightHintKg('microbuz')).toBeGreaterThan(2000);
    expect(weightHintKg('autoturism')).toBeGreaterThan(1000);
  });

  it('a price class the rates table actually has', () => {
    for (const category of VEHICLE_CATEGORIES) {
      expect(VEHICLE_CLASS_ORDER, category.code).toContain(category.priceClass);
    }
  });
});

describe('the price class a car resolves to', () => {
  it('follows the weight, which is the whole of the SUV argument', () => {
    expect(resolvePriceClass('autoturism', 1150)).toBe('hatchback');
    expect(resolvePriceClass('autoturism', 1500)).toBe('sedan');
    expect(resolvePriceClass('autoturism', 2300)).toBe('suv');
  });

  it('falls back to the category default without a weight', () => {
    expect(resolvePriceClass('autoturism', null)).toBe('sedan');
    expect(resolvePriceClass('autoturism', 0)).toBe('sedan');
  });

  it('leaves the other categories where they were put', () => {
    // Only a car splits by weight; a heavy motorbike is still a
    // motorbike as far as the rates go.
    expect(resolvePriceClass('motocicleta', 2500)).toBe('motocicleta');
    expect(resolvePriceClass('microbuz', 900)).toBe('autoutilitara');
  });
});

describe('the two categories that behave differently', () => {
  it('„Altceva" asks for a description and nothing else does', () => {
    expect(needsDescription('altele')).toBe(true);
    for (const code of OFFERED_CATEGORIES) {
      if (code === 'altele') continue;
      expect(needsDescription(code), code).toBe(false);
    }
  });

  it('and is never matched automatically', () => {
    // Matching deduces equipment from the category; for „Altceva" there
    // is nothing to deduce from.
    expect(matchesAutomatically('altele')).toBe(false);
    for (const code of OFFERED_CATEGORIES) {
      if (code === 'altele') continue;
      expect(matchesAutomatically(code), code).toBe(true);
    }
  });

  it('a retired category matches nothing either', () => {
    for (const code of RETIRED_CATEGORIES) {
      expect(matchesAutomatically(code), code).toBe(false);
    }
  });

  it('„Vehicul istoric" suggests closed transport and nothing else does', () => {
    expect(suggestsClosedTransport('istoric')).toBe(true);
    for (const code of OFFERED_CATEGORIES) {
      if (code === 'istoric') continue;
      expect(suggestsClosedTransport(code), code).toBe(false);
    }
  });

  it('but the suggestion never becomes a filter', () => {
    // A historic vehicle still matches carriers without a closed
    // trailer: cutting them out of a preference would empty the board,
    // and the client may well accept an open transporter.
    expect(matchesAutomatically('istoric')).toBe(true);
  });
});

describe('the Romanian the interface shows', () => {
  it('writes every label with its diacritics', () => {
    // „Autoutilitara" without the ă is the one that keeps coming back.
    expect(CARGO_CATEGORY_LABELS.autoutilitara).toBe('Autoutilitară');
    expect(CARGO_CATEGORY_LABELS.motocicleta).toBe('Motocicletă');
    expect(CARGO_CATEGORY_LABELS.rulota).toBe('Rulotă');
    expect(CARGO_CATEGORY_LABELS.remorca).toContain('ușoară');
    expect(CARGO_CATEGORY_LABELS.istoric).toContain('colecție');
  });

  it('says how heavy a light trailer may be, in the label', () => {
    // The limit is the category: above 750 kg it is a different
    // authorisation and a different job.
    expect(CARGO_CATEGORY_LABELS.remorca).toContain('750');
  });

  it('uses no emoji anywhere in a label', () => {
    for (const label of Object.values(CARGO_CATEGORY_LABELS)) {
      expect(label, label).toMatch(/^[\p{Letter}\p{Mark}\p{Number}\s/(),.-]+$/u);
    }
  });
});
