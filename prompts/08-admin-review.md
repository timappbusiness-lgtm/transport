# Prompt 08 — Admin panel: document review

**Prerequisites:** prompts 01–03 (07 optional).

This is the screen the business runs on. Every minute saved per document is
paid staff time, so optimise it for a reviewer doing fifty in a row: keyboard
first, document and fields side by side, one click to approve.

---

## Lovable prompt

```
Add the platform admin panel. Create only the files listed. Do NOT modify any
existing customer-facing page.

ACCESS
Admin routes are visible only when profiles.is_platform_admin is true. Guard
them in a route wrapper, and remember the real enforcement is in the database
(review_document raises 42501 for non-admins) - the UI guard is convenience,
not security.

CREATE

1. src/components/admin/RequireAdmin.tsx
   Route guard: redirects non-admins to /dashboard without an error flash.

2. src/hooks/useAdminDocuments.ts
   Query documents with status "pending", ordered so the risky ones surface
   first: extraction_confidence ascending nulls first, then created_at ascending.
   Joins company (legal_name, cui) and vehicle (plate_number).
   Mutation reviewDocument(documentId, approve, validUntil?, rejectionReason?)
   calling the review_document RPC. Never update the documents table directly -
   the RPC is the audited path and it also promotes the company to verified.

3. src/components/admin/DocumentReviewCard.tsx
   Split view, the reviewer's whole world on one screen:
   - LEFT: the document itself. Images render inline with zoom and rotate;
     PDFs in an iframe. Use a signed URL valid for 5 minutes, regenerated on
     demand - never a long-lived public URL.
   - RIGHT: the extracted fields as editable inputs, pre-filled from the
     `extracted` jsonb: document type, number, issued_at, valid_from,
     valid_until, holder name, holder CUI, plate number.
     Above them, context: company name + CUI, what kind the user declared,
     and the vehicle plate when it is a vehicle document.
     Warnings, prominent:
     - extraction_confidence < 0.7 -> amber "Citire nesigură, verifică atent"
     - issues array not empty -> list each one
     - detected_kind differs from the declared kind -> red "Utilizatorul a
       declarat {declared}, documentul pare a fi {detected}"
     - valid_until already in the past -> red "Documentul este deja expirat"
   - Buttons: "Aprobă" (primary), "Respinge" (opens a reason field with quick
     picks: "Poză ilizibilă", "Document expirat", "Document greșit",
     "Date care nu corespund firmei").
   Keyboard: A approves, R opens reject, arrow keys move between documents.
   A reviewer doing fifty in a row should never need the mouse.

4. src/pages/admin/ReviewQueue.tsx at route /admin/verificare
   The queue, one DocumentReviewCard at a time, with "n documente în așteptare"
   and a progress counter. After a decision, advance to the next automatically.

5. src/pages/admin/Companies.tsx at route /admin/firme
   Table: name, CUI, type, verification_status, is_suspended, trust_score,
   vehicle count, registration date. Filter by status. Search by name or CUI.
   Row click opens a drawer with all documents, all vehicles, the suspension
   history from account_suspensions, and manual "Suspendă" / "Reactivează"
   buttons that write a reason into the audit trail.

6. src/pages/admin/Dashboard.tsx at route /admin
   Cards: documents pending review, companies suspended today, documents
   expiring in the next 7 days, listings published this week, new signups this
   week. Each card links to a filtered view.
   One table: "Documente care expiră în 7 zile", so the team can call the
   customer before the suspension rather than after.

7. src/pages/admin/Reports.tsx at route /admin/sesizari
   The reports table with status transitions and a resolution note.

MODIFY

8. src/components/layout/AppShell.tsx
   When is_platform_admin is true, add an "Administrare" section at the bottom
   of the sidebar with the four admin routes. Do NOT change the normal
   navigation for anyone else.
```

---

## Verification checklist

- [ ] A non-admin visiting `/admin` is redirected, with no data flash
- [ ] A non-admin calling `review_document` directly gets 42501 — test it in
      the SQL editor, not just in the UI
- [ ] Approving sets `status = 'approved'`, `reviewed_by`, `reviewed_at`
- [ ] Approving the last blocking document flips the company to `verified`
- [ ] Rejecting stores the reason and the customer sees it on their document card
- [ ] Correcting `valid_until` before approving stores the corrected value
- [ ] Low-confidence documents sort to the top
- [ ] A kind mismatch is visible without reading the document
- [ ] The signed URL expires after 5 minutes
- [ ] Keyboard shortcuts work; fifty documents need no mouse
- [ ] Manual suspension writes an `account_suspensions` row with a reason
