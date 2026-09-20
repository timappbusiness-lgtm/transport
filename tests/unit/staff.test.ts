import { describe, expect, it } from 'vitest';
import {
  STAFF_ROLES,
  STAFF_ROLE_ABILITIES,
  STAFF_ROLE_LABELS,
  isLastAdmin,
  type StaffMember,
} from '@/lib/staff';

/**
 * `platform_staff` decides who may act on everybody else's data, so the
 * two things that matter are that the screen never offers an action the
 * database will refuse, and that it never claims a role can do something
 * nothing enforces.
 */

function member(over: Partial<StaffMember> = {}): StaffMember {
  return {
    user_id: 'u1',
    full_name: 'Ana Popescu',
    email: 'ana@example.com',
    role: 'admin',
    granted_at: '2026-09-01T08:00:00.000Z',
    granted_by: null,
    granted_by_name: null,
    ...over,
  };
}

describe('the last administrator', () => {
  it('is the only one when there is only one', () => {
    expect(isLastAdmin([member()], 'u1')).toBe(true);
  });

  it('is nobody once there are two', () => {
    const two = [member(), member({ user_id: 'u2', full_name: 'Ion Ionescu' })];
    expect(isLastAdmin(two, 'u1')).toBe(false);
    expect(isLastAdmin(two, 'u2')).toBe(false);
  });

  it('is not somebody who is not on the list at all', () => {
    expect(isLastAdmin([member()], 'u9')).toBe(false);
  });

  it('is nobody when the list is empty', () => {
    // Which should never happen — `set_platform_staff` refuses to remove
    // the last one — but an empty list must not make the screen throw.
    expect(isLastAdmin([], 'u1')).toBe(false);
  });
});

describe('what the screen says a role can do', () => {
  it('has a Romanian label for every role the enum has', () => {
    for (const role of STAFF_ROLES) {
      expect(STAFF_ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it('lists abilities for every role, and none for a role that does not exist', () => {
    expect(Object.keys(STAFF_ROLE_ABILITIES).sort()).toEqual([...STAFF_ROLES].sort());
    for (const role of STAFF_ROLES) {
      expect(STAFF_ROLE_ABILITIES[role].length).toBeGreaterThan(0);
    }
  });

  it('has exactly one role, which is what staff_role holds', () => {
    // If this fails, the enum gained a value and the abilities list and
    // the role selector both need to learn about it — which is the point
    // of failing here rather than shipping a label nothing enforces.
    expect(STAFF_ROLES).toEqual(['admin']);
  });
});
