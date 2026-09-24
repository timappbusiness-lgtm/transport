import { buttonClasses } from '@/components/ui/button';
import { contractFileRoute } from '@/config/routes';
import { contractCopy as c } from '@/content/contract';
import type { ContractCardState, ContractVersion } from '@/lib/contracts';
import { formatMoment } from '@/lib/orders';
import { AcceptContractForm, GenerateContractForm } from './contract-forms';

/**
 * „Contract de transport" on the order page.
 *
 * States in one card: nothing generated yet (one button), the latest
 * version with both parties' acceptance and the three things a party does
 * with it — open it, download it, accept it — and, one click away, the
 * earlier versions and a new one. The acceptance is shown as „Semnat de
 * X la …", with the line under it saying what that word means here.
 *
 * The file links are plain anchors, never `<Link>`: a prefetch of a route
 * that draws a PDF would draw it for nobody.
 */
export function ContractCard({
  orderId,
  state,
  unavailable = false,
}: {
  orderId: string;
  state: ContractCardState;
  /** The file route came back here because drawing failed. */
  unavailable?: boolean;
}) {
  const { latest } = state;
  return (
    <section
      id="contract"
      aria-labelledby="contract-title"
      className="scroll-mt-24 rounded-card border border-border bg-surface p-5"
      data-testid="contract-card"
    >
      <h2 id="contract-title" className="text-h3">
        {c.title}
      </h2>
      <p className="mt-1 max-w-[62ch] text-small text-muted">{c.lede}</p>

      {unavailable ? (
        <p role="status" className="mt-3 text-body">
          {c.unavailable}
        </p>
      ) : null}

      {latest === null ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-body text-muted">{c.none}</p>
          {state.canGenerate ? <GenerateContractForm orderId={orderId} /> : null}
          {state.mySide === 'staff' ? <p className="text-small text-muted">{c.staffNote}</p> : null}
        </div>
      ) : (
        <>
          <VersionSummary version={latest} />

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={contractFileRoute(orderId, latest.contractId)}
              target="_blank"
              rel="noopener"
              className={buttonClasses('secondary', 'sm')}
              data-testid="contract-preview"
            >
              {c.preview}
            </a>
            <a
              href={contractFileRoute(orderId, latest.contractId, true)}
              className={buttonClasses('secondary', 'sm')}
              data-testid="contract-download"
            >
              {c.download}
            </a>
          </div>

          {state.canAccept ? (
            <div className="mt-4">
              <AcceptContractForm orderId={orderId} contractId={latest.contractId} version={latest.version} />
            </div>
          ) : state.acceptedByMe && !state.bothAccepted ? (
            <p className="mt-3 text-small text-muted">{c.accept.mine}</p>
          ) : null}

          {state.mySide === 'staff' ? <p className="mt-3 text-small text-muted">{c.staffNote}</p> : null}
          {state.cancelled ? <p className="mt-3 text-small text-muted">{c.cancelled}</p> : null}

          {state.earlier.length > 0 || state.canGenerate ? (
            <details className="mt-5 border-t border-border pt-4">
              <summary className="cursor-pointer text-body font-medium">
                {state.earlier.length > 0 ? `${c.history} (${state.earlier.length})` : c.regenerate}
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {state.earlier.map((version) => (
                  <div key={version.contractId} className="border-b border-border pb-4 last:border-b-0">
                    <VersionSummary version={version} compact />
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-small">
                      <a
                        href={contractFileRoute(orderId, version.contractId)}
                        target="_blank"
                        rel="noopener"
                        className="link-accent"
                      >
                        {c.preview}
                      </a>
                      <a href={contractFileRoute(orderId, version.contractId, true)} className="link-accent">
                        {c.download}
                      </a>
                    </p>
                  </div>
                ))}
                {state.canGenerate ? <GenerateContractForm orderId={orderId} again /> : null}
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function VersionSummary({ version, compact = false }: { version: ContractVersion; compact?: boolean }) {
  const accepted = version.carrierAcceptedAt !== null || version.clientAcceptedAt !== null;
  const both = version.carrierAcceptedAt !== null && version.clientAcceptedAt !== null;
  return (
    <div className={compact ? '' : 'mt-4'}>
      <p className="text-body font-medium [overflow-wrap:anywhere]">
        {c.versionLine(version.version, version.contractNumber)}
      </p>
      <p className="text-small text-muted">
        {c.generatedLine(formatMoment(version.generatedAt), version.generatedByName)}
      </p>
      <dl className="mt-3 flex flex-col">
        <Side label={c.sides.carrier} name={version.carrierAcceptedBy} at={version.carrierAcceptedAt} />
        <Side label={c.sides.client} name={version.clientAcceptedBy} at={version.clientAcceptedAt} />
      </dl>
      {!compact && both ? <p className="mt-2 text-body">{c.bothAccepted}</p> : null}
      {!compact && accepted ? <p className="mt-2 max-w-[62ch] text-small text-muted">{c.whatSigned}</p> : null}
    </div>
  );
}

function Side({ label, name, at }: { label: string; name: string | null; at: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-small text-muted sm:w-[9rem] sm:flex-none">{label}</dt>
      <dd className="min-w-0 text-body [overflow-wrap:anywhere]" data-accepted={at !== null ? 'da' : 'nu'}>
        {at !== null ? c.signedBy(name ?? '—', formatMoment(at)) : c.notYet}
      </dd>
    </div>
  );
}
