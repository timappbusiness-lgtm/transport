import type { Metadata } from 'next';
import { acceptInvitationAction, declineInvitationAction } from '@/app/cont/actions';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { MEMBER_ROLE_LABELS, accountCopy } from '@/content/account';
import { requireAccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: accountCopy.invitations.title };

interface Row {
  id: string;
  role: string;
  expires_at: string;
  company: { legal_name: string; display_name: string | null } | null;
}

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export default async function Page() {
  await requireAccountContext(ROUTES.accountInvitations);

  // RLS on company_invitations only returns rows addressed to the caller's
  // confirmed e-mail, so there is no filter to write here — and no way to
  // read somebody else's.
  const supabase = await createClient();
  const { data } = await supabase
    .from('company_invitations')
    .select('id, role, expires_at, company:companies(legal_name, display_name)')
    .eq('status', 'pending');

  const invitations: Row[] = ((data ?? []) as unknown[]).map((row) => {
    const record = row as {
      id: string;
      role: string;
      expires_at: string;
      company: Row['company'] | Row['company'][];
    };
    return {
      id: record.id,
      role: record.role,
      expires_at: record.expires_at,
      company: Array.isArray(record.company) ? (record.company[0] ?? null) : record.company,
    };
  });

  const c = accountCopy.invitations;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Cont</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-body text-muted">{c.lede}</p>
      </div>

      {invitations.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-5 py-8 text-center text-body text-muted">
          {c.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-display text-body font-medium">
                  {invitation.company?.display_name ?? invitation.company?.legal_name ?? '—'}
                </p>
                <p className="mt-0.5 text-small text-muted">
                  {c.invitedAs} {MEMBER_ROLE_LABELS[invitation.role] ?? invitation.role} · {c.expires}{' '}
                  {dateFormat.format(new Date(invitation.expires_at))}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={acceptInvitationAction}>
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <button type="submit" className={buttonClasses('primary', 'sm')}>
                    {c.accept}
                  </button>
                </form>
                <form action={declineInvitationAction}>
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <button type="submit" className={buttonClasses('secondary', 'sm')}>
                    {c.decline}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
