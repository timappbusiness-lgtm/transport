import { describe, expect, it } from 'vitest';
import {
  completeness,
  normalisePhone,
  normaliseWebsite,
  tabsFor,
  tidyCodes,
  validateProfile,
  validateTab,
  type CompletenessInput,
  type ProfileDraft,
} from '@/lib/company-profile';

/**
 * Every rule here has a twin in migration `20260918090000`, which is where
 * it is enforced. The cases below are written against the FIRM block of
 * `supabase/tests/rls_test.sql` so the two cannot quietly disagree: a
 * value this file accepts and Postgres refuses is a form that lies about
 * having saved, and the other way round is worse.
 */

function draft(over: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    contactPhone: '+40722000111',
    contactEmail: 'contact@firma.ro',
    website: '',
    county: 'Timiș',
    city: 'Timișoara',
    address: '',
    baseAddressHidden: false,
    coverageScope: 'national',
    coverageCounties: [],
    coverageCountries: [],
    vehicleTypesAccepted: [],
    equipment: [],
    services: [],
    indicativeRate: '',
    indicativeRateNote: '',
    alertsEnabled: false,
    alertsEmail: '',
    publicDescription: '',
    ...over,
  };
}

describe('a telephone number, however it is written', () => {
  it('accepts the three shapes a Romanian number comes in', () => {
    expect(normalisePhone('0722 000 111')).toBe('+40722000111');
    expect(normalisePhone('0040-722-000-111')).toBe('+40722000111');
    expect(normalisePhone('+40 722 000 111')).toBe('+40722000111');
  });

  it('keeps a foreign number as it was dialled', () => {
    expect(normalisePhone('+49 171 1234567')).toBe('+491711234567');
  });

  it('refuses something too short to be one', () => {
    expect(normalisePhone('0722')).toBeNull();
  });

  it('refuses a second plus, which means it was never a number', () => {
    expect(normalisePhone('+40+722000111')).toBeNull();
  });

  it('says nothing about an empty box', () => {
    expect(normalisePhone('')).toBeNull();
    expect(validateProfile(draft({ contactPhone: '' })).contactPhone).toBeUndefined();
  });
});

describe('a website, as it is stored', () => {
  it('adds the scheme nobody types', () => {
    expect(normaliseWebsite('firma.ro')).toBe('https://firma.ro');
  });

  it('upgrades http rather than publishing a link browsers warn about', () => {
    expect(normaliseWebsite('http://firma.ro')).toBe('https://firma.ro');
  });

  it('lower-cases the host and leaves the path alone', () => {
    expect(normaliseWebsite('HTTP://Firma.RO/Despre-Noi')).toBe('https://firma.ro/Despre-Noi');
  });

  it('drops the campaign that linked it, and keeps what is the address', () => {
    // Otherwise every visit from this directory is reported to whoever
    // copied the link out of a newsletter, for as long as the profile lives.
    expect(normaliseWebsite('https://firma.ro/servicii?utm_source=nl&gclid=7&pagina=2#top')).toBe(
      'https://firma.ro/servicii?pagina=2',
    );
  });

  it('drops a query that was nothing but tracking', () => {
    expect(normaliseWebsite('https://firma.ro/a?utm_medium=email')).toBe('https://firma.ro/a');
  });

  it('refuses a host with no dot in it', () => {
    expect(normaliseWebsite('firma')).toBeNull();
  });

  it('keeps a trailing slash on a path and drops it on a bare host', () => {
    expect(normaliseWebsite('https://firma.ro/')).toBe('https://firma.ro');
    expect(normaliseWebsite('https://firma.ro/ro/')).toBe('https://firma.ro/ro/');
  });
});

describe('codes are stored one way', () => {
  it('trims, folds, de-duplicates and sorts', () => {
    expect(tidyCodes([' cj ', 'CJ', 'ab', ''], true)).toEqual(['AB', 'CJ']);
  });

  it('folds the other way for the option codes', () => {
    expect(tidyCodes(['Troliu', 'RAMPE'], false)).toEqual(['rampe', 'troliu']);
  });
});

describe('what the form refuses before the round trip', () => {
  it('asks a county carrier which counties', () => {
    const errors = validateProfile(draft({ coverageScope: 'judetean', coverageCounties: [] }));
    expect(errors.coverageCounties).toBe('Alege cel puțin un județ în care transporți.');
  });

  it('asks an international one which countries', () => {
    const errors = validateProfile(draft({ coverageScope: 'international', coverageCountries: [] }));
    expect(errors.coverageCountries).toBeDefined();
  });

  it('does not ask a national carrier for either', () => {
    const errors = validateProfile(draft({ coverageScope: 'national' }));
    expect(errors.coverageCounties).toBeUndefined();
    expect(errors.coverageCountries).toBeUndefined();
  });

  it('refuses a county that is not one of the 42', () => {
    const errors = validateProfile(
      draft({ coverageScope: 'judetean', coverageCounties: ['CJ', 'ZZ'] }),
    );
    expect(errors.coverageCounties).toBe('Unul dintre județe nu este recunoscut.');
  });

  it('wants the rate before the sentence qualifying it', () => {
    const errors = validateProfile(draft({ indicativeRateNote: 'Negociabil peste 500 km' }));
    expect(errors.indicativeRate).toBe('Scrie tariful înainte de observația despre el.');
  });

  it('accepts a rate written with a comma, as it is typed here', () => {
    expect(validateProfile(draft({ indicativeRate: '2,50' })).indicativeRate).toBeUndefined();
  });

  it('refuses a rate nobody could mean', () => {
    expect(validateProfile(draft({ indicativeRate: '0' })).indicativeRate).toBeDefined();
    expect(validateProfile(draft({ indicativeRate: '1000' })).indicativeRate).toBeDefined();
  });

  it('will not switch on an alert with nowhere to send it', () => {
    const errors = validateProfile(
      draft({ alertsEnabled: true, alertsEmail: '', contactEmail: '' }),
    );
    expect(errors.alertsEmail).toBe('Lasă o adresă de e-mail la care să primești alertele.');
  });

  it('is happy for the alert to fall back on the contact address', () => {
    const errors = validateProfile(draft({ alertsEnabled: true, alertsEmail: '' }));
    expect(errors.alertsEmail).toBeUndefined();
  });

  it('refuses a description longer than the box', () => {
    expect(validateProfile(draft({ publicDescription: 'a'.repeat(301) })).publicDescription)
      .toBeDefined();
  });
});

describe('an error belongs to the tab that can fix it', () => {
  it('does not report a coverage problem on the identity tab', () => {
    const bad = draft({ coverageScope: 'judetean', coverageCounties: [], contactPhone: '0722' });
    expect(Object.keys(validateTab('identitate', bad))).toEqual(['contactPhone']);
    expect(Object.keys(validateTab('acoperire', bad))).toEqual(['coverageCounties']);
  });
});

describe('which tabs a firm is shown', () => {
  it('gives a carrier all five', () => {
    expect(tabsFor('transport')).toHaveLength(5);
  });

  it('does not ask a forwarder about kit on a truck it does not own', () => {
    expect(tabsFor('expeditie')).not.toContain('dotari');
    expect(tabsFor('expeditie')).toHaveLength(4);
  });

  it("gives a firm that does both the carrier's set", () => {
    expect(tabsFor('both')).toEqual(tabsFor('transport'));
  });
});

describe('how complete a profile is', () => {
  function input(over: Partial<CompletenessInput> = {}): CompletenessInput {
    return {
      companyType: 'transport',
      contactPhone: null,
      contactEmail: null,
      city: null,
      county: null,
      coverageScope: 'national',
      coverageCounties: [],
      coverageCountries: [],
      vehicleTypesAccepted: [],
      equipment: [],
      services: [],
      publicDescription: null,
      logoPath: null,
      publicProfileEnabled: false,
      vehiclesTotal: 0,
      ...over,
    };
  }

  it('counts the national default as an answer, because it is one', () => {
    const result = completeness(input());
    const coverage = result.items.find((item) => item.tab === 'acoperire');
    expect(coverage?.done).toBe(true);
  });

  it('does not count a county carrier that named no county', () => {
    const result = completeness(input({ coverageScope: 'judetean' }));
    expect(result.items.find((item) => item.tab === 'acoperire')?.done).toBe(false);
  });

  it('reaches a hundred when everything is filled in', () => {
    const result = completeness(
      input({
        contactPhone: '+40722000111',
        contactEmail: 'a@firma.ro',
        city: 'Timișoara',
        county: 'Timiș',
        vehicleTypesAccepted: ['autoturism'],
        equipment: ['troliu'],
        services: ['transport_platforma'],
        publicDescription: 'Transport auto pe platformă.',
        logoPath: 'c1/logo.png',
        publicProfileEnabled: true,
        vehiclesTotal: 3,
      }),
    );
    expect(result.percent).toBe(100);
    expect(result.done).toBe(result.total);
  });

  it('asks a forwarder fewer questions, and does not count the rest against it', () => {
    const carrier = completeness(input());
    const forwarder = completeness(input({ companyType: 'expeditie' }));
    expect(forwarder.total).toBeLessThan(carrier.total);
    expect(forwarder.items.some((item) => item.label === 'Dotări')).toBe(false);
  });

  it('is a number and never a gate', () => {
    // Nothing on this platform is withheld for an empty profile. If this
    // test ever needs changing, something has started blocking on it.
    const empty = completeness(input());
    expect(empty.percent).toBeGreaterThanOrEqual(0);
    expect(empty.items.every((item) => typeof item.done === 'boolean')).toBe(true);
  });
});
