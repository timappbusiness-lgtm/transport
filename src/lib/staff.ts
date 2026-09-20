/**
 * Echipa platformei: who works here, and what that lets them do.
 *
 * `platform_staff` has existed since 20260916130000 and could only be
 * changed from a SQL console, which means in practice it was changed by
 * whoever had the database password — the opposite of what an audited
 * table is for.
 *
 * One role today. `staff_role` is an enum with a single value, `admin`,
 * and `is_platform_admin()` is the only thing that reads it, so a second
 * role would be a label the schema does not enforce. The list below is
 * driven off the enum rather than written out at the call sites, so the
 * day a real second role arrives it is one entry here and nothing else.
 */

export type StaffRole = 'admin';

export const STAFF_ROLES: readonly StaffRole[] = ['admin'];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Administrator',
};

/**
 * What the role actually allows, checked against the screens that exist.
 *
 * Every line here is something `is_platform_admin()` gates in a policy or
 * a SECURITY DEFINER function. Nothing aspirational.
 */
export const STAFF_ROLE_ABILITIES: Record<StaffRole, readonly string[]> = {
  admin: [
    'Verifică firmele și documentele lor.',
    'Suspendă o firmă sau îi ridică suspendarea.',
    'Închide sesizările și îi răspunde celui care a sesizat.',
    'Schimbă prețurile orientative, dotările, serviciile și paginile de destinație.',
    'Aprobă cererile de abonament și schimbă planurile.',
    'Marchează un telefon ca verificat și un cont ca fiind al nostru.',
    'Anonimizează un cont la cerere sau la ordin.',
    'Citește jurnalul de acțiuni și îl exportă.',
    'Adaugă și scoate oameni din echipa platformei.',
  ],
};

export interface StaffMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: StaffRole;
  granted_at: string;
  granted_by: string | null;
  granted_by_name: string | null;
}

/**
 * Whether this person is the last administrator.
 *
 * `set_platform_staff` refuses to remove them, with its own Romanian
 * sentence. This only hides the button, so nobody types a reason for an
 * action that was never going to happen.
 */
export function isLastAdmin(members: readonly StaffMember[], userId: string): boolean {
  const admins = members.filter((member) => member.role === 'admin');
  return admins.length === 1 && admins[0]?.user_id === userId;
}
