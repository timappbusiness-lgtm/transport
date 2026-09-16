-- =====================================================================
-- 0003 - Documents and the compliance engine
--
-- This is the core of the product: a company or a vehicle is only allowed
-- to trade on the exchange while every blocking document is approved and
-- still valid. When one expires, the account is suspended automatically
-- until the document is replaced.
-- =====================================================================

create type document_scope as enum ('company', 'vehicle', 'driver');

create type document_kind as enum (
  -- company level
  'licenta_comunitara',            -- EU community licence (road haulage)
  'licenta_transport_national',
  'certificat_casa_expeditii',     -- freight forwarder credentials
  'certificat_inregistrare_onrc',
  'asigurare_cmr',                 -- CMR carrier liability insurance
  'asigurare_raspundere_expeditor',-- forwarder liability insurance
  'certificat_fiscal',
  -- vehicle level
  'copie_conforma',                -- ARR conform copy of the licence
  'itp',                           -- periodic technical inspection
  'rca',                           -- mandatory motor liability insurance
  'carte_verde',                   -- green card
  'casco',
  'asigurare_marfa',
  'autorizatie_adr',
  'rovinieta',
  -- driver level
  'atestat_profesional',
  'permis_conducere',
  'card_tahograf'
);

create type document_status as enum (
  'uploaded',   -- file stored, not parsed yet
  'parsing',    -- OCR in progress
  'pending',    -- parsed, waiting for admin review
  'approved',
  'rejected',
  'expired',
  'replaced'    -- superseded by a newer upload of the same kind
);

-- ---------------------------------------------------------------------
-- document_requirements - configuration, not code.
-- Lets us change what is mandatory without a deploy.
-- ---------------------------------------------------------------------
create table public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope document_scope not null,
  kind document_kind not null,
  label_ro text not null,
  -- Which company types must provide it. NULL = all.
  for_company_types company_type[],
  -- Which vehicle types must provide it. NULL = all (scope = 'vehicle' only).
  for_vehicle_types vehicle_type[],
  -- Blocking documents suspend the account when missing or expired.
  is_blocking boolean not null default true,
  has_expiry boolean not null default true,
  -- Days after expiry before the account is actually suspended.
  grace_days integer not null default 0 check (grace_days >= 0),
  -- Reminder schedule, in days before expiry.
  reminder_days integer[] not null default '{30,14,7,1}',
  is_active boolean not null default true,
  constraint document_requirements_unique unique (scope, kind)
);

create trigger document_requirements_set_updated_at
  before update on public.document_requirements
  for each row execute function public.set_updated_at();

insert into public.document_requirements
  (scope, kind, label_ro, for_company_types, for_vehicle_types, is_blocking, has_expiry, grace_days)
values
  ('company', 'licenta_comunitara',             'Licență comunitară',                   '{transport,both}', null, true,  true,  0),
  ('company', 'certificat_casa_expeditii',      'Certificat casă de expediții',         '{expeditie,both}', null, true,  true,  0),
  ('company', 'certificat_inregistrare_onrc',   'Certificat de înregistrare (ONRC)',    null,               null, true,  false, 0),
  ('company', 'asigurare_cmr',                  'Asigurare CMR',                        '{transport,both}', null, true,  true,  3),
  ('company', 'asigurare_raspundere_expeditor', 'Asigurare răspundere expeditor',       '{expeditie,both}', null, false, true,  3),
  ('vehicle', 'copie_conforma',                 'Copie conformă ARR',                   null,               null, true,  true,  0),
  ('vehicle', 'itp',                            'ITP (inspecție tehnică periodică)',    null,               null, true,  true,  0),
  ('vehicle', 'rca',                            'Poliță RCA',                           null,               null, true,  true,  0),
  ('vehicle', 'carte_verde',                    'Carte Verde',                          null,               null, false, true,  0),
  ('vehicle', 'autorizatie_adr',                'Autorizație ADR',                      null,               null, false, true,  0),
  ('driver',  'atestat_profesional',            'Atestat profesional',                  null,               null, false, true,  0),
  ('driver',  'permis_conducere',               'Permis de conducere',                  null,               null, false, true,  0);

-- Vehicles up to 3.5t do not need a community licence conform copy.
update public.document_requirements
set for_vehicle_types = (
  select array_agg(v) from unnest(enum_range(null::vehicle_type)) v
  where v <> 'autoutilitara_3_5t'
)
where scope = 'vehicle' and kind = 'copie_conforma';

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete cascade,
  scope document_scope not null,
  kind document_kind not null,

  -- Path inside the private 'documents' storage bucket.
  file_path text not null,
  file_mime text,
  file_size_bytes integer,

  document_number text,
  issued_at date,
  valid_from date,
  valid_until date,

  status document_status not null default 'uploaded',
  -- Raw structured output of the OCR edge function, kept for audit.
  extracted jsonb,
  extraction_confidence numeric(3,2),
  extraction_error text,

  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,

  uploaded_by uuid references public.profiles (id) on delete set null,

  constraint documents_scope_target_ck check (
    (scope = 'company' and vehicle_id is null and driver_id is null)
    or (scope = 'vehicle' and vehicle_id is not null and driver_id is null)
    or (scope = 'driver'  and driver_id  is not null and vehicle_id is null)
  ),
  constraint documents_validity_ck check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

comment on table public.documents is
  'Every uploaded proof of compliance. OCR fills valid_until, an admin approves it, the sweep expires it.';
comment on column public.documents.status is
  'Only "approved" documents count towards compliance. OCR never auto-approves - see docs/03-document-compliance.md.';

create index documents_company_idx on public.documents (company_id, kind, status);
create index documents_vehicle_idx on public.documents (vehicle_id) where vehicle_id is not null;
create index documents_driver_idx on public.documents (driver_id) where driver_id is not null;
create index documents_expiry_idx on public.documents (valid_until) where status = 'approved';
create index documents_review_queue_idx on public.documents (created_at) where status = 'pending';

-- At most one approved document per (target, kind). Uploading a new one
-- marks the previous as 'replaced' (see trigger below).
create unique index documents_one_active_company_doc
  on public.documents (company_id, kind)
  where scope = 'company' and status in ('approved', 'pending');
create unique index documents_one_active_vehicle_doc
  on public.documents (vehicle_id, kind)
  where scope = 'vehicle' and status in ('approved', 'pending');
create unique index documents_one_active_driver_doc
  on public.documents (driver_id, kind)
  where scope = 'driver' and status in ('approved', 'pending');

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- When a new document of the same kind arrives, retire the previous one so
-- the partial unique indexes above never collide.
create or replace function public.retire_previous_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.documents d
  set status = 'replaced'
  where d.id <> new.id
    and d.kind = new.kind
    and d.scope = new.scope
    and d.status in ('approved', 'pending', 'uploaded', 'parsing')
    and (
      (new.scope = 'company' and d.company_id = new.company_id)
      or (new.scope = 'vehicle' and d.vehicle_id = new.vehicle_id)
      or (new.scope = 'driver'  and d.driver_id  = new.driver_id)
    );
  return new;
end;
$fn$;

create trigger documents_retire_previous
  before insert on public.documents
  for each row execute function public.retire_previous_document();

-- ---------------------------------------------------------------------
-- account_suspensions - audit trail of every automatic suspension
-- ---------------------------------------------------------------------
create table public.account_suspensions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reason text not null,
  missing_kinds document_kind[],
  triggered_by_document_id uuid references public.documents (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null
);

create index account_suspensions_company_idx on public.account_suspensions (company_id, started_at desc);

-- ---------------------------------------------------------------------
-- Compliance views
-- ---------------------------------------------------------------------

-- Every document a company still owes, per requirement.
create view public.v_company_missing_documents as
select
  c.id as company_id,
  r.kind,
  r.label_ro,
  r.is_blocking,
  case
    when d.id is null then 'missing'
    when d.status = 'rejected' then 'rejected'
    when d.status in ('uploaded', 'parsing', 'pending') then 'in_review'
    when r.has_expiry and d.valid_until < current_date - r.grace_days then 'expired'
    else 'ok'
  end as state,
  d.valid_until
from public.companies c
join public.document_requirements r
  on r.scope = 'company'
 and r.is_active
 and (r.for_company_types is null or c.company_type = any (r.for_company_types))
left join public.documents d
  on d.company_id = c.id
 and d.kind = r.kind
 and d.status = 'approved';

create view public.v_vehicle_missing_documents as
select
  v.id as vehicle_id,
  v.company_id,
  r.kind,
  r.label_ro,
  r.is_blocking,
  case
    when d.id is null then 'missing'
    when d.status in ('uploaded', 'parsing', 'pending') then 'in_review'
    when r.has_expiry and d.valid_until < current_date - r.grace_days then 'expired'
    else 'ok'
  end as state,
  d.valid_until
from public.vehicles v
join public.document_requirements r
  on r.scope = 'vehicle'
 and r.is_active
 and (r.for_vehicle_types is null or v.vehicle_type = any (r.for_vehicle_types))
left join public.documents d
  on d.vehicle_id = v.id
 and d.kind = r.kind
 and d.status = 'approved';

-- One row per company: is it allowed to trade right now, and why not.
create view public.v_company_compliance as
select
  c.id as company_id,
  c.legal_name,
  c.verification_status,
  c.is_suspended,
  coalesce(array_agg(m.kind) filter (where m.is_blocking and m.state <> 'ok'), '{}') as blocking_kinds,
  coalesce(array_agg(m.kind) filter (where m.state = 'expired'), '{}') as expired_kinds,
  count(*) filter (where m.is_blocking and m.state <> 'ok') = 0 as documents_ok
from public.companies c
left join public.v_company_missing_documents m on m.company_id = c.id
group by c.id, c.legal_name, c.verification_status, c.is_suspended;

grant select on public.v_company_missing_documents to authenticated;
grant select on public.v_vehicle_missing_documents to authenticated;
grant select on public.v_company_compliance to authenticated;

-- ---------------------------------------------------------------------
-- The sweep: expire documents, suspend/reactivate companies and vehicles.
-- Idempotent - safe to run as often as you like.
-- Scheduled nightly in migration 0007.
-- ---------------------------------------------------------------------
create or replace function public.run_compliance_sweep()
returns table (expired_documents integer, suspended_companies integer, reactivated_companies integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_expired integer := 0;
  v_suspended integer := 0;
  v_reactivated integer := 0;
begin
  -- 1. Flip approved documents past their grace period to 'expired'.
  with expired as (
    update public.documents d
    set status = 'expired'
    from public.document_requirements r
    where r.scope = d.scope
      and r.kind = d.kind
      and d.status = 'approved'
      and r.has_expiry
      and d.valid_until is not null
      and d.valid_until < current_date - r.grace_days
    returning d.id
  )
  select count(*) into v_expired from expired;

  -- 2. Refresh per-vehicle compliance.
  update public.vehicles v
  set is_compliant = sub.ok,
      compliance_checked_at = now()
  from (
    select vm.vehicle_id,
           count(*) filter (where vm.is_blocking and vm.state <> 'ok') = 0 as ok
    from public.v_vehicle_missing_documents vm
    group by vm.vehicle_id
  ) sub
  where v.id = sub.vehicle_id
    and v.is_compliant is distinct from sub.ok;

  -- 3. Suspend verified companies that lost a blocking document.
  with to_suspend as (
    update public.companies c
    set is_suspended = true,
        suspended_at = now(),
        suspension_reason = 'Documente obligatorii expirate sau lipsă',
        verification_status = 'suspended'
    from public.v_company_compliance cc
    where cc.company_id = c.id
      and cc.documents_ok = false
      and c.verification_status = 'verified'
      and c.is_suspended = false
    returning c.id, cc.blocking_kinds
  )
  insert into public.account_suspensions (company_id, reason, missing_kinds)
  select id, 'Documente obligatorii expirate sau lipsă', blocking_kinds from to_suspend;
  get diagnostics v_suspended = row_count;

  -- 4. Reactivate companies that fixed their documents.
  --    Counted on the companies update, not on the suspension rows, so the
  --    returned counter means "companies reactivated" and not "audit rows closed".
  update public.companies c
  set is_suspended = false,
      suspended_at = null,
      suspension_reason = null,
      verification_status = 'verified'
  from public.v_company_compliance cc
  where cc.company_id = c.id
    and cc.documents_ok = true
    and c.is_suspended = true
    and c.verification_status = 'suspended';
  get diagnostics v_reactivated = row_count;

  update public.account_suspensions s
  set ended_at = now()
  from public.companies c
  where s.company_id = c.id
    and c.is_suspended = false
    and s.ended_at is null;

  -- 5. Take suspended companies and non-compliant vehicles off the board.
  --    (cargo_listings / truck_listings are created in migration 0004;
  --     the guard keeps this function runnable before that migration.)
  if to_regclass('public.cargo_listings') is not null then
    update public.cargo_listings l
    set status = 'suspended'
    from public.companies c
    where l.company_id = c.id
      and c.is_suspended
      and l.status = 'active';
  end if;

  if to_regclass('public.truck_listings') is not null then
    update public.truck_listings l
    set status = 'suspended'
    from public.vehicles v
    where l.vehicle_id = v.id
      and v.is_compliant = false
      and l.status = 'active';
  end if;

  return query select v_expired, v_suspended, v_reactivated;
end;
$fn$;

comment on function public.run_compliance_sweep() is
  'Nightly job. Expires documents, suspends and reactivates companies, pulls their listings off the board. Idempotent.';

-- Re-run the sweep immediately whenever a document is approved or rejected,
-- so a company is not stuck waiting for the nightly job.
create or replace function public.documents_after_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Only admin decisions re-run the sweep. 'expired' is deliberately excluded:
  -- the sweep itself sets that status, so reacting to it would make the sweep
  -- call itself once per expired document - the work is done twice and the
  -- counters it returns come back as zero. pg_trigger_depth() keeps that true
  -- even if another trigger is added above this one later.
  if new.status is distinct from old.status
     and new.status in ('approved', 'rejected')
     and pg_trigger_depth() = 1 then
    perform public.run_compliance_sweep();
  end if;
  return new;
end;
$fn$;

create trigger documents_recheck_compliance
  after update on public.documents
  for each row execute function public.documents_after_review();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_requirements enable row level security;
alter table public.account_suspensions enable row level security;

create policy "documents_select_own_or_admin" on public.documents
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (public.is_company_member(company_id) and uploaded_by = auth.uid());

-- Members may re-upload or correct metadata, but only admins may approve.
-- The status transition itself is guarded by review_document() below.
create policy "documents_update_own_or_admin" on public.documents
  for update to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_member(company_id) or public.is_platform_admin());

create policy "documents_delete_manager_or_admin" on public.documents
  for delete to authenticated
  using (public.is_company_manager(company_id) or public.is_platform_admin());

create policy "document_requirements_select_all" on public.document_requirements
  for select to authenticated using (true);
create policy "document_requirements_insert_admin" on public.document_requirements
  for insert to authenticated with check (public.is_platform_admin());
create policy "document_requirements_update_admin" on public.document_requirements
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "document_requirements_delete_admin" on public.document_requirements
  for delete to authenticated using (public.is_platform_admin());

create policy "account_suspensions_select_own_or_admin" on public.account_suspensions
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());
create policy "account_suspensions_insert_admin" on public.account_suspensions
  for insert to authenticated with check (public.is_platform_admin());
create policy "account_suspensions_update_admin" on public.account_suspensions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "account_suspensions_delete_admin" on public.account_suspensions
  for delete to authenticated using (public.is_platform_admin());

-- Approving a document is an admin-only action with an audit trail.
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
declare
  v_doc public.documents;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can review documents' using errcode = '42501';
  end if;

  update public.documents
  set status = case when p_approve then 'approved'::document_status else 'rejected'::document_status end,
      valid_until = coalesce(p_valid_until, valid_until),
      rejection_reason = case when p_approve then null else p_rejection_reason end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_document_id
  returning * into v_doc;

  if v_doc.id is null then
    raise exception 'Document % not found', p_document_id using errcode = 'P0002';
  end if;

  -- Promote the company out of 'pending' once nothing blocking is left.
  update public.companies c
  set verification_status = 'verified'
  from public.v_company_compliance cc
  where c.id = v_doc.company_id
    and cc.company_id = c.id
    and cc.documents_ok
    and c.verification_status in ('draft', 'pending');

  return v_doc;
end;
$fn$;

revoke all on function public.review_document(uuid, boolean, date, text) from public;
grant execute on function public.review_document(uuid, boolean, date, text) to authenticated;
