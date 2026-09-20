import { describe, expect, it } from 'vitest';
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  isClosing,
  openCount,
  reportedEntity,
  type ReportRow,
} from '@/lib/reports';

/**
 * A report queue is only worked if it reads like one: what nobody has
 * looked at first, and „despre ce" answerable at a glance. These pin the
 * two places where that goes wrong.
 */

function report(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'r1',
    created_at: '2026-09-21T08:00:00.000Z',
    status: 'open',
    kind: 'firma',
    reason: 'Mi-a cerut plata în afara platformei',
    details: null,
    evidence_path: null,
    resolution: null,
    internal_notes: null,
    resolved_at: null,
    reporter_notified_at: null,
    reporter_user_id: 'u1',
    reporter_name: 'Ion Ionescu',
    reporter_email: 'ion@example.com',
    reported_company_id: null,
    reported_company_name: null,
    reported_user_id: null,
    cargo_listing_id: null,
    assigned_to: null,
    assigned_name: null,
    handled_by: null,
    ...over,
  };
}

describe('the queue order', () => {
  it('puts what nobody has looked at first', () => {
    expect(REPORT_STATUS_ORDER[0]).toBe('open');
    expect(REPORT_STATUS_ORDER[1]).toBe('investigating');
  });

  it('has a Romanian word for every state the database allows', () => {
    for (const status of REPORT_STATUS_ORDER) {
      expect(REPORT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('counts only what is still somebody’s job', () => {
    const rows = [
      report(),
      report({ id: 'r2', status: 'investigating' }),
      report({ id: 'r3', status: 'resolved' }),
      report({ id: 'r4', status: 'dismissed' }),
    ];
    expect(openCount(rows)).toBe(2);
  });
});

describe('closing one', () => {
  it('is what needs a written reason', () => {
    expect(isClosing('resolved')).toBe(true);
    expect(isClosing('dismissed')).toBe(true);
    expect(isClosing('open')).toBe(false);
    expect(isClosing('investigating')).toBe(false);
  });
});

describe('what a report is about', () => {
  it('names the firm when the firm is known', () => {
    expect(reportedEntity(report({ reported_company_name: 'Transport Demo SRL' }))).toBe(
      'Firma Transport Demo SRL',
    );
  });

  it('falls back to the id when the name did not come along', () => {
    expect(reportedEntity(report({ reported_company_id: 'c1' }))).toBe('Firmă c1');
  });

  it('names a request when that is what was reported', () => {
    expect(reportedEntity(report({ cargo_listing_id: 'l1' }))).toBe('Cererea l1');
  });

  it('says nothing rather than „Firmă: —" when nothing was linked', () => {
    // The common case from /verificare, where the person typed a name
    // into free text. The details say more than an empty label would.
    expect(reportedEntity(report())).toBeNull();
  });
});
