-- =====================================================================
-- Înscriere asistată — the team fills the account in, the firm claims it
--
-- In the pilot we onboard the first twenty or thirty carriers in person
-- or on the telephone. Until now every step belonged to the carrier
-- alone: confirm an e-mail, create the firm, upload six documents, add
-- the trucks. On a kitchen table with a phone in one hand, that is not a
-- ten-minute job, and the ones who give up give up silently.
--
-- This file lets a member of the team do all of it *for* a real company,
-- with that company's consent, and then hand the account over. Nothing
-- below weakens a rule. Four things make that true:
--
-- 1. **Staff never hold a password.** No account is created by the team
--    at all. The person sets their own password through the ordinary
--    sign-up, from a one-time link; `claim_assisted_onboarding()` then
--    makes them owner. There is no branch anywhere that lets one person
--    obtain another's credentials, because there is nothing to obtain.
--
-- 2. **The extra power is scoped, not general.** Staff may write a
--    firm's vehicles and documents only while that firm is an *unclaimed
--    assisted onboarding* — `is_assisted_company()` is the whole of it.
--    The moment the owner claims the account, the team is back to the
--    powers it had before this migration.
--
-- 3. **Consent is a row, not a habit.** Nothing can be created until the
--    team declares the firm agreed, with the date and how they were
--    asked. It is checked in the function that creates the onboarding,
--    and it is in `audit_log`.
--
-- 4. **Four eyes on a document.** Whoever uploaded a document on a
--    firm's behalf cannot be the one who approves it. With a
--    single-person team that would stop the pilot dead, so it is allowed
--    with a written note — and the note is counted on `/admin/pilot`,
--    where somebody will see it.
--
-- What the person gets afterwards is an ordinary account. Not a
-- restricted one, not a supervised one: the banner tells them what we
-- filled in, and every rule that governs a firm they built themselves
-- governs this one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------
create type public.assisted_status as enum (
  'in_lucru',    -- the team is still filling it in
  'trimis',      -- the claim link has been issued
  'revendicat',  -- the owner claimed it and set a password
  'expirat'      -- the link ran out, or sixty days passed unclaimed
);

comment on type public.assisted_status is
  'Where one assisted onboarding has got to. „expirat" covers both an unused link and an abandoned account.';

create type public.consent_channel as enum ('in_persoana', 'telefon', 'email');

comment on type public.consent_channel is
  'How the firm was asked. Stored because „they agreed" without a channel and a date is not evidence of anything.';

-- ---------------------------------------------------------------------
-- 2. The onboarding itself
-- ---------------------------------------------------------------------
create table public.assisted_onboardings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Who on the team is doing it. `restrict` rather than `set null`: the
  -- responsible person is half of what this table is for, and a row that
  -- forgets who filled it in answers no question anyone will ask.
  staff_user_id uuid not null references public.profiles (id) on delete restrict,

  -- The person who will own the account. No `auth.users` row yet, and
  -- that is the point — see the header.
  contact_name text not null check (length(btrim(contact_name)) between 3 and 120),
  contact_email text not null,
  contact_phone text not null,

  -- The firm built on their behalf, once step 1 is saved.
  company_id uuid references public.companies (id) on delete set null,

  status public.assisted_status not null default 'in_lucru',

  -- Consent, declared before anything exists.
  consent_channel public.consent_channel not null,
  consent_at timestamptz not null,
  consent_note text check (consent_note is null or length(consent_note) <= 500),

  -- The claim link. The token is stored as a digest: a table a staff
  -- member can read is not a place to keep a bearer token that logs
  -- somebody in.
  claim_token_hash text,
  claim_sent_at timestamptz,
  claim_expires_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references public.profiles (id) on delete set null,

  -- The thirty-day nudge, so it is sent once and not every night.
  alerted_at timestamptz,

  constraint assisted_email_ck
    check (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'),
  -- E.164, the same shape `normalisePhone` writes everywhere else.
  constraint assisted_phone_ck check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint assisted_claimed_ck
    check (status <> 'revendicat' or (claimed_at is not null and claimed_by is not null)),
  constraint assisted_sent_ck
    check (status <> 'trimis' or (claim_token_hash is not null and claim_expires_at is not null))
);

comment on table public.assisted_onboardings is
  'One firm the team is onboarding by hand, with the consent that allowed it and the one-time link that hands it over. Written only by the RPCs in this file.';
comment on column public.assisted_onboardings.claim_token_hash is
  'sha256 of the token. The token itself is shown once, to the staff member who created it, and never stored.';
comment on column public.assisted_onboardings.contact_email is
  'Where the link goes, and the address the claim must sign up with. Checked against auth.email() in claim_assisted_onboarding().';

create index assisted_onboardings_staff_idx
  on public.assisted_onboardings (staff_user_id, created_at desc);
create index assisted_onboardings_status_idx
  on public.assisted_onboardings (status, created_at desc);
create index assisted_onboardings_company_idx
  on public.assisted_onboardings (company_id) where company_id is not null;
create unique index assisted_onboardings_token_idx
  on public.assisted_onboardings (claim_token_hash) where claim_token_hash is not null;

-- One open onboarding per e-mail address. Two half-filled accounts for
-- the same person is the state in which somebody claims the wrong one.
create unique index assisted_onboardings_one_open_email
  on public.assisted_onboardings (lower(contact_email))
  where status in ('in_lucru', 'trimis');

create trigger assisted_onboardings_set_updated_at
  before update on public.assisted_onboardings
  for each row execute function public.set_updated_at();

alter table public.assisted_onboardings enable row level security;

-- Staff read them; nobody writes through the API. Every write below is a
-- SECURITY DEFINER function that checks the caller first.
create policy "assisted_onboardings_select_staff" on public.assisted_onboardings
  for select to authenticated
  using (public.is_platform_admin());

revoke all on public.assisted_onboardings from anon, authenticated;
grant select on public.assisted_onboardings to authenticated;

-- ---------------------------------------------------------------------
-- 3. „adăugat de echipă în numele firmei"
--
-- The audit trail already records who acted. What it could not record is
-- that somebody acted *for somebody else*, which is the only interesting
-- fact about every row this feature writes.
--
-- A new column rather than a wider `write_audit`: that function is
-- called from about forty places, `create or replace` cannot change an
-- argument list, and an overload with a defaulted last parameter makes
-- every existing four-argument call ambiguous. `write_audit_for()` is
-- the same function with the extra column filled in.
-- ---------------------------------------------------------------------
alter table public.audit_log
  add column if not exists on_behalf_of_company_id uuid;

comment on column public.audit_log.on_behalf_of_company_id is
  'Set when a staff member acted for a company rather than as the platform — assisted onboarding. Null everywhere else, which is the honest answer for an action taken on our own behalf.';

create index audit_log_on_behalf_idx
  on public.audit_log (on_behalf_of_company_id, created_at desc)
  where on_behalf_of_company_id is not null;

create or replace function public.write_audit_for(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_on_behalf_of uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.audit_log
    (actor_user_id, actor_role, action, entity, entity_id, before, after, reason,
     on_behalf_of_company_id)
  values (
    auth.uid(),
    case
      when auth.uid() is null then 'system'
      when public.is_platform_admin() then 'staff'
      else 'user'
    end,
    p_action, p_entity, p_entity_id, p_before, p_after, p_reason, p_on_behalf_of
  );
end;
$fn$;

comment on function public.write_audit_for(text, text, uuid, jsonb, jsonb, text, uuid) is
  'write_audit(), plus the company the actor was acting for. Internal: called by the assisted-onboarding functions, never granted to a role.';

-- Trigger and internal functions are granted to nobody, per the
-- default-privileges rule in migration 20260916130300.
revoke all on function public.write_audit_for(text, text, uuid, jsonb, jsonb, text, uuid) from public;

-- The document row says it too, because a reviewer looking at one
-- document should not have to search the log to learn that the person
-- who uploaded it does not work for the firm whose document it is.
alter table public.documents
  add column if not exists uploaded_on_behalf boolean not null default false;

comment on column public.documents.uploaded_on_behalf is
  'True when a staff member uploaded this during an assisted onboarding. Drives the four-eyes rule in review_document().';

-- ---------------------------------------------------------------------
-- 4. The scope of the extra power
--
-- Read this function as the answer to „what exactly may the team do that
-- it could not do yesterday". It is: write the vehicles and documents of
-- a company that is an assisted onboarding nobody has claimed yet. That
-- is all, and it stops the instant the owner claims it.
-- ---------------------------------------------------------------------
create or replace function public.is_assisted_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.assisted_onboardings a
    where a.company_id = p_company_id
      and a.status in ('in_lucru', 'trimis')
  );
$fn$;

comment on function public.is_assisted_company(uuid) is
  'True while a company is an assisted onboarding that has not been claimed. The whole extra reach of the team during onboarding, in one place.';

revoke all on function public.is_assisted_company(uuid) from public;
-- The policies below apply to `authenticated`, so that is who evaluates it.
grant execute on function public.is_assisted_company(uuid) to authenticated;

-- Vehicles. The existing policy demands membership, and staff are not
-- members of the firms they onboard — deliberately, because membership
-- is what the owner gets at the end.
drop policy if exists "vehicles_insert_own" on public.vehicles;
create policy "vehicles_insert_own_or_assisting" on public.vehicles
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    or (public.is_platform_admin() and public.is_assisted_company(company_id))
  );

-- Documents, same reason. `uploaded_by = auth.uid()` stays on both
-- branches: a document with nobody's name against it is the one a
-- four-eyes rule cannot be applied to.
drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own_or_assisting" on public.documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.is_company_member(company_id)
      or (public.is_platform_admin() and public.is_assisted_company(company_id))
    )
  );

-- And the file itself. Without this the row could be written and the PDF
-- could not, which is the worst of the three outcomes.
drop policy if exists "documents_insert_assisting" on storage.objects;
create policy "documents_insert_assisting" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_platform_admin()
    and public.is_assisted_company(public.safe_uuid((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------
-- 5. Starting one
--
-- Consent first, and in the same statement that creates the row. A
-- declaration collected on a screen and stored „later" is a declaration
-- that goes missing exactly when somebody asks for it.
-- ---------------------------------------------------------------------
create or replace function public.start_assisted_onboarding(
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_consent_channel public.consent_channel,
  p_consent_at timestamptz,
  p_consent_note text default null
)
returns public.assisted_onboardings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.assisted_onboardings;
  v_email text := lower(btrim(coalesce(p_contact_email, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate face o înscriere asistată'
      using errcode = '42501';
  end if;
  if p_consent_channel is null or p_consent_at is null then
    raise exception 'Fără acordul firmei nu se poate crea nimic' using errcode = '22023';
  end if;
  -- A consent dated in the future is a form filled in wrongly, and the
  -- one field on this screen nobody would re-read.
  if p_consent_at > now() + interval '1 hour' then
    raise exception 'Data acordului nu poate fi în viitor' using errcode = '22023';
  end if;
  if p_consent_at < now() - interval '90 days' then
    raise exception 'Acordul este mai vechi de 90 de zile. Întreabă din nou.'
      using errcode = '22023';
  end if;

  -- An address that already has an account does not need onboarding; it
  -- needs a sign-in link, and creating a second one here would produce a
  -- firm the person can never claim.
  if exists (select 1 from public.profiles p where lower(p.email) = v_email) then
    raise exception 'Există deja un cont cu adresa aceasta. Trimite-i o resetare de parolă.'
      using errcode = '23505';
  end if;

  insert into public.assisted_onboardings
    (staff_user_id, contact_name, contact_email, contact_phone,
     consent_channel, consent_at, consent_note)
  values
    (auth.uid(), btrim(p_contact_name), v_email, btrim(p_contact_phone),
     p_consent_channel, p_consent_at, nullif(btrim(p_consent_note), ''))
  returning * into v_row;

  perform public.write_audit('assisted.started', 'assisted_onboardings', v_row.id, null,
    jsonb_build_object(
      'contact_email', v_row.contact_email,
      'consent_channel', v_row.consent_channel,
      'consent_at', v_row.consent_at),
    v_row.consent_note);

  return v_row;
end;
$fn$;

comment on function public.start_assisted_onboarding(text, text, text, public.consent_channel, timestamptz, text) is
  'Opens an assisted onboarding. Refuses without a consent channel and date, and refuses an address that already has an account.';

revoke all on function public.start_assisted_onboarding(text, text, text, public.consent_channel, timestamptz, text) from public;
grant execute on function public.start_assisted_onboarding(text, text, text, public.consent_channel, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. The firm, created on its behalf
--
-- `create_company()` cannot be reused: it makes the caller the owner,
-- and the caller here is us. The firm is created with no members at all
-- until the claim, which is what keeps „who owns this" honest in the
-- meantime — the answer is nobody, and the screens say so.
-- ---------------------------------------------------------------------
create or replace function public.assisted_create_company(
  p_onboarding_id uuid,
  p_cui text,
  p_legal_name text,
  p_company_type public.company_type,
  p_county text default null,
  p_city text default null,
  p_contact_email text default null,
  p_contact_phone text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.assisted_onboardings;
  v_company public.companies;
  v_cui text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate face o înscriere asistată'
      using errcode = '42501';
  end if;

  select * into v_row from public.assisted_onboardings
  where id = p_onboarding_id for update;
  if v_row.id is null then
    raise exception 'Înscrierea nu există' using errcode = 'P0002';
  end if;
  if v_row.status <> 'in_lucru' then
    raise exception 'Înscrierea nu mai este în lucru' using errcode = '22023';
  end if;
  if v_row.company_id is not null then
    raise exception 'Înscrierea are deja o firmă' using errcode = '23505';
  end if;

  v_cui := regexp_replace(upper(coalesce(p_cui, '')), '[^0-9A-Z]', '', 'g');
  v_cui := regexp_replace(v_cui, '^RO', '');
  if v_cui !~ '^[0-9]{2,10}$' then
    raise exception 'CUI invalid' using errcode = '22023';
  end if;
  if nullif(btrim(p_legal_name), '') is null then
    raise exception 'Denumirea firmei este obligatorie' using errcode = '22023';
  end if;
  if exists (select 1 from public.companies where country = 'RO' and cui = v_cui) then
    raise exception 'Există deja o firmă înregistrată cu acest CUI' using errcode = '23505';
  end if;

  insert into public.companies
    (cui, legal_name, company_type, county, city, contact_email, contact_phone,
     verification_status, created_by)
  values
    (v_cui, btrim(p_legal_name), p_company_type, p_county, p_city,
     coalesce(nullif(btrim(p_contact_email), ''), v_row.contact_email),
     coalesce(nullif(btrim(p_contact_phone), ''), v_row.contact_phone),
     'draft', auth.uid())
  returning * into v_company;

  update public.assisted_onboardings
  set company_id = v_company.id
  where id = v_row.id;

  perform public.write_audit_for('company.created_on_behalf', 'companies', v_company.id, null,
    to_jsonb(v_company), 'adăugat de echipă în numele firmei', v_company.id);

  return v_company;
end;
$fn$;

comment on function public.assisted_create_company(uuid, text, text, public.company_type, text, text, text, text) is
  'Creates the firm for an assisted onboarding, with no members until the claim. Same CUI rules as create_company(); the difference is who ends up owning it.';

revoke all on function public.assisted_create_company(uuid, text, text, public.company_type, text, text, text, text) from public;
grant execute on function public.assisted_create_company(uuid, text, text, public.company_type, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. The one-time link
--
-- The token is returned once, to the staff member who asked for it, and
-- never stored — only its sha256. Two consequences, both wanted: a
-- second look at the screen cannot recover it, and the table that staff
-- can read holds nothing that logs anybody in.
--
-- Two `gen_random_uuid()` give 256 bits from the same CSPRNG as every
-- other identifier here. `gen_random_bytes` would do as well; this way
-- the function does not depend on pgcrypto being present.
-- ---------------------------------------------------------------------
create or replace function public.issue_assisted_claim(p_onboarding_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.assisted_onboardings;
  v_company public.companies;
  v_token text;
  v_hash text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate trimite linkul' using errcode = '42501';
  end if;

  select * into v_row from public.assisted_onboardings
  where id = p_onboarding_id for update;
  if v_row.id is null then
    raise exception 'Înscrierea nu există' using errcode = 'P0002';
  end if;
  if v_row.status = 'revendicat' then
    raise exception 'Contul a fost deja revendicat' using errcode = '22023';
  end if;
  if v_row.company_id is null then
    raise exception 'Completează întâi datele firmei' using errcode = '22023';
  end if;

  select * into v_company from public.companies where id = v_row.company_id;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');

  update public.assisted_onboardings
  set claim_token_hash = v_hash,
      claim_sent_at = now(),
      -- Seven days. Long enough to reach somebody who is driving all
      -- week, short enough that a link left in a WhatsApp thread stops
      -- working before it is forgotten about.
      claim_expires_at = now() + interval '7 days',
      status = 'trimis'
  where id = v_row.id
  returning * into v_row;

  insert into public.notification_outbox
    (channel, template, to_email, payload, dedupe_key)
  values (
    'email', 'assisted_claim', v_row.contact_email,
    jsonb_build_object(
      'full_name', v_row.contact_name,
      'company_name', coalesce(nullif(v_company.display_name, ''), v_company.legal_name),
      'claim_path', '/revendica/' || v_token,
      'expires_at', to_char(v_row.claim_expires_at, 'DD.MM.YYYY')),
    -- The window is part of the key, so re-issuing a link after the old
    -- one expired sends a new e-mail rather than silently doing nothing.
    'assisted:' || v_row.id || ':' || extract(epoch from v_row.claim_sent_at)::bigint
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  perform public.write_audit_for('assisted.claim_issued', 'assisted_onboardings', v_row.id,
    null,
    jsonb_build_object('expires_at', v_row.claim_expires_at, 'to_email', v_row.contact_email),
    null, v_row.company_id);

  return v_token;
end;
$fn$;

comment on function public.issue_assisted_claim(uuid) is
  'Issues the one-time claim link and queues the e-mail. Returns the token once; only its digest is kept, so a second call is a new link, not the old one.';

revoke all on function public.issue_assisted_claim(uuid) from public;
grant execute on function public.issue_assisted_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. What the person sees before they commit
--
-- Granted to `anon`, because whoever opens the link has no account yet —
-- that is the whole point of the link. It answers with the firm's name
-- and a count of what we filled in, and with the e-mail *masked*: enough
-- to recognise your own address, not enough to harvest one from a
-- guessed token.
-- ---------------------------------------------------------------------
create or replace function public.assisted_onboarding_preview(p_token text)
returns table (
  company_name text,
  contact_name text,
  email_hint text,
  documents_count integer,
  vehicles_count integer,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_row public.assisted_onboardings;
begin
  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Link invalid' using errcode = '22023';
  end if;

  select * into v_row from public.assisted_onboardings a
  where a.claim_token_hash = encode(sha256(convert_to(btrim(p_token), 'UTF8')), 'hex');

  -- One sentence for „no such link" and for „that link has been used",
  -- on purpose: a different answer for each would tell somebody probing
  -- tokens which of their guesses were real.
  if v_row.id is null or v_row.status <> 'trimis' then
    raise exception 'Linkul nu mai este valabil. Cere-i echipei unul nou.'
      using errcode = '22023';
  end if;
  if v_row.claim_expires_at < now() then
    raise exception 'Linkul a expirat. Cere-i echipei unul nou.' using errcode = '22023';
  end if;

  return query
  select
    coalesce(nullif(c.display_name, ''), c.legal_name),
    v_row.contact_name,
    -- „ma***n@exemplu.ro"
    regexp_replace(v_row.contact_email, '^(.{1,2}).*(@.*)$', '\1***\2'),
    (select count(*)::integer from public.documents d where d.company_id = v_row.company_id),
    (select count(*)::integer from public.vehicles ve where ve.company_id = v_row.company_id),
    v_row.claim_expires_at
  from public.companies c
  where c.id = v_row.company_id;
end;
$fn$;

comment on function public.assisted_onboarding_preview(text) is
  'What the claim page shows before anybody signs up. Anon, because the person has no account yet; the address is masked so a guessed token reveals none.';

revoke all on function public.assisted_onboarding_preview(text) from public;
grant execute on function public.assisted_onboarding_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. The handover
--
-- The person has just signed up, with the address the link was issued
-- for, and set a password we never saw. This is the whole of what the
-- team's work turns into: one row in `company_members`.
--
-- The address is checked against the profile rather than trusted from
-- the form, so a token that leaks cannot be redeemed by whoever finds
-- it — they would have to sign up as the firm's own e-mail address,
-- which is a mailbox they do not have.
-- ---------------------------------------------------------------------
create or replace function public.claim_assisted_onboarding(p_token text)
returns public.assisted_onboardings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.assisted_onboardings;
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_row from public.assisted_onboardings a
  where a.claim_token_hash = encode(sha256(convert_to(btrim(coalesce(p_token, '')), 'UTF8')), 'hex')
  for update;

  if v_row.id is null or v_row.status <> 'trimis' then
    raise exception 'Linkul nu mai este valabil. Cere-i echipei unul nou.'
      using errcode = '22023';
  end if;
  if v_row.claim_expires_at < now() then
    raise exception 'Linkul a expirat. Cere-i echipei unul nou.' using errcode = '22023';
  end if;
  if v_row.company_id is null then
    raise exception 'Înscrierea nu are încă o firmă' using errcode = '22023';
  end if;

  select lower(coalesce(p.email, '')) into v_email
  from public.profiles p where p.id = v_user;

  if v_email is distinct from lower(v_row.contact_email) then
    raise exception 'Linkul este pentru altă adresă de e-mail. Intră cu adresa pe care ai primit-o.'
      using errcode = '42501';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (v_row.company_id, v_user, 'owner')
  on conflict (company_id, user_id) do update set role = 'owner';

  update public.assisted_onboardings
  set status = 'revendicat',
      claimed_at = now(),
      claimed_by = v_user,
      -- Single use. The digest goes, so the same link opens nothing a
      -- second time — including for whoever else has a copy of it.
      claim_token_hash = null
  where id = v_row.id
  returning * into v_row;

  perform public.write_audit_for('assisted.claimed', 'assisted_onboardings', v_row.id, null,
    jsonb_build_object('company_id', v_row.company_id, 'claimed_by', v_user),
    null, v_row.company_id);

  return v_row;
end;
$fn$;

comment on function public.claim_assisted_onboarding(text) is
  'Turns the team''s work into one company_members row. The caller''s own address must match the one the link was issued for; the digest is cleared, so the link is single use.';

revoke all on function public.claim_assisted_onboarding(text) from public;
grant execute on function public.claim_assisted_onboarding(text) to authenticated;

-- What the owner is shown afterwards. Staff-written rows, read by the
-- person who now owns them — hence `is_company_member`, not the staff
-- check every other function in this file uses.
create or replace function public.assisted_handover_summary(p_company_id uuid)
returns table (
  claimed_at timestamptz,
  staff_name text,
  documents_count integer,
  vehicles_count integer,
  has_coverage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (public.is_company_member(p_company_id) or public.is_platform_admin()) then
    raise exception 'Nu ai acces la firma aceasta' using errcode = '42501';
  end if;

  return query
  select
    a.claimed_at,
    coalesce(nullif(p.full_name, ''), 'echipa Coridor'),
    (select count(*)::integer from public.documents d where d.company_id = a.company_id),
    (select count(*)::integer from public.vehicles v where v.company_id = a.company_id),
    (c.coverage_counties <> '{}' or c.services <> '{}' or c.equipment <> '{}')
  from public.assisted_onboardings a
  join public.companies c on c.id = a.company_id
  left join public.profiles p on p.id = a.staff_user_id
  where a.company_id = p_company_id and a.status = 'revendicat';
end;
$fn$;

comment on function public.assisted_handover_summary(uuid) is
  'What the banner on the owner''s dashboard lists. Returns no row for a firm nobody onboarded, which is how the banner knows not to appear.';

revoke all on function public.assisted_handover_summary(uuid) from public;
grant execute on function public.assisted_handover_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Four eyes on a document
--
-- Uploading a firm's ITP and then approving it yourself is the one place
-- where assisted onboarding could become a way to verify a company that
-- was never verified. So whoever uploaded on the firm's behalf may not
-- be the one who approves.
--
-- With a one-person team that rule stops the pilot on its first day, so
-- it yields — to a written note, kept on the document, counted on
-- `/admin/pilot`. A rule that cannot be followed gets worked around; a
-- rule that can be broken loudly gets noticed.
--
-- The four-argument `review_document` stays exactly as callers know it
-- and delegates. A fifth parameter with a default would have made every
-- existing four-argument call ambiguous.
-- ---------------------------------------------------------------------
alter table public.documents
  add column if not exists solo_review_note text;

comment on column public.documents.solo_review_note is
  'Why the same person both uploaded and approved this. Only ever set when the team has one member; counted on /admin/pilot so it is never quietly normal.';

create or replace function public.review_document_assisted(
  p_document_id uuid,
  p_approve boolean,
  p_valid_until date,
  p_rejection_reason text,
  p_solo_note text
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.documents;
  v_doc public.documents;
  v_has_expiry boolean;
  v_staff integer;
  v_note text := nullif(btrim(coalesce(p_solo_note, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can review documents' using errcode = '42501';
  end if;

  select * into v_before from public.documents where id = p_document_id for update;
  if v_before.id is null then
    raise exception 'Document % not found', p_document_id using errcode = 'P0002';
  end if;
  if v_before.status not in ('uploaded', 'parsing', 'pending') then
    raise exception 'Documentul nu este în așteptare (status %)', v_before.status using errcode = '55000';
  end if;

  -- The rule. Only for a document the team uploaded for the firm: one a
  -- carrier uploaded themselves has always been reviewed by us, and
  -- that is not what four eyes is about.
  if v_before.uploaded_on_behalf and v_before.uploaded_by = auth.uid() then
    select count(*)::integer into v_staff from public.platform_staff;
    if v_staff > 1 then
      raise exception 'Documentul a fost încărcat de tine, în numele firmei. Îl verifică altcineva din echipă.'
        using errcode = '42501';
    end if;
    if v_note is null then
      raise exception 'Ești singurul om din echipă. Scrie de ce verifici tu documentul pe care tot tu l-ai încărcat.'
        using errcode = '22023';
    end if;
  else
    -- A note on a review that did not need one would make the count on
    -- /admin/pilot mean nothing.
    v_note := null;
  end if;

  if p_approve then
    select r.has_expiry into v_has_expiry
    from public.document_requirements r
    where r.scope = v_before.scope and r.kind = v_before.kind;

    if coalesce(v_has_expiry, false) and coalesce(p_valid_until, v_before.valid_until) is null then
      raise exception 'Data de expirare este obligatorie pentru acest document' using errcode = '22023';
    end if;

    update public.documents d
    set status = 'replaced'
    where d.id <> v_before.id
      and d.kind = v_before.kind
      and d.scope = v_before.scope
      and d.status = 'approved'
      and (
        (v_before.scope = 'company' and d.company_id = v_before.company_id)
        or (v_before.scope = 'vehicle' and d.vehicle_id = v_before.vehicle_id)
        or (v_before.scope = 'driver'  and d.driver_id  = v_before.driver_id)
      );
  elsif nullif(btrim(coalesce(p_rejection_reason, '')), '') is null then
    raise exception 'Motivul respingerii este obligatoriu' using errcode = '22023';
  end if;

  update public.documents
  set status = case when p_approve then 'approved'::document_status else 'rejected'::document_status end,
      valid_until = coalesce(p_valid_until, valid_until),
      rejection_reason = case when p_approve then null else p_rejection_reason end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      solo_review_note = v_note
  where id = p_document_id
  returning * into v_doc;

  update public.companies c
  set verification_status = 'verified'
  from public.v_company_compliance cc
  where c.id = v_doc.company_id
    and cc.company_id = c.id
    and cc.documents_ok
    and c.verification_status in ('draft', 'pending');

  perform public.write_audit(
    case when p_approve then 'document.approved' else 'document.rejected' end,
    'documents', v_doc.id, to_jsonb(v_before), to_jsonb(v_doc),
    coalesce(p_rejection_reason, v_note));

  return v_doc;
end;
$fn$;

comment on function public.review_document_assisted(uuid, boolean, date, text, text) is
  'review_document() with the four-eyes rule and the single-person exception. The four-argument form delegates here with no note, so an ordinary review is unchanged.';

revoke all on function public.review_document_assisted(uuid, boolean, date, text, text) from public;
grant execute on function public.review_document_assisted(uuid, boolean, date, text, text) to authenticated;

-- The old door, unchanged for its callers, now with the rule behind it.
create or replace function public.review_document(
  p_document_id uuid,
  p_approve boolean,
  p_valid_until date default null,
  p_rejection_reason text default null
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return public.review_document_assisted(
    p_document_id, p_approve, p_valid_until, p_rejection_reason, null);
end;
$fn$;

revoke all on function public.review_document(uuid, boolean, date, text) from public;
grant execute on function public.review_document(uuid, boolean, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. The two screens' data
--
-- Progress per step, computed rather than stored. A wizard that writes
-- „step 2 done" into a column is a wizard whose column is wrong the
-- first time somebody deletes the vehicle they added.
-- ---------------------------------------------------------------------
create or replace function public.admin_assisted_onboardings(
  p_status public.assisted_status default null
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.assisted_status,
  contact_name text,
  contact_email text,
  contact_phone text,
  company_id uuid,
  company_name text,
  company_type public.company_type,
  verification_status public.company_verification_status,
  staff_user_id uuid,
  staff_name text,
  consent_channel public.consent_channel,
  consent_at timestamptz,
  claim_sent_at timestamptz,
  claim_expires_at timestamptz,
  claimed_at timestamptz,
  step_company boolean,
  step_documents boolean,
  step_vehicles boolean,
  step_profile boolean,
  documents_pending integer,
  solo_reviews integer,
  days_open integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea înscrierile asistate'
      using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.created_at,
    a.status,
    a.contact_name,
    a.contact_email,
    a.contact_phone,
    a.company_id,
    coalesce(nullif(c.display_name, ''), c.legal_name),
    c.company_type,
    c.verification_status,
    a.staff_user_id,
    coalesce(nullif(p.full_name, ''), p.email, '—'),
    a.consent_channel,
    a.consent_at,
    a.claim_sent_at,
    a.claim_expires_at,
    a.claimed_at,
    a.company_id is not null,
    exists (select 1 from public.documents d
            where d.company_id = a.company_id and d.scope = 'company'),
    exists (select 1 from public.vehicles v where v.company_id = a.company_id),
    coalesce(c.coverage_counties, '{}') <> '{}'
      or coalesce(c.services, '{}') <> '{}'
      or coalesce(c.equipment, '{}') <> '{}',
    (select count(*)::integer from public.documents d
      where d.company_id = a.company_id and d.status in ('uploaded', 'parsing', 'pending')),
    (select count(*)::integer from public.documents d
      where d.company_id = a.company_id and d.solo_review_note is not null),
    (extract(epoch from (now() - a.created_at)) / 86400)::integer
  from public.assisted_onboardings a
  left join public.companies c on c.id = a.company_id
  left join public.profiles p on p.id = a.staff_user_id
  where p_status is null or a.status = p_status
  order by
    -- What needs somebody today first: still being filled in, then
    -- waiting to be claimed, then the ones that are finished.
    case a.status when 'in_lucru' then 0 when 'trimis' then 1
                  when 'expirat' then 2 else 3 end,
    a.created_at desc;
end;
$fn$;

comment on function public.admin_assisted_onboardings(public.assisted_status) is
  'The /admin/inscrieri list. Every step is derived from the tables it describes, so deleting the last vehicle un-ticks the vehicles step.';

revoke all on function public.admin_assisted_onboardings(public.assisted_status) from public;
grant execute on function public.admin_assisted_onboardings(public.assisted_status) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Unclaimed
--
-- Thirty days: the team is told, because an account nobody claimed is
-- usually a telephone call that never happened, and a call is cheap.
--
-- Sixty: it goes. Not through a second deletion routine written here —
-- through the one that already erases a company, removes its files from
-- storage and writes the audit entry, because a feature with its own
-- private way of deleting things is a feature whose deletions nobody
-- reviews. `source` says which requests arrived this way, and is what
-- lets the row exist without a user: there is no user, and inventing one
-- would point the erasure at somebody real.
-- ---------------------------------------------------------------------
alter table public.account_deletion_requests
  add column if not exists source text not null default 'user'
    check (source in ('user', 'assisted_unclaimed'));

comment on column public.account_deletion_requests.source is
  'Who asked. „assisted_unclaimed" is the sixty-day sweep of an onboarding nobody claimed — the only kind with no user behind it.';

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_user_ck;
alter table public.account_deletion_requests
  add constraint account_deletion_user_ck check (
    status = 'completed'
    or user_id is not null
    or source = 'assisted_unclaimed'
  );

create or replace function public.sweep_unclaimed_onboardings(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row record;
  v_touched integer := 0;
  v_request uuid;
begin
  if not (public.is_platform_admin() or current_user = 'service_role') then
    raise exception 'Doar jobul sau echipa platformei pot rula curățenia'
      using errcode = '42501';
  end if;

  -- Thirty days: one e-mail to the staff member responsible, once.
  for v_row in
    select a.*, coalesce(nullif(c.display_name, ''), c.legal_name) as company_name,
           p.email as staff_email, p.full_name as staff_name
    from public.assisted_onboardings a
    left join public.companies c on c.id = a.company_id
    left join public.profiles p on p.id = a.staff_user_id
    where a.status = 'trimis'
      and a.claim_sent_at < p_now - interval '30 days'
      and a.alerted_at is null
  loop
    insert into public.notification_outbox
      (channel, template, recipient_user_id, to_email, payload, dedupe_key)
    values (
      'email', 'assisted_unclaimed', v_row.staff_user_id, v_row.staff_email,
      jsonb_build_object(
        'full_name', coalesce(nullif(v_row.staff_name, ''), 'colega/colegul nostru'),
        'company_name', coalesce(v_row.company_name, '—'),
        'contact_name', v_row.contact_name,
        'contact_phone', v_row.contact_phone,
        'days', 30),
      'assisted-unclaimed:' || v_row.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    update public.assisted_onboardings set alerted_at = p_now where id = v_row.id;
    v_touched := v_touched + 1;
  end loop;

  -- Sixty days: hand the firm to the erasure job and forget the person.
  for v_row in
    select a.* from public.assisted_onboardings a
    where a.status in ('in_lucru', 'trimis')
      and a.created_at < p_now - interval '60 days'
  loop
    if v_row.company_id is not null then
      insert into public.account_deletion_requests
        (user_id, company_id, kind, status, scheduled_for, source, staff_reason)
      values
        (null, v_row.company_id, 'company', 'scheduled', p_now, 'assisted_unclaimed',
         'Înscriere asistată nerevendicată 60 de zile')
      on conflict do nothing
      returning id into v_request;
    end if;

    -- The personal data goes now, not when the job gets to the files: it
    -- is ours to hold only for as long as the invitation is live.
    update public.assisted_onboardings
    set status = 'expirat',
        contact_name = 'Șters',
        contact_email = 'sters+' || id::text || '@exemplu.invalid',
        contact_phone = '+40000000000',
        consent_note = null,
        claim_token_hash = null
    where id = v_row.id;

    perform public.write_audit('assisted.expired', 'assisted_onboardings', v_row.id, null,
      jsonb_build_object('company_id', v_row.company_id, 'deletion_request', v_request),
      'Nerevendicată 60 de zile');

    v_touched := v_touched + 1;
  end loop;

  -- A link that simply ran out, with the account still worth keeping.
  update public.assisted_onboardings
  set status = 'expirat', claim_token_hash = null
  where status = 'trimis'
    and claim_expires_at < p_now
    and created_at >= p_now - interval '60 days';

  return v_touched;
end;
$fn$;

comment on function public.sweep_unclaimed_onboardings(timestamptz) is
  'Nudges the team at thirty days and hands the firm to the erasure job at sixty. Takes the clock as an argument so the tests can move it.';

revoke all on function public.sweep_unclaimed_onboardings(timestamptz) from public;
grant execute on function public.sweep_unclaimed_onboardings(timestamptz) to service_role;
grant execute on function public.sweep_unclaimed_onboardings(timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 13. The two new e-mails
--
-- `assisted_claim` is mandatory: it is the only way into the account,
-- and a preference that could switch it off would strand somebody.
-- There is no push for it — the person has no account yet, so there is
-- nothing to push to.
-- ---------------------------------------------------------------------
insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('assisted_claim', 'Invitație de preluare a contului',
   'Linkul prin care îți preiei contul pregătit de echipă. Valabil 7 zile, o singură dată.',
   -- `deep_link` is for push, and this person has no account to push
   -- to. The sign-in page is the honest destination: by the time a push
   -- could reach them, they have claimed the account.
   'both', false, true, true, '/autentificare', true, 600),
  ('assisted_unclaimed', 'Cont nepreluat de 30 de zile',
   'Pentru echipă: o înscriere asistată pe care nu a revendicat-o nimeni.',
   'both', false, false, false, '/admin/inscrieri', true, 610)
on conflict (code) do update
set label_ro = excluded.label_ro,
    description_ro = excluded.description_ro,
    audience = excluded.audience,
    default_push = excluded.default_push,
    is_mandatory = excluded.is_mandatory,
    bypasses_quiet_hours = excluded.bypasses_quiet_hours,
    deep_link = excluded.deep_link,
    is_available = excluded.is_available,
    sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 14. The pilot screen learns two numbers
--
-- „How many did we onboard by hand" and „how long from the first
-- conversation to a verified firm" are the two questions this feature
-- exists to answer. The solo reviews are here too, because the
-- four-eyes exception has to be visible somewhere it is read weekly.
-- ---------------------------------------------------------------------
create or replace function public.pilot_assisted(
  p_from date default (current_date - 55),
  p_to date default current_date
)
returns table (
  started integer,
  sent integer,
  claimed integer,
  expired integer,
  verified integer,
  median_hours_to_verified numeric,
  solo_reviews integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea tabloul pilotului'
      using errcode = '42501';
  end if;

  return query
  with mine as (
    select a.*, c.verification_status, c.is_test
    from public.assisted_onboardings a
    left join public.companies c on c.id = a.company_id
    where a.created_at::date between p_from and p_to
      -- Assisted accounts are real accounts and are never `is_test`;
      -- this excludes a test firm somebody attached one to by mistake,
      -- the same way every other number on this screen does.
      and not coalesce(c.is_test, false)
  ),
  -- First contact is when the team opened the onboarding: before that
  -- there is nothing in the database to measure from.
  to_verified as (
    select extract(epoch from (
             (select min(l.created_at) from public.audit_log l
               where l.entity = 'companies' and l.entity_id = m.company_id
                 and l.action = 'company.verified')
             - m.created_at)) / 3600.0 as hours
    from mine m
    where m.verification_status = 'verified'
  )
  select
    (select count(*)::integer from mine),
    (select count(*)::integer from mine where status = 'trimis'),
    (select count(*)::integer from mine where status = 'revendicat'),
    (select count(*)::integer from mine where status = 'expirat'),
    (select count(*)::integer from mine where verification_status = 'verified'),
    (select round(percentile_cont(0.5) within group (order by t.hours)::numeric, 1)
       from to_verified t where t.hours is not null),
    (select count(*)::integer from public.documents d
      join mine m2 on m2.company_id = d.company_id
      where d.solo_review_note is not null);
end;
$fn$;

comment on function public.pilot_assisted(date, date) is
  'Assisted onboardings in a window, and how long they took to become a verified firm. The solo-review count is the four-eyes exception, kept where it is read.';

revoke all on function public.pilot_assisted(date, date) from public;
grant execute on function public.pilot_assisted(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 15. The nightly sweep
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci curățenia înscrierilor asistate nu este programată. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-assisted-sweep', '40 4 * * *',
                        'select public.sweep_unclaimed_onboardings();');
end;
$cron$;

-- ---------------------------------------------------------------------
-- 16. The health screen learns the new job
--
-- `job_health()` reproduced from 20260925100000 with one line added to
-- each of its two hardcoded lists — the normal path and the fallback
-- that runs when pg_cron's tables are not there. A job missing from
-- either list is a job whose silence nobody notices, which is the only
-- failure mode a cleanup sweep has.
-- ---------------------------------------------------------------------
create or replace function public.job_health(p_now timestamptz default now())
returns table (
  job text,
  scheduled boolean,
  last_run timestamptz,
  last_status text,
  hours_since numeric,
  is_late boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_has_cron boolean := to_regclass('cron.job') is not null;
  v_has_details boolean := to_regclass('cron.job_run_details') is not null;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea starea joburilor'
      using errcode = '42501';
  end if;

  return query
  with expected(job, late_after_hours) as (
    values
      ('account-deletion', 36.0),
      ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-rating-reminders', 36.0),
      ('nightly-reputation', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0),
      ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
  ),
  from_cron as (
    select d.jobname::text as job, max(d.end_time) as last_run,
           (array_agg(d.status order by d.end_time desc))[1]::text as last_status
    from (
      select j.jobname, r.end_time, r.status
      from cron.job j
      left join cron.job_run_details r on r.jobid = j.jobid
      where v_has_cron and v_has_details
    ) d
    group by d.jobname
  ),
  from_log as (
    select l.workflow as job, max(l.ran_at) as last_run,
           case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
    from public.job_run_log l
    group by l.workflow
  ),
  scheduled_jobs as (
    select j.jobname::text as job from cron.job j where v_has_cron
  )
  select
    e.job,
    exists (select 1 from scheduled_jobs s where s.job = e.job),
    greatest(c.last_run, g.last_run),
    coalesce(
      case when g.last_run is not null and (c.last_run is null or g.last_run >= c.last_run)
           then g.last_status else c.last_status end,
      'niciodată'
    ),
    round(extract(epoch from (p_now - greatest(c.last_run, g.last_run))) / 3600.0, 1),
    greatest(c.last_run, g.last_run) is null
      or (p_now - greatest(c.last_run, g.last_run)) > (e.late_after_hours || ' hours')::interval
  from expected e
  left join from_cron c on c.job = e.job
  left join from_log g on g.job = e.job
  order by e.job;
exception
  when undefined_table or invalid_schema_name then
    return query
    select e.job, false, g.last_run,
           coalesce(g.last_status, 'niciodată'),
           round(extract(epoch from (p_now - g.last_run)) / 3600.0, 1),
           g.last_run is null
             or (p_now - g.last_run) > (e.late_after_hours || ' hours')::interval
    from (values
      ('account-deletion', 36.0), ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-rating-reminders', 36.0), ('nightly-reputation', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0), ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$fn$;
