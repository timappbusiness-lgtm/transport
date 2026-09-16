import Link from 'next/link';
import { respondToInvitation } from '@/app/actions/company';
import { ActionButtonForm } from '@/components/app/action-form';
import { Badge, Card, PageHeader } from '@/components/app/badge';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES, companyRoutes } from '@/config/routes';
import { requireSession } from '@/lib/auth';
import { ROLE_LABELS, VERIFICATION_STATUS } from '@/lib/companies';
import { formatDateRo } from '@/lib/format';

export default async function Page() {
  const session = await requireSession(ROUTES.account);
  const { profile, memberships, supabase } = session;
  const { data: invitations } = await supabase.rpc('my_invitations');
  const isIndividual = profile.account_type === 'individual';

  return (
    <>
      <PageHeader
        title={`Bună, ${profile.full_name?.split(' ')[0] || 'bine ai venit'}`}
        description={isIndividual ? 'Cont de persoană fizică.' : 'Cont de firmă.'}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {invitations && invitations.length > 0 ? (
          <Card className="lg:col-span-2">
            <h2 className="text-lg font-bold">Invitații</h2>
            <ul className="mt-3 grid gap-3">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3 first:border-t-0 first:pt-0">
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-medium">{inv.company_name}</span> te invită ca{' '}
                      <span className="font-medium">{ROLE_LABELS[inv.role]}</span>
                      {inv.invited_by_name ? <> (de la {inv.invited_by_name})</> : null}.
                    </p>
                    <p className="text-muted">Valabilă până la {formatDateRo(inv.expires_at)}.</p>
                  </div>
                  <div className="flex gap-2">
                    <ActionButtonForm
                      action={respondToInvitation}
                      fields={{ invitation_id: inv.id, decision: 'accept' }}
                      label="Accept"
                      variant="primary"
                    />
                    <ActionButtonForm
                      action={respondToInvitation}
                      fields={{ invitation_id: inv.id, decision: 'decline' }}
                      label="Refuz"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {isIndividual ? (
          <Card>
            <h2 className="text-lg font-bold">Telefon</h2>
            {profile.phone_verified ? (
              <p className="mt-2 text-sm">
                <Badge tone="ok">Confirmat</Badge> <span className="ml-2 font-mono">{profile.phone}</span>
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  Confirmă numărul de telefon ca să poți publica o cerere și să contactezi transportatori.
                </p>
                <Link href={ROUTES.phone} className={`${buttonClasses('primary', 'sm')} mt-4`}>
                  Confirmă telefonul
                </Link>
              </>
            )}
          </Card>
        ) : (
          <Card>
            <h2 className="text-lg font-bold">Firmele mele</h2>
            {memberships.length === 0 ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Înregistrează firma cu CUI-ul ei. După ce încarci documentele și sunt aprobate, firma devine verificată.
                </p>
                <Link href={ROUTES.newCompany} className={`${buttonClasses('primary', 'sm')} mt-4`}>
                  Înregistrează firma
                </Link>
              </>
            ) : (
              <ul className="mt-3 grid gap-2">
                {memberships.map((m) => {
                  const status = VERIFICATION_STATUS[m.verificationStatus];
                  return (
                    <li key={m.companyId}>
                      <Link
                        href={companyRoutes(m.companyId).overview}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border px-3 py-2.5 hover:border-muted"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{m.name}</span>
                          <span className="block text-xs text-muted">{ROLE_LABELS[m.role]}</span>
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <h2 className="text-lg font-bold">Date de cont</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Nume</dt>
            <dd>{profile.full_name || '—'}</dd>
            <dt className="text-muted">E-mail</dt>
            <dd className="break-all">{profile.email}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
