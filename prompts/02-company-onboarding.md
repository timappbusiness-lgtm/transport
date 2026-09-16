# Prompt 02 — Company onboarding with ANAF lookup

**Prerequisites:** prompt 01 done; migration `20260916120000_core_identity.sql`
applied; edge function `verify-cui-anaf` deployed.

---

## Lovable prompt

```
Add company onboarding to the existing app. Create only the files listed.
Do NOT modify AppShell, the auth components, or any existing page except where
I say so explicitly.

CREATE

1. src/hooks/useCompany.ts
   TanStack Query hook that returns the current user's company by joining
   company_members to companies. Exposes:
   - company, isLoading, error
   - createCompany(input)  -> inserts into companies with created_by = auth user,
     then inserts a company_members row with role "owner"
   - updateCompany(patch)
   Invalidate the query after every mutation.

2. src/hooks/useAnafLookup.ts
   Mutation hook calling the edge function "verify-cui-anaf" via
   supabase.functions.invoke with { cui, company_id }.
   Handle three outcomes distinctly:
   - found: return the data
   - 404: "CUI-ul nu a fost găsit la ANAF. Verifică cifrele."
   - 503 / retryable: "ANAF nu răspunde momentan. Încearcă din nou în câteva secunde."

3. src/components/company/CuiLookupField.tsx
   Input for the CUI with a "Caută" button. On success, shows a read-only
   summary card: denumire, adresă, nr. reg. com., plătitor TVA.
   If the response has is_inactive or is_struck_off true, show a destructive
   alert: "Firma apare ca inactivă / radiată la ANAF. Nu poți continua
   înregistrarea. Contactează-ne dacă este o eroare." and block the next step.
   Calls an onFound(data) prop with the result.

4. src/components/company/CompanyOnboardingWizard.tsx
   Three steps with a progress indicator:
   Step 1 "Date firmă": CuiLookupField; on found, prefill legal_name, address,
     reg_com, vat_payer into a form. County and city are editable selects using
     COUNTIES from src/lib/constants.ts.
   Step 2 "Tip activitate": radio cards for expeditie / transport / both,
     using COMPANY_TYPE_LABELS. Each card explains in one line what it unlocks:
     - Casă de expediții: "Postezi curse și cauți transportatori"
     - Firmă de transport: "Postezi mașini pe tur și pe retur, cauți marfă"
     - Ambele: "Toate funcțiile de mai sus"
   Step 3 "Contact": contact_email, contact_phone, website (optional).
   On submit, call createCompany, then navigate to /documente.

5. src/pages/CompanyOnboarding.tsx at route /inregistrare-firma,
   rendering the wizard inside AppShell.

6. src/components/layout/ComplianceBanner.tsx
   A banner shown at the top of every authenticated page, driven by the
   company's verification_status:
   - draft:     amber  "Completează datele firmei ca să poți posta anunțuri."   CTA -> /inregistrare-firma
   - pending:   blue   "Documentele tale sunt în verificare. Durează până la 24 de ore."
   - suspended: red    "Cont suspendat: {suspension_reason}. Încarcă documentele actualizate."  CTA -> /documente
   - rejected:  red    "Înregistrarea a fost respinsă. Scrie-ne la suport."
   - verified:  render nothing
   Individuals (account_type "individual") never see this banner.

MODIFY (only these two lines of behaviour)

7. src/components/layout/AppShell.tsx
   Render <ComplianceBanner /> directly above the page content.
   Do NOT change the sidebar, the top bar, or the layout structure.

8. src/pages/Dashboard.tsx
   If the user has account_type "company" and no company row yet,
   show a centered call to action: "Adaugă-ți firma ca să începi" with a
   button to /inregistrare-firma.
   Do NOT change anything else on the page.
```

---

## Verification checklist

- [ ] A real CUI (try `RO14399840`) fills in name and address
- [ ] An invalid CUI shows the "negăsit" message, not a crash
- [ ] Two ANAF calls a second: the second shows the retryable message, not an
      error toast (ANAF rate-limits at roughly 1 request/second)
- [ ] An inactive company blocks step 2
- [ ] Submitting creates a `companies` row **and** a `company_members` row with
      `role = 'owner'` — check both; a missing member row means every later RLS
      check fails silently
- [ ] The banner shows "draft" immediately after onboarding
- [ ] An individual account never sees the banner
- [ ] A second user cannot read that company: `select * from companies` in the
      SQL editor as that user returns nothing

**Common failure:** the company insert succeeds and the membership insert
fails, leaving an orphan company. Check `companies_insert_authenticated`
requires `created_by = auth.uid()`, and that the founder branch of
`company_members_insert_manager_or_founder` matches.
