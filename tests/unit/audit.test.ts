import { describe, expect, it } from 'vitest';
import {
  auditCsv,
  auditCsvName,
  bucharestMidnight,
  bucharestNextMidnight,
  changedFields,
  display,
  hasDiff,
  type AuditEntry,
} from '@/lib/audit';

/**
 * The audit log is only worth opening if the diff is readable, and it is
 * only trustworthy if the diff is the whole truth. These pin both: what
 * is shown, and what is deliberately left out.
 */

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 1,
    created_at: '2026-09-21T08:00:00.000Z',
    actor_user_id: '00000000-0000-0000-0000-000000000001',
    actor_name: 'Ana Popescu',
    actor_role: 'admin',
    action: 'company.verified',
    entity: 'companies',
    entity_id: '00000000-0000-0000-0000-0000000000c1',
    before: { verification_status: 'pending', updated_at: '2026-09-20T10:00:00Z' },
    after: { verification_status: 'verified', updated_at: '2026-09-21T08:00:00Z' },
    reason: 'Documente complete',
    ...over,
  };
}

describe('what changed', () => {
  it('names only the fields that differ', () => {
    const changes = changedFields(
      { a: 1, b: 2, c: 3 },
      { a: 1, b: 9, c: 3 },
    );
    expect(changes).toEqual([{ field: 'b', before: '2', after: '9' }]);
  });

  it('leaves out the timestamps every update touches', () => {
    // A diff whose first three lines are `updated_at` is a diff people
    // stop opening.
    expect(changedFields(entry().before, entry().after)).toEqual([
      { field: 'verification_status', before: 'pending', after: 'verified' },
    ]);
  });

  it('reads an insert as one-sided rather than as everything changing', () => {
    const changes = changedFields(null, { name: 'Ion', is_active: true });
    expect(changes).toEqual([
      { field: 'is_active', before: '—', after: 'da' },
      { field: 'name', before: '—', after: 'Ion' },
    ]);
  });

  it('reads a delete the same way, in reverse', () => {
    expect(changedFields({ name: 'Ion' }, null)).toEqual([
      { field: 'name', before: 'Ion', after: '—' },
    ]);
  });

  it('says nothing when there was nothing on either side', () => {
    expect(changedFields(null, null)).toEqual([]);
    expect(hasDiff(entry({ before: null, after: null }))).toBe(false);
  });

  it('sorts by field, so the same change reads the same way twice', () => {
    const changes = changedFields({}, { zebra: 1, alpha: 2 });
    expect(changes.map((change) => change.field)).toEqual(['alpha', 'zebra']);
  });
});

describe('a value as a person reads it', () => {
  it('says „—" for nothing, not the word null', () => {
    expect(display(null)).toBe('—');
    expect(display(undefined)).toBe('—');
  });

  it('says da and nu, because this is a Romanian screen', () => {
    expect(display(true)).toBe('da');
    expect(display(false)).toBe('nu');
  });

  it('lists an array rather than printing its brackets', () => {
    expect(display(['troliu', 'rampa'])).toBe('troliu, rampa');
    expect(display([])).toBe('—');
  });

  it('is honest about a nested object instead of flattening it', () => {
    expect(display({ a: 1 })).toBe('{"a":1}');
  });
});

describe('the CSV of a filtered range', () => {
  it('has one line per entry, plus the header', () => {
    const csv = auditCsv([entry(), entry({ id: 2 })]);
    expect(csv.trim().split('\r\n')).toHaveLength(3);
  });

  it('folds the changes into one cell, so the columns never move', () => {
    const csv = auditCsv([entry()]);
    expect(csv).toContain('verification_status: pending → verified');
  });

  it('carries the reason, which is the part an auditor is looking for', () => {
    expect(auditCsv([entry()])).toContain('Documente complete');
  });

  it('names the actor rather than only their id', () => {
    expect(auditCsv([entry()])).toContain('Ana Popescu');
  });

  it('is empty, not a lone header, when there is nothing to export', () => {
    expect(auditCsv([])).toBe('');
  });

  it('names the file for the day it was taken, in Bucharest time', () => {
    // 22:30 UTC on the 20th is already the 21st here.
    expect(auditCsvName(new Date('2026-09-20T22:30:00.000Z'))).toBe('jurnal-2026-09-21.csv');
  });
});

describe('the day boundaries the filters ask for', () => {
  it('uses the offset that was actually in force on that date', () => {
    // Romania is UTC+3 in summer and UTC+2 in winter. A hardcoded
    // +03:00 would put every winter query an hour into the previous
    // day — quietly, and only for half the year.
    expect(bucharestMidnight('2026-07-15')).toBe('2026-07-15T00:00:00+03:00');
    expect(bucharestMidnight('2026-01-15')).toBe('2026-01-15T00:00:00+02:00');
  });

  it('gets the switch-over days right', () => {
    expect(bucharestMidnight('2026-03-29')).toBe('2026-03-29T00:00:00+03:00');
    expect(bucharestMidnight('2026-10-25')).toBe('2026-10-25T00:00:00+02:00');
  });

  it('ends the range at the next midnight, so the last day is included', () => {
    // SQL compares `created_at < p_to`, so „până la 21" has to mean the
    // start of the 22nd or the whole of the 21st is missing.
    expect(bucharestNextMidnight('2026-07-15')).toBe('2026-07-16T00:00:00+03:00');
  });

  it('crosses a month and a year without arithmetic of its own', () => {
    expect(bucharestNextMidnight('2026-01-31')).toBe('2026-02-01T00:00:00+02:00');
    expect(bucharestNextMidnight('2026-12-31')).toBe('2027-01-01T00:00:00+02:00');
  });
});
