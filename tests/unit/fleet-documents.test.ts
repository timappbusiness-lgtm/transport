import { describe, expect, it } from 'vitest';
import {
  DISPLAY_STATUS,
  DOCUMENT_STATUS_LABELS,
  EXPIRING_SOON_DAYS,
  REQUIREMENT_STATE,
  documentDisplayStatus,
  documentStoragePath,
  isRequirementState,
} from '@/lib/documents';
import { daysBetween, formatDateRo, parseDateOnly } from '@/lib/format';
import { VEHICLE_TYPE_LABELS, VEHICLE_TYPE_ORDER, formatPlate, normalizePlate } from '@/lib/vehicles';

/**
 * The pure half of the fleet and documents screens, ported from pull
 * request #6. Everything here decides what a dispatcher is told about a
 * document, so the boundaries are worth pinning: one day either side of
 * "expiring soon" is the difference between a renewal and a suspension.
 */

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

  it('draws the boundary exactly at EXPIRING_SOON_DAYS', () => {
    const boundary = new Date(2026, 8, 16 + EXPIRING_SOON_DAYS);
    const dayAfter = new Date(2026, 8, 16 + EXPIRING_SOON_DAYS + 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(documentDisplayStatus(iso(boundary), today)).toBe('expiring_soon');
    expect(documentDisplayStatus(iso(dayAfter), today)).toBe('valid');
  });
});

describe('dates', () => {
  it('reads a date column as a calendar date, not UTC midnight', () => {
    const date = parseDateOnly('2027-04-03');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 3, 3]);
    expect(formatDateRo('2027-04-03')).toBe('03.04.2027');
  });

  it('shows an em dash rather than "Invalid Date"', () => {
    expect(formatDateRo(null)).toBe('—');
    expect(formatDateRo('not a date')).toBe('—');
  });

  it('counts whole calendar days in both directions', () => {
    expect(daysBetween(new Date(2026, 8, 16), new Date(2026, 8, 18))).toBe(2);
    expect(daysBetween(new Date(2026, 8, 18), new Date(2026, 8, 16))).toBe(-2);
  });
});

describe('plates and storage paths', () => {
  it('normalises and formats a Romanian plate', () => {
    expect(normalizePlate('tm 01 crd')).toBe('TM01CRD');
    expect(formatPlate('TM01CRD')).toBe('TM 01 CRD');
    expect(formatPlate('B123ABC')).toBe('B 123 ABC');
  });

  it('leaves a foreign plate alone rather than mangling it', () => {
    expect(formatPlate('MRX1234')).toBe('MRX1234');
  });

  it('stores a document in its company folder, keeping the extension', () => {
    expect(documentStoragePath('c1', 'd1', 'RCA scan.PDF')).toBe('c1/d1.pdf');
    expect(documentStoragePath('c1', 'd1', 'no-extension')).toBe('c1/d1.bin');
  });
});

describe('labels cover every database value', () => {
  it('names every vehicle type exactly once', () => {
    const labelled = Object.keys(VEHICLE_TYPE_LABELS).sort();
    expect([...VEHICLE_TYPE_ORDER].sort()).toEqual(labelled);
    expect(new Set(VEHICLE_TYPE_ORDER).size).toBe(VEHICLE_TYPE_ORDER.length);
  });

  it('names every stored document status in Romanian', () => {
    for (const label of Object.values(DOCUMENT_STATUS_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
    // The enum in the migrations; a new value must arrive here too.
    expect(Object.keys(DOCUMENT_STATUS_LABELS).sort()).toEqual([
      'approved',
      'expired',
      'parsing',
      'pending',
      'rejected',
      'replaced',
      'uploaded',
    ]);
  });

  it('recognises only the states the views can return', () => {
    expect(isRequirementState('ok')).toBe(true);
    expect(isRequirementState('missing')).toBe(true);
    expect(isRequirementState('something-else')).toBe(false);
    expect(isRequirementState(null)).toBe(false);
  });

  it('uses only tones the badge understands', () => {
    const tones = new Set(['success', 'warning', 'danger', 'neutral']);
    for (const { tone } of Object.values(DISPLAY_STATUS)) expect(tones.has(tone)).toBe(true);
    for (const { tone } of Object.values(REQUIREMENT_STATE)) expect(tones.has(tone)).toBe(true);
  });
});
