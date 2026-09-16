import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revokeInvitation } from '@/app/actions/company';
import { ActionButtonForm } from '@/components/app/action-form';
import { Badge, Card, PageHeader } from '@/components/app/badge';
import { InviteMemberForm, TransferOwnershipForm } from '@/components/app/company-forms';
import { RequirementList } from '@/components/app/requirement-list';
import { buttonClasses } from '@/components/ui/button';
import { companyRoutes } from '@/config/routes';
import { requireMembership } from '@/lib/auth';
import { COMPANY_TYPE_LABELS, ROLE_LABELS, VERIFICATION_STATUS, isManagerRole } from '@/lib/companies';
import { formatDateRo } from '@/lib/format';

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { session, membership } = await requireMembership(companyId);
  const { supabase } = session;
  const manager = isManagerRole(membership.role);
  const routes = companyRoutes(companyId);

  const [companyResult, requirementsResult, vehiclesResult, membersResult, invitationsResult] = await Promise.all([
    supabase
      .from('companies')
      .select('id, legal_name, display_name, cui, company_type, county, city, verification_status, is_suspended, suspension_reason, anaf_checked_at, anaf_is_inactive')
      .eq('id', companyId)
      .maybeSingle(),
    supabase
      .from('v_company_missing_documents')
      .select('kind, label_ro, is_blocking, state, valid_until')
      .eq('company_id', companyId)
      .order('is_blocking', { ascending: false }),
    supabase.from('vehicles').select('id, is_compliant').eq('company_id', companyId),
    supabase.rpc('list_company_members', { p_company_id: companyId }),
    manager
      ? supabase
          .from('company_invitations')
          .select('id, invited_email, role, expires_at')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at')
      : Promise.resolve({ data: [] as { id: string; invited_email: string; role: 'admin' | 'dispatcher' | 'driver' | 'owner'; expires_at: string }[] }),
  ]);

  const company = companyResult.data;
  if (!company) notFound();

  const status = VERIFICATION_STATUS[company.verification_status];
  const requirements = requirementsResult.data ?? [];
  const missing = requirements.filter((r) => r.is_blocking && r.state !== 'ok').length;
  const vehicles = vehiclesResult.data ?? [];
  const members = membersResult.data ?? [];

  return (
    <>
      <PageHeader
        title={company.display_name ?? company.legal_name}
        description={
          <>
            CUI <span className="font-mono">{company.cui}</span> · {COMPANY_TYPE_LABELS[company.company_type]}
            {company.city ? ` · ${company.city}` : ''}
            {company.county ? `, ${company.county}` : ''}
          </>
        }
        actions={
          <>
            <Link href={routes.documents} className={buttonClasses('primary', 'sm')}>
              Documente
            </Link>
            <Link href={routes.fleet} className={buttonClasses('secondary', 'sm')}>
              Flotă
            </Link>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Verificare</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {company.is_suspended ? (
            <p className="mt-3 rounded-[6px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {company.suspension_reason ?? 'Firma este suspendată.'} Poți încărca documentele noi; anunțurile revin
              automat după aprobare, dacă sunt încă în termen.
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted">
            {missing === 0
              ? 'Toate documentele obligatorii sunt aprobate și valabile.'
              : `${missing} ${missing === 1 ? 'document obligatoriu lipsește sau nu este încă aprobat' : 'documente obligatorii lipsesc sau nu sunt încă aprobate'}.`}
          </p>
          <p className="mt-1 text-sm text-muted">
            ANAF:{' '}
            {company.anaf_checked_at
              ? company.anaf_is_inactive
                ? 'firmă inactivă sau radiată.'
                : `activă, verificat la ${formatDateRo(company.anaf_checked_at)}.`
              : 'neverificat încă.'}
          </p>
          <div className="mt-4 border-t border-border pt-2">
            <RequirementList rows={requirements} />
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-lg font-bold">Flotă</h2>
            <p className="mt-2 text-sm text-muted">
              {vehicles.length === 0
                ? 'Niciun vehicul înregistrat.'
                : `${vehicles.length} ${vehicles.length === 1 ? 'vehicul' : 'vehicule'}, ${vehicles.filter((v) => v.is_compliant).length} cu documentele în regulă.`}
            </p>
            <Link href={routes.fleet} className={`${buttonClasses('secondary', 'sm')} mt-4`}>
              Vezi flota
            </Link>
          </Card>

          <Card>
            <h2 className="text-lg font-bold">Membri</h2>
            <ul className="mt-3 divide-y divide-border">
              {members.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{m.full_name || m.email}</span>
                    <span className="block break-all text-xs text-muted">{m.email}</span>
                  </span>
                  <Badge tone={m.role === 'owner' ? 'ok' : 'neutral'}>{ROLE_LABELS[m.role]}</Badge>
                </li>
              ))}
            </ul>

            {manager ? (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-3 text-base font-bold">Invită un membru</h3>
                <InviteMemberForm companyId={companyId} />
                {(invitationsResult.data ?? []).length > 0 ? (
                  <ul className="mt-4 grid gap-2">
                    {(invitationsResult.data ?? []).map((inv) => (
                      <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-border px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block break-all">{inv.invited_email}</span>
                          <span className="block text-xs text-muted">
                            {ROLE_LABELS[inv.role]} · în așteptare până la {formatDateRo(inv.expires_at)}
                          </span>
                        </span>
                        <ActionButtonForm
                          action={revokeInvitation}
                          fields={{ invitation_id: inv.id, company_id: companyId }}
                          label="Retrage"
                          variant="ghost"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </Card>

          {membership.role === 'owner' ? (
            <Card>
              <h2 className="text-lg font-bold">Transferă proprietatea</h2>
              <p className="mt-1 mb-4 text-sm text-muted">Firma are un singur proprietar. Transferul este înregistrat.</p>
              <TransferOwnershipForm
                companyId={companyId}
                members={members
                  .filter((m) => m.role !== 'owner')
                  .map((m) => ({ userId: m.user_id, name: m.full_name || m.email }))}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
