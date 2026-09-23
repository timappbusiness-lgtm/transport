'use client';

import { useActionState, useId, useState } from 'react';
import {
  reviewCompanyAction,
  reviewDocumentAction,
  type ReviewState,
} from '@/app/admin/documente/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminReviewCopy } from '@/content/admin';
import { cn } from '@/lib/utils';

const EMPTY: ReviewState = {};
const c = adminReviewCopy;
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

/**
 * Approving or rejecting one document.
 *
 * The date field is prefilled with whatever `parse-document` read off the
 * file and is always editable: the extraction is a suggestion, and the
 * person looking at the document is the one who decides. `review_document()`
 * refuses an approval with no date when the requirement has an expiry, so a
 * blank field cannot slip through even if this form let it.
 */
export function DocumentReview({
  documentId,
  hasExpiry,
  extractedValidUntil,
}: {
  documentId: string;
  hasExpiry: boolean;
  extractedValidUntil: string | null;
}) {
  const [state, action] = useActionState(reviewDocumentAction, EMPTY);
  const [rejecting, setRejecting] = useState(false);
  const id = useId();

  if (state.notice) return <FormNotice>{state.notice}</FormNotice>;

  if (rejecting) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="document_id" value={documentId} />
        <input type="hidden" name="decision" value="reject" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className="text-small font-medium">
            {c.documents.rejectReason}
          </label>
          <textarea id={`${id}-reason`} name="reason" rows={2} className={cn(CONTROL, 'resize-y')} />
          {state.fieldErrors?.reason ? (
            <p className="text-small text-danger">{state.fieldErrors.reason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClasses('ink', 'sm')}>
            {c.documents.rejectSubmit}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.documents.cancel}
          </button>
        </div>
        {state.error ? <FormError>{state.error}</FormError> : null}
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="document_id" value={documentId} />
      <input type="hidden" name="decision" value="approve" />
      <input type="hidden" name="has_expiry" value={String(hasExpiry)} />

      {hasExpiry ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-until`} className="text-small font-medium">
            {c.documents.validUntil}
          </label>
          <input
            id={`${id}-until`}
            name="valid_until"
            type="date"
            defaultValue={extractedValidUntil ?? ''}
            className={cn(CONTROL, 'max-w-[12rem]')}
          />
          <p className="text-small text-muted">{c.documents.validUntilHint}</p>
          {state.fieldErrors?.valid_until ? (
            <p className="text-small text-danger">{state.fieldErrors.valid_until}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClasses('ink', 'sm')}>
          {c.documents.approve}
        </button>
        <button
          type="button"
          onClick={() => setRejecting(true)}
          className={buttonClasses('secondary', 'sm')}
        >
          {c.documents.reject}
        </button>
      </div>
      {state.error ? <FormError>{state.error}</FormError> : null}
    </form>
  );
}

/**
 * The decision on the company itself.
 *
 * Separate from the documents on purpose: approving every file is not the
 * same act as letting a company onto the exchange, and only the second one
 * lets it send offers.
 */
export function CompanyReview({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(reviewCompanyAction, EMPTY);
  const [rejecting, setRejecting] = useState(false);
  const id = useId();

  if (state.notice) return <FormNotice>{state.notice}</FormNotice>;

  if (rejecting) {
    return (
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="decision" value="reject" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-reason`} className="text-small font-medium">
            {c.companies.rejectReason}
          </label>
          <textarea id={`${id}-reason`} name="reason" rows={2} className={cn(CONTROL, 'resize-y')} />
          <p className="text-small text-muted">{c.companies.rejectHint}</p>
          {state.fieldErrors?.reason ? (
            <p className="text-small text-danger">{state.fieldErrors.reason}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClasses('ink', 'sm')}>
            {c.companies.rejectSubmit}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.companies.cancel}
          </button>
        </div>
        {state.error ? <FormError>{state.error}</FormError> : null}
      </form>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="decision" value="approve" />
      <button type="submit" className={buttonClasses('ink', 'sm')}>
        {c.companies.approve}
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className={buttonClasses('secondary', 'sm')}
      >
        {c.companies.reject}
      </button>
      {state.error ? <FormError>{state.error}</FormError> : null}
    </form>
  );
}
