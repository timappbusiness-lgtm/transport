import { describe, expect, it } from 'vitest';
import {
  isDurationDays,
  durationOrDefault,
  DURATION_OPTIONS,
  CATEGORY_FROM_CLASS,
  DRAFT_STORAGE_KEY,
  MAX_WEIGHT_KG,
  REQUEST_STEPS,
  STEP_FIELDS,
  coordinatesFor,
  draftFromPrefill,
  emptyDraft,
  estimatedKm,
  firstStepWithError,
  isoToday,
  parseDraft,
  serialiseDraft,
  validateDraft,
  validateStep,
  type RequestDraft,
} from '@/lib/request-form';
import { EMPTY_PREFILL } from '@/lib/price-prefill';

/**
 * Every rule here has a twin in `create_cargo_request`. These pin the
 * frontend half: that a person is told before the round trip, that a draft
 * survives the trip through sign-up, and that nothing arriving from storage
 * is believed on sight.
 */

const TODAY = '2026-09-17';

function draft(over: Partial<RequestDraft> = {}): RequestDraft {
  return {
    ...emptyDraft(),
    fromCity: 'München',
    fromCountry: 'DE',
    toCity: 'Cluj-Napoca',
    toCountry: 'RO',
    loadingFrom: '2026-09-25',
    make: 'Volkswagen',
    model: 'Golf',
    year: '2018',
    contactName: 'Ana Pop',
    contactPhone: '+40722000111',
    ...over,
  };
}

describe('validateDraft', () => {
  it('accepts a filled-in request', () => {
    expect(validateDraft(draft(), TODAY)).toEqual({});
  });

  it('refuses a loading date that has passed', () => {
    const errors = validateDraft(draft({ loadingFrom: '2026-09-16' }), TODAY);
    expect(errors.loadingFrom).toMatch(/a trecut/i);
  });

  it('accepts today itself', () => {
    expect(validateDraft(draft({ loadingFrom: TODAY }), TODAY).loadingFrom).toBeUndefined();
  });

  it('refuses a window that runs backwards', () => {
    const errors = validateDraft(draft({ loadingFrom: '2026-09-25', loadingTo: '2026-09-20' }), TODAY);
    expect(errors.loadingTo).toBeDefined();
  });

  it('refuses a date that matches the shape but is not one', () => {
    expect(validateDraft(draft({ loadingFrom: '2026-02-31' }), TODAY).loadingFrom).toBeDefined();
  });

  it('allows next year but not the one after', () => {
    expect(validateDraft(draft({ year: '2027' }), TODAY).year).toBeUndefined();
    expect(validateDraft(draft({ year: '2028' }), TODAY).year).toBeDefined();
  });

  it('refuses a year that is not a whole number', () => {
    expect(validateDraft(draft({ year: '2018.5' }), TODAY).year).toBeDefined();
    expect(validateDraft(draft({ year: '' }), TODAY).year).toBeDefined();
  });

  it('leaves the weight optional, and caps it when given', () => {
    expect(validateDraft(draft({ weightKg: '' }), TODAY).weightKg).toBeUndefined();
    expect(validateDraft(draft({ weightKg: '1400' }), TODAY).weightKg).toBeUndefined();
    expect(validateDraft(draft({ weightKg: '0' }), TODAY).weightKg).toBeDefined();
    expect(
      validateDraft(draft({ weightKg: String(MAX_WEIGHT_KG + 1) }), TODAY).weightKg,
    ).toBeDefined();
  });

  it('asks what is damaged only when there is damage', () => {
    expect(validateDraft(draft({ isDamaged: false }), TODAY).damageNotes).toBeUndefined();
    expect(validateDraft(draft({ isDamaged: true }), TODAY).damageNotes).toBeDefined();
    expect(
      validateDraft(draft({ isDamaged: true, damageNotes: 'Aripa dreaptă lovită' }), TODAY)
        .damageNotes,
    ).toBeUndefined();
  });

  it('requires a telephone number and leaves the e-mail optional', () => {
    expect(validateDraft(draft({ contactPhone: '' }), TODAY).contactPhone).toBeDefined();
    expect(validateDraft(draft({ contactEmail: '' }), TODAY).contactEmail).toBeUndefined();
    expect(validateDraft(draft({ contactEmail: 'nu-e-adresa' }), TODAY).contactEmail).toBeDefined();
  });
});

describe('steps', () => {
  it('checks only its own fields', () => {
    // The route step must not complain about a telephone number nobody has
    // been asked for yet.
    const errors = validateStep(draft({ contactPhone: '', fromCity: '' }), 'ruta', TODAY);
    expect(errors.fromCity).toBeDefined();
    expect(errors.contactPhone).toBeUndefined();
  });

  it('covers every field of the draft between them', () => {
    const covered = new Set(REQUEST_STEPS.flatMap((step) => [...STEP_FIELDS[step]]));
    for (const field of Object.keys(emptyDraft())) {
      expect(covered.has(field as keyof RequestDraft)).toBe(true);
    }
  });

  it('points at the first step that is not finished', () => {
    expect(firstStepWithError(draft(), TODAY)).toBeNull();
    expect(firstStepWithError(draft({ contactPhone: '' }), TODAY)).toBe('contact');
    expect(firstStepWithError(draft({ make: '', contactPhone: '' }), TODAY)).toBe('vehicul');
  });
});

describe('draftFromPrefill', () => {
  it("carries the calculator's route and service across", () => {
    const result = draftFromPrefill({
      ...EMPTY_PREFILL,
      from: { name: 'München', region: 'Bavaria', country: 'DE', lat: 48.1351, lng: 11.582 },
      to: { name: 'Cluj-Napoca', region: 'Cluj', country: 'RO', lat: 46.7712, lng: 23.6236 },
      vehicleClass: 'suv',
      express: true,
    });
    expect(result.fromCity).toBe('München');
    expect(result.fromCountry).toBe('DE');
    expect(result.toCity).toBe('Cluj-Napoca');
    expect(result.category).toBe('autoturism');
    expect(result.serviceType).toBe('expres');
  });

  it('does not contradict the estimate it came from', () => {
    // The calculator priced a vehicle that does not start. Leaving the
    // wheels and the steering at yes would tell the carrier the opposite.
    const result = draftFromPrefill({ ...EMPTY_PREFILL, isRunning: false });
    expect(result.isRunning).toBe(false);
    expect(result.wheelsTurn).toBe(false);
    expect(result.steeringWorks).toBe(false);
  });

  it('leaves an empty link as an empty form', () => {
    expect(draftFromPrefill(EMPTY_PREFILL)).toEqual(emptyDraft());
  });

  it('maps every calculator class onto a real category', () => {
    for (const category of Object.values(CATEGORY_FROM_CLASS)) {
      expect(validateDraft(draft({ category }), TODAY).category).toBeUndefined();
    }
  });
});

describe('the draft that survives a sign-in', () => {
  it('goes there and back', () => {
    const original = draft({ description: 'Mașina e în parcarea din spate.' });
    expect(parseDraft(serialiseDraft(original))).toEqual(original);
  });

  it('carries a version in the key', () => {
    expect(DRAFT_STORAGE_KEY).toMatch(/\.v\d+$/);
  });

  it('never throws on whatever is in storage', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('nu e json')).toBeNull();
    expect(parseDraft('"text"')).toBeNull();
    expect(parseDraft('null')).toBeNull();
    expect(parseDraft('[1,2,3]')).not.toBeNull();
  });

  it('drops a field whose type is wrong rather than rendering it', () => {
    const result = parseDraft(JSON.stringify({ make: 42, model: 'Golf', isRunning: 'da' }));
    expect(result?.make).toBe('');
    expect(result?.model).toBe('Golf');
    expect(result?.isRunning).toBe(true);
  });

  it('refuses an enum that storage invented', () => {
    const result = parseDraft(
      JSON.stringify({ category: 'elicopter', serviceType: 'gratis' }),
    );
    expect(result?.category).toBe('autoturism');
    expect(result?.serviceType).toBe('pe_sens');
  });

  it('does not let a stored value grow without limit', () => {
    const result = parseDraft(JSON.stringify({ description: 'a'.repeat(50_000) }));
    expect(result?.description.length).toBeLessThanOrEqual(1200);
  });
});

describe('coordinates', () => {
  it('finds a city the list knows', () => {
    expect(coordinatesFor('Cluj-Napoca', 'RO')?.lat).toBeCloseTo(46.7712, 3);
  });

  it('forgives diacritics and case', () => {
    expect(coordinatesFor('cluj-napoca', 'ro')).not.toBeNull();
    expect(coordinatesFor('Timisoara', 'RO')).not.toBeNull();
  });

  it('says nothing for a town it does not know', () => {
    // Most cars are collected from somewhere smaller than a county seat.
    // The request is still valid; it just has no distance on its card.
    expect(coordinatesFor('Mizil', 'RO')).toBeNull();
    expect(coordinatesFor('', 'RO')).toBeNull();
  });
});

describe('the distance the route step shows', () => {
  const MUNCHEN = { lat: 48.1374, lng: 11.5755 };
  const CLUJ = { lat: 46.7712, lng: 23.6236 };

  it('waits for both places', () => {
    // A typed name has no coordinates, and a guessed distance is an
    // invented number.
    expect(estimatedKm(MUNCHEN, null)).toBeNull();
    expect(estimatedKm(null, CLUJ)).toBeNull();
  });

  it('is the straight line in whole kilometres, like the board', () => {
    // estimated_km in the database is round(distance_km(...)), with no
    // road factor: the number on the form is the one on the card.
    const km = estimatedKm(MUNCHEN, CLUJ);
    expect(Number.isInteger(km)).toBe(true);
    expect(km).toBeGreaterThan(900);
    expect(km).toBeLessThan(960);
  });
});

describe('isoToday', () => {
  it('uses the local day, not the UTC one', () => {
    // 01:30 in Bucharest on the 18th is 22:30 UTC on the 17th. A person
    // choosing "today" must not be told the date has passed.
    const localMidnightish = new Date(2026, 8, 18, 1, 30);
    expect(isoToday(localMidnightish)).toBe('2026-09-18');
  });

  it('pads the month and the day', () => {
    expect(isoToday(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('how long the request stays on the board', () => {
  it('starts at the fourteen days that used to be hardcoded', () => {
    expect(emptyDraft().durationDays).toBe('14');
  });

  it('accepts the four the column accepts', () => {
    for (const days of DURATION_OPTIONS) {
      expect(isDurationDays(String(days))).toBe(true);
      expect(validateDraft(draft({ durationDays: String(days) }), TODAY).durationDays)
        .toBeUndefined();
    }
  });

  it('refuses a fifth, which is what an old saved draft would carry', () => {
    expect(isDurationDays('365')).toBe(false);
    expect(validateDraft(draft({ durationDays: '365' }), TODAY).durationDays).toBeDefined();
    expect(validateDraft(draft({ durationDays: '' }), TODAY).durationDays).toBeDefined();
  });

  it('falls back rather than sending nonsense to the database', () => {
    expect(durationOrDefault('7')).toBe(7);
    expect(durationOrDefault('365')).toBe(14);
    expect(durationOrDefault('')).toBe(14);
  });
});
