import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { Checklist, type ChecklistStep } from '@/components/account/checklist';
import { PhoneVerification } from '@/components/account/phone-verification';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { accountStage, requireAccountContext, type Company } from '@/lib/auth/account';
import { cn } from '@/lib/utils';

/**
 * Only the first two steps of either checklist exist today. The rest are
 * shown disabled and marked "în curând" — deliberately, so the shape of the
 * work is visible from day one.
 */
function carrierSteps(company: Company): ChecklistStep[] {
  const companyDone = company.verification_status !== 'draft';
  return [
    { key: 'company', label: 'Date firmă', state: companyDone ? 'done' : 'current' },
    { key: 'documents', label: 'Documente firmă', state: 'soon' },
    { key: 'vehicles', label: 'Vehicule și documente', state: 'soon' },
    { key: 'verification', label: 'Verificare', state: 'soon' },
    { key: 'publish', label: 'Publică primul traseu', state: 'soon' },
  ];
}

function forwarderSteps(company: Company): ChecklistStep[] {
  const companyDone = company.verification_status !== 'draft';
  return [
    { key: 'company', label: 'Date firmă', state: companyDone ? 'done' : 'current' },
    { key: 'documents', label: 'Documente firmă', state: 'soon' },
    { key: 'verification', label: 'Verificare', state: 'soon' },
    { key: 'publish', label: 'Publică prima cerere', state: 'soon' },
  ];
}

export default async function Page() {
  const context = await requireAccountContext(ROUTES.account);
  const stage = accountStage(context);
  const firstName = context.profile?.full_name?.split(' ')[0] ?? '';

  if (stage === 'needs-company') {
    const c = accountCopy.needsCompany;
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <h1 className="text-[1.5rem]">{c.title}</h1>
        <p className="mt-2 max-w-[52ch] text-sm text-muted">{c.lede}</p>
        <Link
          href={ROUTES.accountCompanyCreate}
          className={cn(buttonClasses('primary', 'md'), 'mt-5')}
        >
          {c.action}
        </Link>
      </div>
    );
  }

  if (stage === 'individual') {
    const c = accountCopy.individual;
    return (
      <div className="flex flex-col gap-6">
        <div>
          <EyebrowPill>{c.welcome}</EyebrowPill>
          <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">
            {firstName === '' ? c.welcome : `Bine ai venit, ${firstName}`}
          </h1>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.lede}</p>
        </div>

        <PhoneVerification
          phone={context.profile?.phone ?? ''}
          verified={context.profile?.phone_verified ?? false}
        />

        <section className="rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-5 py-4 text-[1.0625rem]">
            {c.requests.title}
          </h2>
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <span aria-hidden="true" className="text-muted">
              <Inbox size={22} />
            </span>
            <p className="text-sm">{c.requests.empty}</p>
            <p className="font-mono text-[0.6875rem] text-muted">{c.requests.emptyHint}</p>
          </div>
        </section>
      </div>
    );
  }

  const company = context.activeCompany;
  if (!company) return null;

  const isCarrier = company.company_type === 'transport' || company.company_type === 'both';
  const copy = isCarrier ? accountCopy.checklist.carrier : accountCopy.checklist.forwarder;
  const steps = isCarrier ? carrierSteps(company) : forwarderSteps(company);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Contul meu</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">
          {firstName === '' ? 'Bine ai venit' : `Bine ai venit, ${firstName}`}
        </h1>
      </div>
      <Checklist title={copy.title} steps={steps} />
    </div>
  );
}
