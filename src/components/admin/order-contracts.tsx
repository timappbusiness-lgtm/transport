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
                <dd className="min-w-0 break-all font-mono">{v.snapshotHash}</dd>
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
                // One block per acceptance rather than a six-column table:
                // a table squeezed to a phone broke a firm's name one
                // letter per line.
                <ul className="mt-2 flex flex-col gap-2">
                  {v.acceptances.map((a) => (
                    <li
                      key={`${v.contractId}-${a.side}`}
                      className="rounded-input border border-border bg-ground-alt p-3"
                    >
                      <dl className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-[8rem_minmax(0,1fr)]">
                        <dt className="text-muted">{c.side}</dt>
                        <dd>{SIDE[a.side]}</dd>
                        <dt className="text-muted">{c.who}</dt>
                        <dd className="min-w-0 break-words">
                          {a.name ?? '—'}
                          {a.companyName !== null ? <span className="block text-muted">{a.companyName}</span> : null}
                        </dd>
                        <dt className="text-muted">{c.when}</dt>
                        <dd>{formatMoment(a.acceptedAt)}</dd>
                        <dt className="text-muted">{c.ip}</dt>
                        <dd className="min-w-0 break-all font-mono">{a.ip ?? '—'}</dd>
                        <dt className="text-muted">{c.userAgent}</dt>
                        <dd className="min-w-0 break-words">{a.userAgent ?? '—'}</dd>
                        <dt className="text-muted">{c.user}</dt>
                        <dd className="min-w-0 break-all font-mono">{a.userId ?? '—'}</dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
