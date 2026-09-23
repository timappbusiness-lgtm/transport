import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DocumentUpload } from '@/components/account/document-upload';
import { PhotoExample } from '@/components/onboarding/photo-example';
import { StatusBadge } from '@/components/ui/primitives';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES, companyDocumentRoute } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { onboardingCopy } from '@/content/onboarding';
import { requireAccountContext } from '@/lib/auth/account';
import {
  DISPLAY_STATUS,
  REQUIREMENT_STATE,
  documentDisplayStatus,
  isRequirementState,
} from '@/lib/documents';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type DocumentKind = Database['public']['Enums']['document_kind'];

export const metadata: Metadata = { title: accountCopy.documents.title };

interface Requirement {
  kind: string | null;
  label_ro: string | null;
  is_blocking: boolean | null;
  state: string | null;
  valid_until: string | null;
}

/**
 * One document, on one screen.
 *
 * The list is still the list — nothing was taken off it. What this adds
 * is the screen a person is actually on while they do the work: one
 * document named, a drawing of what a usable photograph looks like, the
 * camera first, and, where the rule allows it, „îl adaug mai târziu".
 *
 * „Where the rule allows it" is `is_blocking`, read from
 * `v_company_missing_documents` — the same column the review RPC reads.
 * A blocking document has no skip, because skipping it would mean a
 * verification that cannot finish, and a button that leads nowhere is
 * worse than no button.
 */
export default async function Page({ params }: { params: Promise<{ tip: string }> }) {
  const { tip } = await params;
  const context = await requireAccountContext(companyDocumentRoute(tip));
  const company = context.activeCompany;
  if (!company) redirect(ROUTES.accountCompanyCreate);

  const supabase = await createClient();
  const { data } = await supabase
    .from('v_company_missing_documents')
    .select('kind, label_ro, is_blocking, state, valid_until')
    .eq('company_id', company.id)
    .order('is_blocking', { ascending: false });

  const rows = (data ?? []) as Requirement[];
  const index = rows.findIndex((row) => row.kind === tip);
  // A document this firm is not asked for is not a document it may not
  // see — it is one that does not exist for it.
  if (index < 0) notFound();

  const row = rows[index]!;
  const next = rows[index + 1] ?? null;
  const c = onboardingCopy.documents;
  const state = isRequirementState(row.state) ? REQUIREMENT_STATE[row.state] : null;
  const display = row.state === 'ok' ? documentDisplayStatus(row.valid_until) : null;
  const badge = display ? DISPLAY_STATUS[display] : state;

  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-6">
      <div>
        <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">
          {c.stepOf(index + 1, rows.length)}
        </p>
        <h1 className="mt-2 text-h2">{row.label_ro}</h1>
        <p className="mt-2 text-body text-muted">{row.is_blocking ? c.blocking : c.optional}</p>
        {badge ? (
          <p className="mt-3">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </p>
        ) : null}
      </div>

      <figure className="rounded-card border border-border bg-surface p-4 shadow-card">
        <PhotoExample className="w-full" />
        <figcaption className="mt-3">
          <span className="font-medium">{c.example}</span>
          <span className="mt-1 block text-small text-muted">{c.exampleBody}</span>
        </figcaption>
      </figure>

      <DocumentUpload
        companyId={company.id}
        kinds={[{ kind: row.kind as DocumentKind, label: row.label_ro ?? '' }]}
        cameraFirst
      />

      <div className="flex flex-col gap-2 border-t border-border pt-5">
        {row.is_blocking ? null : (
          <>
            <Link
              href={next === null ? ROUTES.accountDocuments : companyDocumentRoute(next.kind ?? '')}
              className={`${buttonClasses('secondary', 'sm')} self-start`}
            >
              {c.later}
            </Link>
            <p className="text-small text-muted">{c.laterNote}</p>
          </>
        )}
        <p className="text-small">
          <Link href={ROUTES.accountDocuments} className="text-muted underline underline-offset-4">
            ← {accountCopy.documents.title}
          </Link>
        </p>
      </div>
    </div>
  );
}
