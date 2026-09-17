import type { Metadata } from 'next';
import { changeMemberRoleAction, removeMemberAction, revokeInvitationAction } from '@/app/cont/actions';
import { InviteMemberForm, TransferOwnership } from '@/components/account/member-forms';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { MEMBER_ROLE_LABELS, accountCopy } from '@/content/account';
import { isManager } from '@/lib/auth/account';
import { requireManagerContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: accountCopy.members.title };

const ROLE_OPTIONS = ['admin', 'dispatcher', 'driver'] as const;

interface MemberRow {
  user_id: string;
  role: string;
  profile: { full_name: string | null; email: string | null } | null;
}

interface InvitationRow {
  id: string;
  invited_email: string;
  role: string;
  expires_at: string;
}

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export default async function Page() {
  // Managing the team is the owner's and the administrators'.
  const context = await requireManagerContext(ROUTES.accountMembers);
  const company = context.activeCompany;

  const supabase = await createClient();
  const [membersResult, invitationsResult] = await Promise.all([
    supabase
      .from('company_members')
      .select('user_id, role, profile:profiles(full_name, email)')
      .eq('company_id', company.id),
    supabase
      .from('company_invitations')
      .select('id, invited_email, role, expires_at')
      .eq('company_id', company.id)
      .eq('status', 'pending'),
  ]);

  const members: MemberRow[] = ((membersResult.data ?? []) as unknown[]).map((row) => {
    const record = row as {
      user_id: string;
      role: string;
      profile: MemberRow['profile'] | MemberRow['profile'][];
    };
    return {
      user_id: record.user_id,
      role: record.role,
      profile: Array.isArray(record.profile) ? (record.profile[0] ?? null) : record.profile,
    };
  });

  const invitations = (invitationsResult.data ?? []) as InvitationRow[];
  const canManage = isManager(context.activeRole);
  const isOwner = context.activeRole === 'owner';
  const c = accountCopy.members;

  const transferCandidates = members
    .filter((m) => m.role !== 'owner')
    .map((m) => ({
      userId: m.user_id,
      name: m.profile?.full_name ?? m.profile?.email ?? m.user_id,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{accountCopy.nav.company}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.lede}</p>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const isSelf = member.user_id === context.user.id;
            const name = member.profile?.full_name ?? member.profile?.email ?? '—';
            return (
              <li key={member.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {name}
                    {isSelf ? <span className="ml-2 text-xs text-muted">(tu)</span> : null}
                  </p>
                  {member.profile?.email ? (
                    <p className="truncate font-mono text-xs text-muted">{member.profile.email}</p>
                  ) : null}
                </div>

                {canManage && member.role !== 'owner' && !isSelf ? (
                  <form action={changeMemberRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={member.user_id} />
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                      {c.role}
                    </label>
                    <select
                      id={`role-${member.user_id}`}
                      name="role"
                      defaultValue={member.role}
                      className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-xs"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {MEMBER_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={buttonClasses('secondary', 'sm')}>
                      Salvează
                    </button>
                  </form>
                ) : (
                  <span className="font-mono text-xs text-muted">
                    {MEMBER_ROLE_LABELS[member.role] ?? member.role}
                  </span>
                )}

                {canManage && member.role !== 'owner' && !isSelf ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="userId" value={member.user_id} />
                    <button type="submit" className="text-xs text-danger underline-offset-4 hover:underline">
                      {c.remove}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
        {members.length <= 1 ? (
          <p className="border-t border-border px-5 py-4 text-sm text-muted">{c.empty}</p>
        ) : null}
      </section>

      {invitations.length > 0 ? (
        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-5 py-4 text-[1.0625rem]">{c.pending}</h2>
          <ul className="divide-y divide-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm">{invitation.invited_email}</p>
                  <p className="text-xs text-muted">
                    {MEMBER_ROLE_LABELS[invitation.role] ?? invitation.role} ·{' '}
                    {accountCopy.invitations.expires}{' '}
                    {dateFormat.format(new Date(invitation.expires_at))}
                  </p>
                </div>
                {canManage ? (
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <button type="submit" className="text-xs text-danger underline-offset-4 hover:underline">
                      {c.revoke}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-card border border-border bg-surface p-5">
          <h2 className="text-[1.0625rem]">{c.invite}</h2>
          <div className="mt-4">
            <InviteMemberForm />
          </div>
        </section>
      ) : (
        <p className="rounded-card border border-border bg-surface px-5 py-4 text-sm text-muted">
          {c.onlyManagers}
        </p>
      )}

      {isOwner ? <TransferOwnership candidates={transferCandidates} /> : null}
    </div>
  );
}
