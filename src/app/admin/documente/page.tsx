import { Badge, Card, PageHeader } from '@/components/app/badge';
import { ReviewForm } from '@/components/app/admin-forms';
import { requireStaff } from '@/lib/auth';
import { DOCUMENT_STATUS_LABELS } from '@/lib/documents';
import { formatDateRo } from '@/lib/format';
import { formatPlate } from '@/lib/vehicles';

interface Extracted {
  valid_until?: string | null;
  document_number?: string | null;
  holder_name?: string | null;
  plate_number?: string | null;
}

export default async function Page() {
  const { supabase } = await requireStaff();

  const [docsResult, requirementsResult] = await Promise.all([
    supabase
      .from('documents')
      .select('id, kind, scope, status, file_path, file_mime, valid_until, extracted, extraction_confidence, extraction_error, created_at, companies (legal_name, cui), vehicles (plate_number)')
      .in('status', ['uploaded', 'parsing', 'pending'])
      .order('created_at')
      .limit(50),
    supabase.from('document_requirements').select('scope, kind, label_ro, has_expiry'),
  ]);

  const docs = docsResult.data ?? [];
  const requirement = new Map((requirementsResult.data ?? []).map((r) => [`${r.scope}:${r.kind}`, r]));
  const { data: signed } = docs.length
    ? await supabase.storage.from('documents').createSignedUrls(docs.map((d) => d.file_path), 60 * 10)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl]] : [])));

  return (
    <>
      <PageHeader
        title="Documente de verificat"
        description="Citirea automată propune datele; tu confirmi pe document. Aprobarea unui document nou înlocuiește documentul valabil de același tip."
      />
      {docs.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">Niciun document în așteptare.</p>
        </Card>
      ) : (
        <ul className="grid gap-4">
          {docs.map((d) => {
            const req = requirement.get(`${d.scope}:${d.kind}`);
            const extracted = (d.extracted ?? {}) as Extracted;
            const url = urlByPath.get(d.file_path);
            return (
              <li key={d.id}>
                <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold">{req?.label_ro ?? d.kind}</h2>
                      <Badge tone="neutral">{DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm">
                      {d.companies?.legal_name} · CUI <span className="font-mono">{d.companies?.cui}</span>
                      {d.vehicles?.plate_number ? (
                        <>
                          {' '}
                          · <span className="font-mono">{formatPlate(d.vehicles.plate_number)}</span>
                        </>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">Încărcat la {formatDateRo(d.created_at)}</p>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium underline underline-offset-4">
                        Deschide documentul
                      </a>
                    ) : null}
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted">Citire automată</dt>
                      <dd>
                        {d.extraction_error
                          ? 'eșuată'
                          : d.extracted
                            ? `încredere ${Math.round(Number(d.extraction_confidence ?? 0) * 100)}%`
                            : 'nu a rulat'}
                      </dd>
                      {extracted.document_number ? (
                        <>
                          <dt className="text-muted">Număr</dt>
                          <dd className="font-mono">{extracted.document_number}</dd>
                        </>
                      ) : null}
                      {extracted.holder_name ? (
                        <>
                          <dt className="text-muted">Titular</dt>
                          <dd>{extracted.holder_name}</dd>
                        </>
                      ) : null}
                      {extracted.plate_number ? (
                        <>
                          <dt className="text-muted">Nr. auto</dt>
                          <dd className="font-mono">{extracted.plate_number}</dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                  <ReviewForm
                    documentId={d.id}
                    suggestedValidUntil={d.valid_until ?? extracted.valid_until ?? null}
                    needsExpiry={req?.has_expiry ?? true}
                  />
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
