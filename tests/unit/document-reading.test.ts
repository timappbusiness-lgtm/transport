import { describe, expect, it } from 'vitest';
import { requirementAnchor } from '@/lib/document-checklist';
import { MAX_DOCUMENT_BYTES, documentFileProblem } from '@/lib/documents';
import {
  formatDateRo,
  isIsoDate,
  readDocumentAnswer,
  samePlate,
  suggestAssignment,
  vehicleForPlate,
  type DocumentReading,
} from '@/lib/document-reading';

const read = (over: Partial<Extract<DocumentReading, { status: 'read' }>> = {}): DocumentReading => ({
  status: 'read',
  kind: null,
  validUntil: null,
  plate: null,
  confidence: null,
  mismatch: false,
  ...over,
});

describe('what the model said about a document', () => {
  it('a reading: the kind, the date, the plate, the confidence', () => {
    expect(
      readDocumentAnswer(200, {
        ok: true,
        extracted: { detected_kind: 'rca', valid_until: '2027-03-25', plate_number: 'B 123 ABC', confidence: 0.9 },
      }),
    ).toEqual(read({ kind: 'rca', validUntil: '2027-03-25', plate: 'B 123 ABC', confidence: 0.9 }));
  });

  it('a date that is not YYYY-MM-DD is no date; an empty plate is no plate', () => {
    const reading = readDocumentAnswer(200, { ok: true, extracted: { valid_until: '25.03.2027', plate_number: '  ' } });
    expect(reading).toMatchObject({ status: 'read', validUntil: null, plate: null });
  });

  it('says when the model thinks it is not the type it was uploaded as', () => {
    expect(readDocumentAnswer(200, { ok: true, kind_mismatch: true, extracted: {} })).toMatchObject({ mismatch: true });
  });

  it('a HEIC or a scan it cannot open is „unreadable" — the carrier types the date', () => {
    expect(readDocumentAnswer(422, {})).toEqual({ status: 'unreadable' });
    expect(readDocumentAnswer(200, { reason: 'unreadable' })).toEqual({ status: 'unreadable' });
  });

  it('anything else is a failure, never a guess', () => {
    expect(readDocumentAnswer(500, { ok: true, extracted: { valid_until: '2027-01-01' } })).toEqual({
      status: 'failed',
      message: null,
    });
    expect(readDocumentAnswer(null, null)).toEqual({ status: 'failed', message: null });
    expect(readDocumentAnswer(200, { ok: true })).toEqual({ status: 'failed', message: null });
  });
});

describe('plates', () => {
  it('„B 123 ABC", „b-123-abc" and „B123ABC" are the same plate', () => {
    expect(samePlate('B 123 ABC', 'b-123-abc')).toBe(true);
    expect(samePlate('B123ABC', 'B 123 ABC')).toBe(true);
    expect(samePlate('B 123 ABC', 'B 123 ABD')).toBe(false);
    expect(samePlate('', '')).toBe(false);
  });

  const fleet = [
    { id: 'v1', plate: 'B 123 ABC' },
    { id: 'v2', plate: 'CJ 07 XYZ' },
  ];

  it('the vehicle a document names, when exactly one matches', () => {
    expect(vehicleForPlate('CJ07XYZ', fleet)).toBe('v2');
    expect(vehicleForPlate('IS 99 AAA', fleet)).toBeNull();
    expect(vehicleForPlate(null, fleet)).toBeNull();
    expect(vehicleForPlate('B123ABC', [...fleet, { id: 'v3', plate: 'b-123-abc' }])).toBeNull();
  });
});

describe('where a gallery photo is filed: a guess, shown as one', () => {
  const requirements = [
    { scope: 'company' as const, kind: 'licenta_comunitara' },
    { scope: 'company' as const, kind: 'asigurare_cmr' },
    { scope: 'vehicle' as const, kind: 'rca' },
    { scope: 'vehicle' as const, kind: 'itp' },
  ];
  const fleet = [
    { id: 'v1', plate: 'B 123 ABC' },
    { id: 'v2', plate: 'CJ 07 XYZ' },
  ];

  it('a firm document: its kind, no vehicle', () => {
    expect(suggestAssignment(read({ kind: 'asigurare_cmr' }), requirements, fleet)).toEqual({
      kind: 'asigurare_cmr',
      vehicleId: null,
    });
  });

  it('a vehicle document: the vehicle whose plate is on it', () => {
    expect(suggestAssignment(read({ kind: 'rca', plate: 'CJ-07-XYZ' }), requirements, fleet)).toEqual({
      kind: 'rca',
      vehicleId: 'v2',
    });
  });

  it('no legible plate: the only vehicle when there is one, otherwise nobody guesses', () => {
    expect(suggestAssignment(read({ kind: 'itp' }), requirements, [fleet[0]!])).toEqual({ kind: 'itp', vehicleId: 'v1' });
    expect(suggestAssignment(read({ kind: 'itp' }), requirements, fleet)).toEqual({ kind: 'itp', vehicleId: null });
  });

  it('a kind this firm is not asked for, or no reading at all: the carrier chooses', () => {
    expect(suggestAssignment(read({ kind: 'autorizatie_adr' }), requirements, fleet)).toEqual({ kind: null, vehicleId: null });
    expect(suggestAssignment({ status: 'unreadable' }, requirements, fleet)).toEqual({ kind: null, vehicleId: null });
    expect(suggestAssignment({ status: 'failed', message: null }, requirements, fleet)).toEqual({
      kind: null,
      vehicleId: null,
    });
  });
});

describe('dates, the way they are written on the paper', () => {
  it('„2027-03-25" is shown „25.03.2027"', () => {
    expect(formatDateRo('2027-03-25')).toBe('25.03.2027');
    expect(formatDateRo(null)).toBe('');
    expect(formatDateRo('mâine')).toBe('');
  });

  it('only a real calendar date is accepted', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2027-13-01')).toBe(false);
    expect(isIsoDate('25.03.2027')).toBe(false);
  });
});

describe('a link lands on the row', () => {
  it('one anchor per requirement, per vehicle', () => {
    expect(requirementAnchor('asigurare_cmr', null)).toBe('act-firma-asigurare_cmr');
    expect(requirementAnchor('rca', 'v1')).toBe('act-v1-rca');
    expect(requirementAnchor('rca', undefined)).toBe('act-firma-rca');
  });
});

describe('a file is refused before the upload, never after', () => {
  it('only the types the registration accepts', () => {
    expect(documentFileProblem({ type: 'image/jpeg', size: 100 })).toBeNull();
    expect(documentFileProblem({ type: 'application/pdf', size: 100 })).toBeNull();
    expect(documentFileProblem({ type: 'image/heic', size: 100 })).toBeNull();
    // Was let through as „any image" and refused by the registration after
    // the file had already gone up.
    expect(documentFileProblem({ type: 'image/gif', size: 100 })).toBe('wrong_type');
    expect(documentFileProblem({ type: 'image/avif', size: 100 })).toBe('wrong_type');
    expect(documentFileProblem({ type: '', size: 100 })).toBe('wrong_type');
  });

  it('a PDF or a HEIC over the limit is refused now; a photo is drawn down first', () => {
    expect(documentFileProblem({ type: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1 })).toBe('too_large');
    expect(documentFileProblem({ type: 'image/heic', size: MAX_DOCUMENT_BYTES + 1 })).toBe('too_large');
    expect(documentFileProblem({ type: 'image/jpeg', size: MAX_DOCUMENT_BYTES * 3 })).toBeNull();
  });
});
