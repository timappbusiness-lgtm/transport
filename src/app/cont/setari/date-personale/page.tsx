import type { Metadata } from 'next';
import { DeletionPanel } from '@/components/account/deletion-panel';
import { ExportPanel } from '@/components/account/export-panel';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { personalDataCopy } from '@/content/date-personale';
import { loadPersonalData } from '@/lib/account-deletion-source';
import { requireAccountContext } from '@/lib/auth/account';

const c = personalDataCopy;

export const metadata: Metadata = { title: c.title };
export const dynamic = 'force-dynamic';

/**
 * Date personale.
 *
 * Both halves of Article 15 and Article 17 on one screen, because they
 * are the same decision seen from two sides: somebody who is leaving
 * usually wants their data first. The export sits above the deletion for
 * exactly that reason.
 */
export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountPersonalData);
  const data = await loadPersonalData(context);

  const email = context.profile?.email ?? context.user.email ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Setări</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      <ExportPanel latest={data.latestExport} />

      {data.companies.map((company) => (
        <DeletionPanel
          key={company.id}
          kind="company"
          companyId={company.id}
          confirmWith={company.name}
          graceDays={data.graceDays}
          blockers={company.blockers}
          request={data.companyRequests.find((row) => row.company_id === company.id) ?? null}
        />
      ))}

      <DeletionPanel
        kind="user"
        confirmWith={email}
        graceDays={data.graceDays}
        blockers={data.ownBlockers}
        request={data.own}
      />

      {data.supportEmail !== null ? (
        <p className="text-body text-muted">
          Dacă ceva de aici nu merge, scrie-ne la{' '}
          <a href={`mailto:${data.supportEmail}`} className="underline underline-offset-2">
            {data.supportEmail}
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
