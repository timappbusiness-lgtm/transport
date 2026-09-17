import { describe, expect, it } from 'vitest';
import {
  appliesTo,
  expiryEffect,
  formatCompanies,
  graceLabel,
  remindersLabel,
  requiredDocuments,
  showCarrierCount,
  type PublicRequirement,
} from '@/lib/trust';

/**
 * /verificare renders `document_requirements` rather than describing it, so
 * these are the rules that turn a row into a sentence. Get one wrong and the
 * page tells somebody their vehicle stays on the board when it does not.
 */

function requirement(over: Partial<PublicRequirement> = {}): PublicRequirement {
  return {
    scope: 'company',
    kind: 'licenta_comunitara',
    label_ro: 'Licență comunitară',
    for_company_types: null,
    for_vehicle_types: null,
    is_blocking: true,
    has_expiry: true,
    grace_days: 0,
    reminder_days: [30, 14, 7, 1],
    ...over,
  };
}

describe('which documents the page lists', () => {
  it('lists the ones that decide whether you may work', () => {
    const docs = requiredDocuments([
      requirement({ kind: 'rca', scope: 'vehicle' }),
      requirement({ kind: 'licenta_comunitara' }),
    ]);
    expect(docs.map((d) => d.kind)).toEqual(['licenta_comunitara', 'rca']);
  });

  it('leaves out the optional ones', () => {
    // Carte Verde and ADR are requirements for particular jobs, not
    // conditions of being on the platform. Listing them in the same table
    // would overstate what we ask of everybody.
    const docs = requiredDocuments([
      requirement({ kind: 'carte_verde', scope: 'vehicle', is_blocking: false }),
      requirement({ kind: 'itp', scope: 'vehicle' }),
    ]);
    expect(docs.map((d) => d.kind)).toEqual(['itp']);
  });

  it('leaves out driver papers, which are not a condition of the account', () => {
    const docs = requiredDocuments([
      requirement({ kind: 'permis_conducere', scope: 'driver', is_blocking: true }),
      requirement({ kind: 'itp', scope: 'vehicle' }),
    ]);
    expect(docs.map((d) => d.kind)).toEqual(['itp']);
  });

  it('puts what the company brings before what each vehicle brings', () => {
    const docs = requiredDocuments([
      requirement({ kind: 'rca', scope: 'vehicle' }),
      requirement({ kind: 'itp', scope: 'vehicle' }),
      requirement({ kind: 'asigurare_cmr' }),
      requirement({ kind: 'licenta_comunitara' }),
    ]);
    expect(docs.map((d) => d.kind)).toEqual([
      'licenta_comunitara',
      'asigurare_cmr',
      'itp',
      'rca',
    ]);
  });

  it('still shows a rule the database grows later', () => {
    const docs = requiredDocuments([
      requirement({ kind: 'autorizatie_adr', scope: 'vehicle', is_blocking: true }),
      requirement({ kind: 'licenta_comunitara' }),
    ]);
    expect(docs).toHaveLength(2);
    expect(docs[1]?.kind).toBe('autorizatie_adr');
  });
});

describe('what happens when one expires', () => {
  it('a company document stops the offers', () => {
    expect(expiryEffect(requirement())).toEqual({ kind: 'company', graceDays: 0 });
  });

  it('a company document with a grace period says how long', () => {
    expect(expiryEffect(requirement({ kind: 'asigurare_cmr', grace_days: 3 }))).toEqual({
      kind: 'company',
      graceDays: 3,
    });
  });

  it('a vehicle document takes the vehicle off the board', () => {
    expect(expiryEffect(requirement({ scope: 'vehicle', kind: 'rca' }))).toEqual({
      kind: 'vehicle',
    });
  });

  it('a document without a term does not expire at all', () => {
    expect(
      expiryEffect(requirement({ kind: 'certificat_inregistrare_onrc', has_expiry: false })),
    ).toEqual({ kind: 'none' });
  });

  it('a non-blocking document blocks nothing', () => {
    expect(expiryEffect(requirement({ is_blocking: false }))).toEqual({ kind: 'optional' });
  });
});

describe('who a document applies to', () => {
  it('names transport companies when only they must bring it', () => {
    expect(appliesTo(requirement({ for_company_types: ['transport', 'both'] }))).toBe('transport');
  });

  it('names forwarders when only they must', () => {
    expect(appliesTo(requirement({ for_company_types: ['expeditie', 'both'] }))).toBe('forwarder');
  });

  it('names nobody in particular when everybody must', () => {
    // Naming every type would read as a restriction that is not there.
    expect(appliesTo(requirement({ for_company_types: null }))).toBeNull();
    expect(appliesTo(requirement({ for_company_types: [] }))).toBeNull();
    expect(
      appliesTo(requirement({ for_company_types: ['transport', 'expeditie', 'both'] })),
    ).toBeNull();
  });
});

describe('the reminder schedule, read from the row', () => {
  it('reads out largest first, with the Romanian "o zi" at the end', () => {
    expect(remindersLabel([30, 14, 7, 1])).toBe('30, 14, 7 și o zi');
  });

  it('sorts whatever order the column holds', () => {
    expect(remindersLabel([1, 7, 30])).toBe('30, 7 și o zi');
  });

  it('handles a single reminder', () => {
    expect(remindersLabel([7])).toBe('7');
    expect(remindersLabel([1])).toBe('o zi');
  });

  it('says nothing when there is no schedule', () => {
    expect(remindersLabel([])).toBeNull();
    expect(remindersLabel([0, -3])).toBeNull();
  });
});

describe('the grace period', () => {
  it('uses the Romanian plural', () => {
    expect(graceLabel(1)).toBe('o zi');
    expect(graceLabel(3)).toBe('3 zile');
    expect(graceLabel(20)).toBe('20 de zile');
  });
});

describe('whether the homepage states a number of carriers', () => {
  it('states it once there are enough', () => {
    expect(showCarrierCount(20, 20)).toBe(true);
    expect(showCarrierCount(41, 20)).toBe(true);
  });

  it('says nothing below the threshold', () => {
    // "3 firme" answers "is anyone here" with "barely".
    expect(showCarrierCount(19, 20)).toBe(false);
    expect(showCarrierCount(0, 20)).toBe(false);
  });

  it('says nothing when we could not ask', () => {
    expect(showCarrierCount(null, 20)).toBe(false);
  });

  it('never states a number when the threshold is meaningless', () => {
    expect(showCarrierCount(5, 0)).toBe(false);
  });

  it('writes the count with the Romanian plural', () => {
    expect(formatCompanies(1)).toBe('o firmă');
    expect(formatCompanies(4)).toBe('4 firme');
    expect(formatCompanies(24)).toBe('24 de firme');
  });
});
