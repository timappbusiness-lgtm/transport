import { describe, expect, it } from 'vitest';
import { normalizeCui } from '@/lib/companies';
import { documentDisplayStatus, documentStoragePath } from '@/lib/documents';
import { formatDateRo, parseDateOnly } from '@/lib/format';
import { formatPlate, normalizePlate } from '@/lib/vehicles';

describe('document display status', () => {
  const today = new Date(2026, 8, 16); // 16.09.2026

  it('is valid beyond 30 days', () => {
    expect(documentDisplayStatus('2026-10-17', today)).toBe('valid');
  });

  it('is expiring soon at exactly 30 days and below', () => {
    expect(documentDisplayStatus('2026-10-16', today)).toBe('expiring_soon');
    expect(documentDisplayStatus('2026-09-16', today)).toBe('expiring_soon');
  });

  it('is expired the day after valid_until', () => {
    expect(documentDisplayStatus('2026-09-15', today)).toBe('expired');
  });

  it('has no status without an expiry date', () => {
    expect(documentDisplayStatus(null, today)).toBeNull();
  });
});

describe('dates', () => {
  it('reads a date column as a calendar date, not UTC midnight', () => {
    const d = parseDateOnly('2027-04-03');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 3, 3]);
    expect(formatDateRo('2027-04-03')).toBe('03.04.2027');
  });
});

describe('CUI', () => {
  it('accepts the usual spellings', () => {
    expect(normalizeCui('RO 14 399 840')).toBe('14399840');
    expect(normalizeCui('ro14399840')).toBe('14399840');
  });

  it('rejects what cannot be a CUI', () => {
    expect(normalizeCui('ABC')).toBeNull();
    expect(normalizeCui('12345678901')).toBeNull();
  });
});

describe('plates and storage paths', () => {
  it('normalises and formats a Romanian plate', () => {
    expect(normalizePlate('tm 01 crd')).toBe('TM01CRD');
    expect(formatPlate('TM01CRD')).toBe('TM 01 CRD');
    expect(formatPlate('B123ABC')).toBe('B 123 ABC');
  });

  it('stores a document in its company folder', () => {
    expect(documentStoragePath('c1', 'd1', 'RCA scan.PDF')).toBe('c1/d1.pdf');
  });
});
