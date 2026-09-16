# Prompt 01 — Foundation, auth and app shell

**Prerequisite:** migration `20260916120000_core_identity.sql` applied.
**This is the only prompt that creates the project.** Everything after is additive.

---

## Lovable prompt

```
Build the foundation of a Romanian freight exchange web app called "Bursa de Transport".
This is the initial project setup - create only what I list below.

STACK
React + TypeScript + Tailwind + shadcn/ui + Supabase (already connected).
Use TanStack Query for all server state. Use react-router-dom for routing.

LANGUAGE
All user-facing text is in Romanian with correct diacritics (ă, â, î, ș, ț).
All code, file names, variables, types and comments are in English.

CREATE THESE FILES

1. src/lib/constants.ts
   Export typed label maps for the database enums, Romanian labels:
   - COMPANY_TYPE_LABELS: expeditie "Casă de expediții", transport "Firmă de transport",
     both "Expediții și transport"
   - VEHICLE_TYPE_LABELS: prelata "Prelată", duba "Dubă", frigorific "Frigorific",
     platforma "Platformă", platforma_tractari "Platformă tractări",
     autoutilitara_3_5t "Autoutilitară 3,5t", basculanta "Basculantă",
     cisterna "Cisternă", container "Container", agabaritic "Agabaritic",
     autospeciala "Autospecială"
   - COUNTIES: the 41 Romanian counties plus "București", sorted alphabetically
   Derive the enum types from src/integrations/supabase/types.ts, do not redeclare them.

2. src/lib/formatters.ts
   - formatDate(iso: string | null): "dd.MM.yyyy" using date-fns with the ro locale
   - formatMoney(amount: number | null, currency: "RON" | "EUR"): Intl.NumberFormat
     with "ro-RO", so 1250 RON renders as "1.250,00 RON"
   - formatWeight(kg: number | null): "12.500 kg", or "12,5 t" above 1000 kg
   - formatRoute(fromCity, fromCounty, toCity, toCounty): "Cluj-Napoca (CJ) → Timișoara (TM)"

3. src/hooks/useProfile.ts
   TanStack Query hook returning the current row from `profiles`, plus
   an updateProfile mutation. Returns { profile, isLoading, error, updateProfile }.

4. src/components/auth/SignupForm.tsx
   Two tabs: "Firmă" and "Persoană fizică".
   - Firmă tab: email + password + full name. Sets account_type "company" in
     the auth metadata.
   - Persoană fizică tab: full name + phone. Sets account_type "individual".
     Phone only for now; the OTP flow comes in a later step - leave a
     // TODO: phone OTP verification (prompt 06) comment where it belongs.
   Validate with zod + react-hook-form. Romanian error messages.

5. src/components/auth/LoginForm.tsx
   Email + password, "Am uitat parola" link, Romanian error messages.

6. src/components/layout/AppShell.tsx
   Sidebar + top bar layout. Sidebar items (icons from lucide-react):
   Curse, Mașini pe tur, Mașini pe retur, Flota mea, Documente, Anunțurile mele, Cont.
   Top bar: app name on the left, user menu on the right.
   Mobile: sidebar collapses into a sheet.

7. src/pages/ with route components: Index (public landing), Login, Signup,
   Dashboard (empty, authenticated, wrapped in AppShell).

8. src/components/auth/RequireAuth.tsx
   Route guard redirecting unauthenticated users to /login.

DESIGN
Professional and dense - this is a working tool for dispatchers, not a
consumer app. Neutral base with a single strong accent colour. Tables and
lists must stay readable at 1366x768. Define the palette as CSS variables in
index.css and use semantic Tailwind tokens, never hardcoded colours in
components.

DO NOT create listing pages, document upload, fleet management or an admin
panel. Those come in later prompts.
```

---

## Verification checklist

- [ ] Signup as a company creates rows in both `auth.users` and `profiles`,
      with `account_type = 'company'` (the `handle_new_user` trigger does this)
- [ ] Signup as an individual sets `account_type = 'individual'`
- [ ] Login redirects to `/dashboard`; logout returns to `/`
- [ ] `/dashboard` while logged out redirects to `/login`
- [ ] Sidebar collapses correctly at 375px width
- [ ] `formatMoney(1250, "RON")` returns `1.250,00 RON`
- [ ] `formatDate("2026-03-14")` returns `14.03.2026`
- [ ] No hardcoded hex colours in component files

**Common failure:** Lovable redeclares the database enums as its own string
unions. Reply: *"Import the enum types from src/integrations/supabase/types.ts
instead of redeclaring them. Only change src/lib/constants.ts."*
