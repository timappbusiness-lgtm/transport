import { describe, expect, it } from 'vitest';
import {
  applyExtraction,
  looksLikeListingUrl,
  REFUSALS,
  refusalFor,
} from '@/lib/listing-import';
import { emptyDraft, validateDraft, type RequestDraft } from '@/lib/request-form';

const TODAY = '2026-09-18';

function draftWith(overrides: Partial<RequestDraft> = {}): RequestDraft {
  return { ...emptyDraft(), ...overrides };
}

describe('applyExtraction', () => {
  it('fills the empty fields and says which it filled', () => {
    const { draft, filled } = applyExtraction(
      emptyDraft(),
      { make: 'Volkswagen', model: 'Golf', year: '2018', from_city: 'Cluj-Napoca' },
      TODAY,
    );

    expect(draft.make).toBe('Volkswagen');
    expect(draft.model).toBe('Golf');
    expect(draft.year).toBe('2018');
    expect(draft.fromCity).toBe('Cluj-Napoca');
    expect(filled.sort()).toEqual(['fromCity', 'make', 'model', 'year']);
  });

  it('never argues with something already typed', () => {
    const typed = draftWith({ make: 'Dacia', model: 'Logan' });
    const { draft, filled } = applyExtraction(
      typed,
      { make: 'Volkswagen', model: 'Golf', year: '2018' },
      TODAY,
    );

    expect(draft.make).toBe('Dacia');
    expect(draft.model).toBe('Logan');
    expect(draft.year).toBe('2018');
    expect(filled).toEqual(['year']);
  });

  // Every one of these is a value the form would have refused, and a value
  // shown in a box the person then has to notice and fix.
  it('drops a year outside the range the form accepts', () => {
    for (const year of ['1899', '2099', 'douămiiopt', '20 18', '']) {
      const { draft, filled } = applyExtraction(emptyDraft(), { year }, TODAY);
      expect(draft.year, year).toBe('');
      expect(filled, year).toEqual([]);
    }
  });

  it('accepts next year, because a car can be one', () => {
    const { draft } = applyExtraction(emptyDraft(), { year: '2027' }, TODAY);
    expect(draft.year).toBe('2027');
  });

  it('drops a weight the form would refuse', () => {
    for (const weight of ['0', '-500', '90000', '1.5t', 'grea']) {
      const { draft } = applyExtraction(emptyDraft(), { weight_kg: weight }, TODAY);
      expect(draft.weightKg, weight).toBe('');
    }
    expect(applyExtraction(emptyDraft(), { weight_kg: '1400' }, TODAY).draft.weightKg).toBe('1400');
  });

  it('drops a category that is not on the board', () => {
    const { draft, filled } = applyExtraction(emptyDraft(), { category: 'elicopter' }, TODAY);
    expect(draft.category).toBe('autoturism');
    expect(filled).toEqual([]);
  });

  it('drops a country we do not offer', () => {
    const { draft } = applyExtraction(emptyDraft(), { from_country: 'ZZ' }, TODAY);
    expect(draft.fromCountry).toBe('RO');
    expect(applyExtraction(emptyDraft(), { from_country: 'de' }, TODAY).draft.fromCountry).toBe('DE');
  });

  it('does not chip a value that matches the default it replaced', () => {
    // Filling 'autoturism' over 'autoturism' tells the person nothing and
    // makes the form look like it knows more than it does.
    const { filled } = applyExtraction(
      emptyDraft(),
      { category: 'autoturism', from_country: 'RO' },
      TODAY,
    );
    expect(filled).toEqual([]);
  });

  it('marks a category it actually changed', () => {
    const { draft, filled } = applyExtraction(emptyDraft(), { category: 'motocicleta' }, TODAY);
    expect(draft.category).toBe('motocicleta');
    expect(filled).toEqual(['category']);
  });

  it('a name longer than the field holds is dropped, not truncated', () => {
    const { draft } = applyExtraction(emptyDraft(), { make: 'x'.repeat(60) }, TODAY);
    expect(draft.make).toBe('');
  });
});

describe('what an advert does not say', () => {
  it('only a listing that says it does not run turns the switch off', () => {
    expect(applyExtraction(emptyDraft(), { is_running: 'false' }, TODAY).draft.isRunning).toBe(false);
    // Silence is not a promise that it drives.
    expect(applyExtraction(emptyDraft(), { is_running: 'true' }, TODAY).draft.isRunning).toBe(true);
    expect(applyExtraction(emptyDraft(), { is_running: 'true' }, TODAY).filled).toEqual([]);
  });

  it('damage is recorded without the note being invented', () => {
    const { draft, filled } = applyExtraction(emptyDraft(), { is_damaged: 'true' }, TODAY);
    expect(draft.isDamaged).toBe(true);
    expect(draft.damageNotes).toBe('');
    expect(filled).toEqual(['isDamaged']);
  });

  it('and the form then asks the person what is damaged', () => {
    const { draft } = applyExtraction(emptyDraft(), { is_damaged: 'true' }, TODAY);
    expect(validateDraft(draft, TODAY).damageNotes).toBe('Scrie pe scurt ce este avariat.');
  });

  it('an advert that does not mention damage does not clear the flag either', () => {
    const declared = draftWith({ isDamaged: true, damageNotes: 'aripă stânga' });
    const { draft } = applyExtraction(declared, { make: 'Ford' }, TODAY);
    expect(draft.isDamaged).toBe(true);
    expect(draft.damageNotes).toBe('aripă stânga');
  });
});

describe('a full import still has to pass the form', () => {
  it('leaves the route and the contact for the person', () => {
    const { draft } = applyExtraction(
      emptyDraft(),
      {
        make: 'Audi',
        model: 'A4',
        year: '2019',
        category: 'autoturism',
        from_city: 'Timișoara',
        from_country: 'RO',
      },
      TODAY,
    );

    const errors = validateDraft(draft, TODAY);
    // Nothing a listing can know: where it is going, when, and who to call.
    expect(errors.toCity).toBeDefined();
    expect(errors.loadingFrom).toBeDefined();
    expect(errors.contactPhone).toBeDefined();
    // And nothing it filled is an error.
    expect(errors.make).toBeUndefined();
    expect(errors.model).toBeUndefined();
    expect(errors.year).toBeUndefined();
    expect(errors.fromCity).toBeUndefined();
  });

  it('an empty extraction changes nothing at all', () => {
    const before = emptyDraft();
    const { draft, filled } = applyExtraction(before, {}, TODAY);
    expect(draft).toEqual(before);
    expect(filled).toEqual([]);
  });

  it('a field nobody defined is ignored rather than written through', () => {
    const { draft, filled } = applyExtraction(
      emptyDraft(),
      { contact_phone: '0722000000', price: '11500', seller_name: 'Ion' },
      TODAY,
    );
    expect(draft).toEqual(emptyDraft());
    expect(filled).toEqual([]);
  });
});

describe('refusals', () => {
  it('every reason the function can return has a sentence', () => {
    // The list the edge function and the migration agree on.
    const reasons = [
      'robots_disallow', 'fetch_failed', 'fetch_timeout', 'http_error', 'not_html',
      'too_large', 'no_metadata', 'model_error', 'model_refused', 'bad_request',
      'unknown', 'daily_limit', 'budget', 'disabled', 'anonymous_unavailable',
    ];
    for (const reason of reasons) {
      expect(REFUSALS[reason], reason).toBeDefined();
      expect(refusalFor(reason).message.length, reason).toBeGreaterThan(20);
    }
  });

  it('a reason nobody has heard of still gets a sentence', () => {
    expect(refusalFor('something-new').message).toBe(REFUSALS.unknown!.message);
    expect(refusalFor(undefined).message).toBe(REFUSALS.unknown!.message);
  });

  it('never tells somebody to retry what retrying cannot fix', () => {
    for (const reason of ['robots_disallow', 'daily_limit', 'budget', 'disabled', 'no_metadata']) {
      expect(refusalFor(reason).retryable, reason).toBe(false);
      expect(refusalFor(reason).message, reason).not.toMatch(/mai încearcă|încearcă din nou/i);
    }
  });

  it('and says the form still works wherever the answer is a hard no', () => {
    for (const reason of ['daily_limit', 'budget', 'disabled', 'anonymous_unavailable']) {
      expect(refusalFor(reason).message, reason).toMatch(/manual/i);
    }
  });

  it('is written in Romanian with its diacritics', () => {
    for (const refusal of Object.values(REFUSALS)) {
      expect(refusal.message).not.toMatch(/\b(please|error|failed|retry)\b/i);
    }
    expect(refusalFor('daily_limit').message).toMatch(/[ăâîșț]/);
  });
});

describe('looksLikeListingUrl', () => {
  it('accepts a plain https address', () => {
    expect(looksLikeListingUrl('https://anunturi.example.ro/auto/golf-123')).toBe(true);
  });

  it('refuses what is obviously not one', () => {
    for (const raw of ['', '   ', 'nu e link', 'example.ro/auto', 'http://example.ro/a', 'javascript:alert(1)']) {
      expect(looksLikeListingUrl(raw), raw).toBe(false);
    }
  });

  it('refuses a host with no dot in it', () => {
    expect(looksLikeListingUrl('https://localhost/x')).toBe(false);
  });
});
