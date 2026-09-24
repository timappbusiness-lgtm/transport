import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JourneyBanner } from '@/components/onboarding/journey-banner';
import { inscriereCopy } from '@/content/inscriere';
import {
  JOURNEY_ACTIONS,
  afterCompanyCreated,
  afterVehicles,
  canDo,
  gateHref,
  journeyStage,
  uploadMinutes,
  withJourney,
  type JourneyInput,
  type JourneyStage,
} from '@/lib/carrier-journey';
import {
  canSubmitForReview,
  countChecklist,
  orderForWork,
  progressLabel,
  rowsFor,
  type RequirementRow,
} from '@/lib/document-checklist';

/**
 * What a carrier can do at each stage of the way in, and where each thing
 * they try sends them.
 *
 * The order of the questions changed; the rules did not. Nothing here may
 * say yes where `company_can_act()` in Postgres says no: offers, routes
 * and contacts wait for a verified, unsuspended firm at every stage.
 */

const TRANSPORT = { companyType: 'transport' as const, verificationStatus: 'draft' as const, isSuspended: false };

function input(overrides: Partial<JourneyInput> & { company?: JourneyInput['company'] } = {}): JourneyInput {
  return { company: TRANSPORT, vehicleCount: 1, blockingMissing: 0, ...overrides };
}

describe('where a carrier stands', () => {
  it('an account with no firm', () => {
    expect(journeyStage(input({ company: null }))).toBe('no_company');
  });

  it('a carrier with a firm and no vehicle stops at the vehicles', () => {
    expect(journeyStage(input({ vehicleCount: 0, blockingMissing: 3 }))).toBe('no_vehicle');
  });

  it('a forwarder has no vehicle step', () => {
    const forwarder = { ...TRANSPORT, companyType: 'expeditie' as const };
    expect(journeyStage(input({ company: forwarder, vehicleCount: 0, blockingMissing: 2 }))).toBe('documents');
  });

  it('documents missing, then everything uploaded and not yet sent', () => {
    expect(journeyStage(input({ blockingMissing: 4 }))).toBe('documents');
    expect(journeyStage(input({ blockingMissing: 0 }))).toBe('ready_to_submit');
  });

  it('with us, verified, sent back', () => {
    expect(journeyStage(input({ company: { ...TRANSPORT, verificationStatus: 'pending' } }))).toBe('in_review');
    expect(journeyStage(input({ company: { ...TRANSPORT, verificationStatus: 'verified' } }))).toBe('verified');
    expect(journeyStage(input({ company: { ...TRANSPORT, verificationStatus: 'rejected' }, blockingMissing: 1 }))).toBe(
      'rejected',
    );
  });

  it('a suspension outranks everything, as it does in the database', () => {
    expect(journeyStage(input({ company: { ...TRANSPORT, verificationStatus: 'verified', isSuspended: true } }))).toBe(
      'suspended',
    );
    expect(journeyStage(input({ company: { ...TRANSPORT, verificationStatus: 'suspended' } }))).toBe('suspended');
    expect(journeyStage(input({ company: { ...TRANSPORT, isSuspended: true }, vehicleCount: 0 }))).toBe('suspended');
  });
});

describe('what a carrier may do at each stage', () => {
  const STAGES: JourneyStage[] = [
    'no_company',
    'no_vehicle',
    'documents',
    'ready_to_submit',
    'rejected',
    'in_review',
    'suspended',
    'verified',
  ];

  it('offers, routes and contacts only once verified — the rule company_can_act() enforces', () => {
    for (const stage of STAGES) {
      for (const action of JOURNEY_ACTIONS) {
        expect(canDo(stage, action, 'transport'), `${stage} ${action}`).toBe(stage === 'verified');
      }
    }
  });

  it('a verified forwarder offers and sees contacts, but has no route to publish', () => {
    expect(canDo('verified', 'oferta', 'expeditie')).toBe(true);
    expect(canDo('verified', 'contact', 'expeditie')).toBe(true);
    expect(canDo('verified', 'traseu', 'expeditie')).toBe(false);
  });

  it('is sent to the one step that is missing, carrying why and the way back', () => {
    const back = '/cereri/abc';
    expect(gateHref('no_company', 'oferta', back)).toBe('/cont/firma/creeaza?pentru=oferta&next=%2Fcereri%2Fabc');
    expect(gateHref('no_vehicle', 'traseu', back)).toBe('/cont/firma/flota?pentru=traseu&next=%2Fcereri%2Fabc');
    for (const stage of ['documents', 'ready_to_submit', 'rejected', 'suspended'] as const) {
      expect(gateHref(stage, 'contact', back), stage).toBe('/cont/firma/documente?pentru=contact&next=%2Fcereri%2Fabc');
    }
  });

  it('and nowhere when allowed, or when the documents are already with us', () => {
    expect(gateHref('verified', 'oferta', null)).toBeNull();
    expect(gateHref('in_review', 'oferta', null)).toBeNull();
  });

  it('after the firm: a carrier to its vehicles, a forwarder to the documents or back', () => {
    expect(afterCompanyCreated('transport', '/cereri/abc', 'oferta')).toBe(
      '/cont/firma/flota?pentru=oferta&next=%2Fcereri%2Fabc',
    );
    expect(afterCompanyCreated('both', null)).toBe('/cont/firma/flota');
    expect(afterCompanyCreated('expeditie', '/cereri/abc', 'contact')).toBe(
      '/cont/firma/documente?pentru=contact&next=%2Fcereri%2Fabc',
    );
    expect(afterCompanyCreated('expeditie', null)).toBe('/cereri');
    expect(afterCompanyCreated('expeditie', '/trasee')).toBe('/trasee');
  });

  it('after the vehicles: to the documents when something waits on them, otherwise back', () => {
    expect(afterVehicles('oferta', '/cereri/abc')).toBe('/cont/firma/documente?pentru=oferta&next=%2Fcereri%2Fabc');
    expect(afterVehicles(null, '/cereri')).toBe('/cereri');
    expect(afterVehicles(null, null)).toBe('/cereri');
  });

  it('withJourney leaves a path alone when there is nothing to carry, and keeps a query it has', () => {
    expect(withJourney('/cont/firma/documente', null, null)).toBe('/cont/firma/documente');
    expect(withJourney('/cont/firma/documente?vehicul=v1', 'oferta', '/cereri/a')).toBe(
      '/cont/firma/documente?vehicul=v1&pentru=oferta&next=%2Fcereri%2Fa',
    );
  });

  it('estimates the upload in whole minutes, never zero for something owed', () => {
    expect(uploadMinutes(0)).toBe(0);
    expect(uploadMinutes(1)).toBe(1);
    expect(uploadMinutes(6)).toBe(5);
  });
});

describe('the banner above the boards', () => {
  const STAGES = ['no_company', 'no_vehicle', 'documents', 'ready_to_submit', 'rejected', 'in_review', 'suspended'] as const;

  it('has exactly one way out, the next step, on every stage', () => {
    for (const stage of STAGES) {
      const html = renderToStaticMarkup(<JourneyBanner stage={stage} minutes={5} back="/cereri" />);
      // A banner with two buttons is a decision, and this is not the screen for one.
      expect((html.match(/<a\b/g) ?? []).length, stage).toBe(1);
      expect(html, stage).toContain('next=%2Fcereri');
    }
  });

  it('says what can be done, then how long the documents take', () => {
    const html = renderToStaticMarkup(<JourneyBanner stage="no_company" minutes={5} />);
    expect(html).toContain(inscriereCopy.board.title);
    expect(html).toContain('Poți trimite oferte după ce îți verificăm actele. Durează aproximativ 5 minute să le încarci.');
    expect(renderToStaticMarkup(<JourneyBanner stage="documents" minutes={1} />)).toContain('aproximativ 1 minut ');
  });

  it('a suspension and a rejection carry no icon; the calm ones do', () => {
    for (const stage of ['suspended', 'rejected'] as const) {
      expect(renderToStaticMarkup(<JourneyBanner stage={stage} minutes={5} />), stage).not.toContain('<svg');
    }
    for (const stage of ['no_company', 'no_vehicle', 'documents', 'in_review'] as const) {
      expect(renderToStaticMarkup(<JourneyBanner stage={stage} minutes={5} />), stage).toContain('<svg');
    }
  });
});

describe('what a firm still owes', () => {
  const COMPANY: RequirementRow[] = [
    { scope: 'company', kind: 'licenta_comunitara', label: 'Licență', isBlocking: true, state: 'ok', validUntil: null },
    { scope: 'company', kind: 'asigurare_cmr', label: 'CMR', isBlocking: true, state: 'missing', validUntil: null },
    { scope: 'company', kind: 'certificat_inregistrare_onrc', label: 'ONRC', isBlocking: true, state: 'in_review', validUntil: null },
  ];
  const VEHICLE: RequirementRow[] = [
    { scope: 'vehicle', vehicleId: 'v1', kind: 'itp', label: 'ITP', isBlocking: true, state: 'rejected', validUntil: null },
    { scope: 'vehicle', vehicleId: 'v1', kind: 'rca', label: 'RCA', isBlocking: true, state: 'expired', validUntil: null },
    { scope: 'vehicle', vehicleId: 'v1', kind: 'carte_verde', label: 'Carte verde', isBlocking: false, state: 'missing', validUntil: null },
  ];

  it('counts a document waiting for our check as uploaded, a rejected or expired one as owed', () => {
    const counts = countChecklist([...COMPANY, ...VEHICLE]);
    expect(counts).toEqual({ blockingTotal: 5, blockingDone: 2, optionalTotal: 1, optionalDone: 0, blockingMissing: 3 });
    expect(progressLabel(counts)).toBe('2 din 5 încărcate');
  });

  it('never counts an optional document against the check', () => {
    const done = [...COMPANY, ...VEHICLE].map((row) => (row.isBlocking ? { ...row, state: 'in_review' as const } : row));
    expect(canSubmitForReview({ verificationStatus: 'draft', carries: true, vehicleCount: 1, rows: done })).toBe(true);
  });

  it('refuses what company_review_readiness() refuses', () => {
    const rows = [...COMPANY, ...VEHICLE];
    expect(canSubmitForReview({ verificationStatus: 'draft', carries: true, vehicleCount: 1, rows })).toBe(false);
    const done = rows.map((row) => ({ ...row, state: 'ok' as const }));
    // A carrier with no vehicle is not ready, whatever its papers say.
    expect(canSubmitForReview({ verificationStatus: 'draft', carries: true, vehicleCount: 0, rows: done })).toBe(false);
    // Nor is a firm already with us or already verified.
    expect(canSubmitForReview({ verificationStatus: 'pending', carries: true, vehicleCount: 1, rows: done })).toBe(false);
    expect(canSubmitForReview({ verificationStatus: 'verified', carries: true, vehicleCount: 1, rows: done })).toBe(false);
    // Sent back: it may be sent again once corrected.
    expect(canSubmitForReview({ verificationStatus: 'rejected', carries: true, vehicleCount: 1, rows: done })).toBe(true);
    // A forwarder needs no vehicle.
    expect(canSubmitForReview({ verificationStatus: 'draft', carries: false, vehicleCount: 0, rows: done })).toBe(true);
  });

  it('lists what needs a file first, blocking before optional, then what is done', () => {
    const order = orderForWork([...COMPANY, ...VEHICLE]).map((row) => row.kind);
    expect(order).toEqual(['asigurare_cmr', 'itp', 'rca', 'carte_verde', 'licenta_comunitara', 'certificat_inregistrare_onrc']);
  });

  it('splits the firm from each vehicle', () => {
    expect(rowsFor([...COMPANY, ...VEHICLE], null).map((r) => r.kind)).toHaveLength(3);
    expect(rowsFor([...COMPANY, ...VEHICLE], 'v1').map((r) => r.kind)).toEqual(['itp', 'rca', 'carte_verde']);
    expect(rowsFor([...COMPANY, ...VEHICLE], 'v2')).toEqual([]);
  });
});
