import { contractCardRoute, contractFileRoute } from '@/config/routes';
import { contractCopy } from '@/content/contract';
import type { AdminContractVersion } from '@/lib/contracts-source';
import { formatMoment } from '@/lib/orders';

const c = contractCopy.admin;

const SIDE: Record<string, string> = {
  carrier: 'transportatorul',
  client: 'beneficiarul',
  staff: 'echipa',
};

/**
 * Every version of an order's contract and the full acceptance record,
 * for staff: who, for which firm, when, from which address and browser,
 * against which fingerprint. The parties see names and times; the IP
 * address and the browser are here only, read through
 * `admin_order_contracts()`, which refuses everybody else.
 */
export function OrderContracts({
  orderId,
  versions,
}: {
  orderId: string;
  versions: readonly AdminContractVersion[];
}) {
  return (
    <section
      aria-labelledby="admin-contract"
      className="rounded-card border border-border bg-surface p-5"
      data-testid="admin-contracts"
    >
      <h2 id="admin-contract" className="text-h3">
        {c.title}
      </h2>
      {versions.length === 0 ? (
        <p className="mt-2 text-body text-muted">
          {c.none}{' '}
          <a href={contractCardRoute(orderId)} className="underline underline-offset-4">
            {contractCopy.generate}
          </a>
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-5">
          {versions.map((v) => (
            <li key={v.contractId} className="border-b border-border pb-5 last:border-b-0 last:pb-0">
              <p className="text-body font-medium [overflow-wrap:anywhere]">
                {contractCopy.versionLine(v.version, v.contractNumber)}
              </p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-small sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-muted">{c.generatedBy}</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">
                  {v.generatedByName ?? '—'} ({SIDE[v.generatedBySide ?? ''] ?? v.generatedBySide ?? '—'}),{' '}
                  {formatMoment(v.generatedAt)}
                </dd>
                <dt className="text-muted">{c.template}</dt>
                <dd>{v.templateVersion}</dd>
                <dt className="text-muted">{c.hash}</dt>
                <dd className="min-w-0 font-mono [overflow-wrap:anywhere]">{v.snapshotHash}</dd>
                {v.redactedAt !== null ? (
                  <>
                    <dt className="text-muted">{c.redacted}</dt>
                    <dd>{formatMoment(v.redactedAt)}</dd>
                  </>
                ) : null}
              </dl>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small">
                <a
                  href={contractFileRoute(orderId, v.contractId)}
                  target="_blank"
                  rel="noopener"
                  className="underline underline-offset-4"
                >
                  {contractCopy.preview}
                </a>
                <a href={contractFileRoute(orderId, v.contractId, true)} className="underline underline-offset-4">
                  {contractCopy.download}
                </a>
              </p>

              <h3 className="mt-3 text-body font-medium">{c.acceptances}</h3>
              {v.acceptances.length === 0 ? (
                <p className="mt-1 text-small text-muted">{c.noAcceptances}</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-small">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">{c.side}</th>
                        <th className="py-1 pr-3 font-medium">{c.who}</th>
                        <th className="py-1 pr-3 font-medium">{c.when}</th>
                        <th className="py-1 pr-3 font-medium">{c.ip}</th>
                        <th className="py-1 pr-3 font-medium">{c.userAgent}</th>
                        <th className="py-1 font-medium">{c.user}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.acceptances.map((a) => (
                        <tr key={`${v.contractId}-${a.side}`} className="border-t border-border align-top">
                          <td className="py-1.5 pr-3">{SIDE[a.side]}</td>
                          <td className="py-1.5 pr-3 [overflow-wrap:anywhere]">
                            {a.name ?? '—'}
                            {a.companyName !== null ? <span className="block text-muted">{a.companyName}</span> : null}
                          </td>
                          <td className="whitespace-nowrap py-1.5 pr-3">{formatMoment(a.acceptedAt)}</td>
                          <td className="py-1.5 pr-3 font-mono">{a.ip ?? '—'}</td>
                          <td className="max-w-[18rem] py-1.5 pr-3 [overflow-wrap:anywhere]">{a.userAgent ?? '—'}</td>
                          <td className="py-1.5 font-mono [overflow-wrap:anywhere]">{a.userId ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
