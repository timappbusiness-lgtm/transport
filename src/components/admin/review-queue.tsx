import { EmptyFigure } from '@/components/ui/empty-state';
import { CompanyReview, DocumentReview } from '@/components/admin/review-forms';
import { StatusBadge } from '@/components/ui/primitives';
import { adminReviewCopy } from '@/content/admin';
import { formatDateRo } from '@/lib/format';

const c = adminReviewCopy;

export interface PendingDocument {
  id: string;
  kind: string;
  scope: string;
  valid_until: string | null;
  /** What the firm said the date is, when it uploaded. */
  declared: string | null;
  /** A short-lived link to the file, or null when none could be made. */
  fileUrl: string | null;
  created_at: string;
  companyName: string;
  plate: string | null;
  label: string;
  hasExpiry: boolean;
}

export interface PendingCompany {
  id: string;
  legal_name: string;
  cui: string;
  company_type: string;
  submitted_at: string;
  documentsTotal: number;
  documentsIn: number;
  vehicles: number;
  ready: boolean;
}

/**
 * The queue, given its rows rather than fetching them.
 *
 * Documents first, then the company: approving a company whose licence you
 * have not read is the one mistake that matters here, so the order of the
 * page is the order of the work.
 */
export function ReviewQueue({
  documents,
  companies,
}: {
  documents: PendingDocument[];
  companies: PendingCompany[];
}) {
  return (
    <>
      <section>
        <h2 className="text-h3">{c.documents.title}</h2>
        {documents.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-card border border-border bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">{doc.label}</p>
                  <p className="font-mono text-label text-muted">
                    {c.documents.uploaded(formatDateRo(doc.created_at))}
                  </p>
                </div>
                <p className="mt-1 text-small text-muted">
                  {c.documents.company}: {doc.companyName}
                  {doc.plate ? ` · ${c.documents.vehicle}: ${doc.plate}` : ''}
                </p>
                <p className="mt-1 font-mono text-small text-muted">
                  {doc.valid_until
                    ? `${c.documents.extracted}: ${formatDateRo(doc.valid_until)}`
                    : c.documents.noExtracted}
                </p>
                {doc.declared ? (
                  <p className="mt-1 font-mono text-small text-muted" data-declared-date>
                    {c.documents.declared}: {formatDateRo(doc.declared)}
                    {doc.valid_until && doc.valid_until !== doc.declared ? ` — ${c.documents.differs}` : ''}
                  </p>
                ) : null}
                {doc.fileUrl ? (
                  <p className="mt-2">
                    <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-small underline underline-offset-4" data-document-file>
                      {c.documents.open}
                    </a>
                  </p>
                ) : null}
                <div className="mt-4">
                  <DocumentReview
                    documentId={doc.id}
                    hasExpiry={doc.hasExpiry}
                    extractedValidUntil={doc.valid_until ?? doc.declared}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text={c.documents.empty} />
        )}
      </section>

      <section>
        <h2 className="text-h3">{c.companies.title}</h2>
        {companies.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {companies.map((company) => (
              <li
                key={company.id}
                className="rounded-card border border-border bg-surface p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">{company.legal_name}</p>
                  <p className="font-mono text-label text-muted">CUI {company.cui}</p>
                </div>
                <p className="mt-1 text-small text-muted">
                  {c.companies.documents(
                    String(company.documentsIn),
                    String(company.documentsTotal),
                  )}
                  {' · '}
                  {company.vehicles > 0
                    ? c.companies.vehicles(String(company.vehicles))
                    : c.companies.noVehicles}
                </p>
                <p className="mt-3">
                  <StatusBadge tone={company.ready ? 'success' : 'warning'}>
                    {company.ready ? c.companies.ready : c.companies.stillMissing}
                  </StatusBadge>
                </p>
                <div className="mt-4">
                  <CompanyReview companyId={company.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text={c.companies.empty} />
        )}
      </section>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2 rounded-card border border-border bg-surface px-5 py-12 text-center">
      <EmptyFigure kind="document" />
      <p className="text-body">{text}</p>
    </div>
  );
}
