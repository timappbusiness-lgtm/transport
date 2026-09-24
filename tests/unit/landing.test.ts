import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { explicitNextAfterAuth } from '@/lib/auth/next-path';
import { landingAfterSignIn, type LandingInput } from '@/lib/landing';

/**
 * Where somebody lands after signing in with nowhere in particular to go:
 * a carrier on the board, unless the firm's file is unfinished, and
 * everybody else in their account.
 */

function input(over: Partial<LandingInput> = {}): LandingInput {
  return {
    accountType: 'company',
    companyType: 'transport',
    role: 'owner',
    stage: 'verified',
    ...over,
  };
}

describe('a carrier', () => {
  it('lands on the request board once there is nothing to finish', () => {
    expect(landingAfterSignIn(input())).toBe(ROUTES.requests);
    expect(landingAfterSignIn(input({ companyType: 'both' }))).toBe(ROUTES.requests);
    expect(landingAfterSignIn(input({ role: 'dispatcher' }))).toBe(ROUTES.requests);
    // Waiting on our check is not unfinished: there is nothing to do.
    expect(landingAfterSignIn(input({ stage: 'in_review' }))).toBe(ROUTES.requests);
  });

  it('lands on the next onboarding step while the file is unfinished', () => {
    expect(landingAfterSignIn(input({ stage: 'no_company' }))).toBe(ROUTES.accountCompanyCreate);
    expect(landingAfterSignIn(input({ stage: 'no_vehicle' }))).toBe(ROUTES.accountFleet);
    expect(landingAfterSignIn(input({ stage: 'documents' }))).toBe(ROUTES.accountDocuments);
    expect(landingAfterSignIn(input({ stage: 'ready_to_submit' }))).toBe(ROUTES.accountDocuments);
    expect(landingAfterSignIn(input({ stage: 'rejected' }))).toBe(ROUTES.accountDocuments);
  });

  it('lands on the dashboard when suspended, which says why', () => {
    expect(landingAfterSignIn(input({ stage: 'suspended' }))).toBe(ROUTES.account);
  });
});

describe('everybody else', () => {
  it('a firm account with no firm yet: creating it', () => {
    expect(landingAfterSignIn(input({ companyType: null, role: null, stage: null }))).toBe(
      ROUTES.accountCompanyCreate,
    );
  });

  it('a forwarder, a private client and a driver: their account', () => {
    expect(landingAfterSignIn(input({ companyType: 'expeditie', stage: null }))).toBe(ROUTES.account);
    expect(
      landingAfterSignIn({ accountType: 'individual', companyType: null, role: null, stage: null }),
    ).toBe(ROUTES.account);
    expect(landingAfterSignIn(input({ role: 'driver' }))).toBe(ROUTES.account);
  });

  it('every landing is a page that exists', () => {
    const known = new Set<string>(Object.values(ROUTES));
    const stages = [
      'no_company',
      'no_vehicle',
      'documents',
      'ready_to_submit',
      'rejected',
      'in_review',
      'suspended',
      'verified',
      null,
    ] as const;
    for (const stage of stages) {
      expect(known.has(landingAfterSignIn(input({ stage })))).toBe(true);
    }
  });
});

describe('a sign-in that carried somewhere to go', () => {
  it('goes back there, not to the landing', () => {
    expect(explicitNextAfterAuth('/cerere/noua?pas=3')).toBe('/cerere/noua?pas=3');
    expect(explicitNextAfterAuth('/firme')).toBe('/firme');
  });

  it('uses the landing when it carried nothing, or nothing safe', () => {
    expect(explicitNextAfterAuth(null)).toBeNull();
    expect(explicitNextAfterAuth('')).toBeNull();
    expect(explicitNextAfterAuth('https://exemplu.ro/')).toBeNull();
    expect(explicitNextAfterAuth('//exemplu.ro')).toBeNull();
    // Never back onto a sign-in page, which would send them round again.
    expect(explicitNextAfterAuth('/autentificare')).toBeNull();
    expect(explicitNextAfterAuth('/autentificare?next=/cont')).toBeNull();
  });

  it('is a route the app serves', () => {
    expect(ROUTES.signInLanding).toBe('/intrare');
  });
});
