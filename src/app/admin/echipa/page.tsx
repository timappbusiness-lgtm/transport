import { GrantStaff, RevokeStaff } from '@/components/admin/team-forms';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { teamCopy } from '@/content/echipa';
import { getAccountContext } from '@/lib/auth/account';
import { STAFF_ROLES, STAFF_ROLE_ABILITIES, STAFF_ROLE_LABELS, isLastAdmin } from '@/lib/staff';
import { loadStaffMembers } from '@/lib/staff-source';

export const dynamic = 'force-dynamic';

const c = teamCopy;

function when(value: string): string {
  return new Date(value).toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Echipa platformei.
 *
 * `platform_staff` could only be changed from a SQL console until now,
 * which in practice meant it was changed by whoever had the database
 * password — the opposite of what an audited table is for. Everything
 * here goes through `set_platform_staff()`: staff only, a reason
 * required, an `audit_log` row written, and the last administrator
 * refused.
 */
export default async function Page() {
  const [members, context] = await Promise.all([loadStaffMembers(), getAccountContext()]);
  const me = context?.user.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.hero.lede}</p>
      </div>

      <section aria-labelledby="cine" className="flex flex-col gap-3">
        <h2 id="cine" className="text-h3">
          {c.list.title}
        </h2>

        {members.length === 0 ? (
          <p className="rounded-card border border-warning/45 bg-warning/8 p-4 text-body">
            {c.list.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {members.map((member) => {
              const last = isLastAdmin(members, member.user_id);
              return (
                <li key={member.user_id} className="rounded-card border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-lg">
                        {member.full_name ?? member.email ?? member.user_id}
                        {member.user_id === me ? (
                          <span className="text-muted"> ({c.list.you})</span>
                        ) : null}
                      </p>
                      {member.email !== null ? (
                        <p className="mt-0.5 break-all text-body text-muted">{member.email}</p>
                      ) : null}
                    </div>
                    <StatusBadge tone="neutral">{STAFF_ROLE_LABELS[member.role]}</StatusBadge>
                  </div>

                  <dl className="mt-4 grid gap-3 text-body sm:grid-cols-2">
                    <div>
                      <dt className="text-small text-muted">{c.list.grantedAt}</dt>
                      <dd className="mt-0.5">{when(member.granted_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-small text-muted">{c.list.grantedBy}</dt>
                      <dd className="mt-0.5">
                        {member.granted_by_name ?? c.list.grantedByUnknown}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    {last ? (
                      <p className="text-body text-muted">{c.list.lastAdmin}</p>
                    ) : (
                      <RevokeStaff member={member} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="adauga" className="rounded-card border border-border bg-surface p-5">
        <h2 id="adauga" className="text-h3">
          {c.add.title}
        </h2>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.add.lede}</p>
        <GrantStaff />
      </section>

      <section aria-labelledby="poate" className="rounded-card border border-border bg-ground-alt p-5">
        <h2 id="poate" className="text-h3">
          {c.abilities.title}
        </h2>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.abilities.lede}</p>

        {STAFF_ROLES.map((role) => (
          <div key={role} className="mt-4">
            <p className="text-body font-medium">{STAFF_ROLE_LABELS[role]}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {STAFF_ROLE_ABILITIES[role].map((line) => (
                <li key={line} className="text-body text-muted">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {STAFF_ROLES.length === 1 ? (
          <p className="mt-4 max-w-[62ch] text-body text-muted">{c.abilities.oneRole}</p>
        ) : null}
      </section>
    </div>
  );
}
