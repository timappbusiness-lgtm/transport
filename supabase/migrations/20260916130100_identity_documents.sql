-- =====================================================================
-- 0011 - Phase 0 hardening: companies, documents, vehicles, storage
--
--   P2b  a company is created only by create_company()
--   P2c  verification, suspension, trust and ANAF fields are not user-writable
--   P3   documents change status only through review_document()
--   P12  compliance flags on vehicles and drivers are computed only
--   R1   an early renewal never un-approves the document it renews
--   #14  documents in review show as in_review, not missing
--   P8   compliance views show the caller's companies (all of them to staff)
--   #15  a submitted document file cannot be overwritten or deleted
-- =====================================================================

-- ---------------------------------------------------------------------
-- P2b - create_company()
-- ---------------------------------------------------------------------
drop policy if exists "companies_insert_authenticated" on public.companies;

-- The founder branch could never work under RLS: the EXISTS subquery reads
-- companies, whose SELECT policy hides a company from someone who is not a
-- member yet. create_company() adds the owner itself.
drop policy if exists "company_members_insert_manager_or_founder" on public.company_members;
create policy "company_members_insert_manager" on public.company_members
  for insert to authenticated
  with check (public.is_company_manager(company_id) or public.is_platform_admin());

create or replace function public.create_company(
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
  v_user uuid := auth.uid();
  v_cui text;
  v_company public.companies;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if (select account_type from public.profiles where id = v_user) is distinct from 'company' then
    raise exception 'Un cont de persoană fizică nu poate înregistra o firmă' using errcode = '42501';
  end if;

  -- "RO 14399840", "ro14399840" and "14399840" are the same CUI.
  v_cui := regexp_replace(upper(coalesce(p_cui, '')), '[^0-9A-Z]', '', 'g');
  v_cui := regexp_replace(v_cui, '^RO', '');
  if v_cui !~ '^[0-9]{2,10}$' then
    raise exception 'CUI invalid' using errcode = '22023';
  end if;
  if nullif(trim(p_legal_name), '') is null then
    raise exception 'Denumirea firmei este obligatorie' using errcode = '22023';
  end if;
  if exists (select 1 from public.companies where country = 'RO' and cui = v_cui) then
    raise exception 'Există deja o firmă înregistrată cu acest CUI' using errcode = '23505';
  end if;

  insert into public.companies
    (cui, legal_name, company_type, county, city, contact_email, contact_phone,
     verification_status, created_by)
  values
    (v_cui, trim(p_legal_name), p_company_type, p_county, p_city, p_contact_email, p_contact_phone,
     'draft', v_user)
  returning * into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company.id, v_user, 'owner');

  perform public.write_audit('company.created', 'companies', v_company.id, null, to_jsonb(v_company));
  return v_company;
end;
$fn$;

-- ---------------------------------------------------------------------
-- P2c - protected company fields
-- ---------------------------------------------------------------------
create or replace function public.guard_company_write()
returns trigger
language plpgsql
as $fn$
begin
  if current_user not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.verification_status is distinct from old.verification_status
     or new.is_suspended is distinct from old.is_suspended
     or new.suspended_at is distinct from old.suspended_at
     or new.suspension_reason is distinct from old.suspension_reason
     or new.trust_score is distinct from old.trust_score
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count
     or new.anaf_payload is distinct from old.anaf_payload
     or new.anaf_checked_at is distinct from old.anaf_checked_at
     or new.anaf_is_inactive is distinct from old.anaf_is_inactive then
    raise exception 'Starea de verificare, suspendarea, scorul și datele ANAF nu pot fi modificate din cont'
      using errcode = '42501';
  end if;

  -- Once a company has left draft, its identity is what was verified.
  if old.verification_status <> 'draft'
     and (new.cui is distinct from old.cui
          or new.country is distinct from old.country
          or new.legal_name is distinct from old.legal_name
          or new.reg_com is distinct from old.reg_com
          or new.company_type is distinct from old.company_type) then
    raise exception 'Datele de identificare ale unei firme verificate nu pot fi modificate din cont'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger companies_guard_write
  before update on public.companies
  for each row execute function public.guard_company_write();

-- Every change to a protected field is audited, whoever makes it: the sweep
-- (suspension, reactivation), review_document (verification), staff edits.
create or replace function public.audit_company_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb := jsonb_build_object(
    'verification_status', old.verification_status, 'is_suspended', old.is_suspended,
    'suspension_reason', old.suspension_reason, 'trust_score', old.trust_score,
    'anaf_is_inactive', old.anaf_is_inactive, 'cui', old.cui, 'legal_name', old.legal_name,
    'company_type', old.company_type);
  v_after jsonb := jsonb_build_object(
    'verification_status', new.verification_status, 'is_suspended', new.is_suspended,
    'suspension_reason', new.suspension_reason, 'trust_score', new.trust_score,
    'anaf_is_inactive', new.anaf_is_inactive, 'cui', new.cui, 'legal_name', new.legal_name,
    'company_type', new.company_type);
  v_action text;
begin
  if v_before = v_after then
    return new;
  end if;

  v_action := case
    when new.is_suspended and not old.is_suspended then 'company.suspended'
    when old.is_suspended and not new.is_suspended then 'company.reactivated'
    when new.verification_status is distinct from old.verification_status then 'company.verification_changed'
    else 'company.identity_changed'
  end;

  perform public.write_audit(v_action, 'companies', new.id, v_before, v_after,
    case when v_action = 'company.suspended' then new.suspension_reason end);
  return new;
end;
$fn$;

create trigger companies_audit_changes
  after update on public.companies
  for each row execute function public.audit_company_changes();

-- ---------------------------------------------------------------------
-- P12 - vehicles and drivers
-- ---------------------------------------------------------------------
create or replace function public.guard_vehicle_write()
returns trigger
language plpgsql
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_compliant := false;
    new.compliance_checked_at := null;
    return new;
  end if;

  if new.is_compliant is distinct from old.is_compliant
     or new.compliance_checked_at is distinct from old.compliance_checked_at
     or new.company_id is distinct from old.company_id
     or new.id is distinct from old.id then
    raise exception 'Conformitatea vehiculului este calculată din documente și nu poate fi modificată'
      using errcode = '42501';
  end if;

  -- The papers were approved for this plate, VIN and type. Changing them
  -- would move a valid ITP onto a different truck.
  if (new.plate_number is distinct from old.plate_number
      or new.vin is distinct from old.vin
      or new.vehicle_type is distinct from old.vehicle_type)
     and exists (select 1 from public.documents d
                 where d.vehicle_id = old.id and d.status = 'approved') then
    raise exception 'Vehiculul are documente aprobate: numărul, seria de șasiu și tipul nu se mai pot schimba. Înregistrează un vehicul nou.'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger vehicles_guard_write
  before insert or update on public.vehicles
  for each row execute function public.guard_vehicle_write();

create or replace function public.guard_driver_write()
returns trigger
language plpgsql
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_compliant := false;
    new.compliance_checked_at := null;
  elsif new.is_compliant is distinct from old.is_compliant
        or new.compliance_checked_at is distinct from old.compliance_checked_at
        or new.company_id is distinct from old.company_id then
    raise exception 'Conformitatea șoferului este calculată din documente și nu poate fi modificată'
      using errcode = '42501';
  end if;

  if new.default_vehicle_id is not null
     and not exists (select 1 from public.vehicles v
                     where v.id = new.default_vehicle_id and v.company_id = new.company_id) then
    raise exception 'Vehiculul nu aparține firmei' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger drivers_guard_write
  before insert or update on public.drivers
  for each row execute function public.guard_driver_write();

-- ---------------------------------------------------------------------
-- P3 - documents
--
-- Members upload and replace. They never update or delete: status, dates
-- and review fields change only through review_document() (staff) or the
-- parse-document edge function (service role).
-- ---------------------------------------------------------------------
drop policy if exists "documents_update_own_or_admin" on public.documents;
drop policy if exists "documents_delete_manager_or_admin" on public.documents;

create policy "documents_delete_staff" on public.documents
  for delete to authenticated
  using (public.is_platform_admin());

create or replace function public.guard_document_insert()
returns trigger
language plpgsql
as $fn$
begin
  -- For every caller: a vehicle or driver document belongs to that
  -- vehicle's or driver's company. Without this, a member of one company
  -- could file an "ITP" against another company's truck and retire its
  -- approved one.
  if new.vehicle_id is not null
     and not exists (select 1 from public.vehicles v
                     where v.id = new.vehicle_id and v.company_id = new.company_id) then
    raise exception 'Vehiculul nu aparține firmei' using errcode = '42501';
  end if;
  if new.driver_id is not null
     and not exists (select 1 from public.drivers dr
                     where dr.id = new.driver_id and dr.company_id = new.company_id) then
    raise exception 'Șoferul nu aparține firmei' using errcode = '42501';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- The file must sit in the company's own folder of the documents bucket.
  if new.file_path is null or position(new.company_id::text || '/' in new.file_path) <> 1 then
    raise exception 'Fișierul trebuie încărcat în dosarul firmei' using errcode = '42501';
  end if;

  new.status := 'uploaded';
  new.valid_from := null;
  new.valid_until := null;
  new.extracted := null;
  new.extraction_confidence := null;
  new.extraction_error := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.rejection_reason := null;
  return new;
end;
$fn$;

-- Sorts before documents_retire_previous, so nothing is retired for an
-- upload that is refused.
create trigger documents_guard_insert
  before insert on public.documents
  for each row execute function public.guard_document_insert();

-- ---------------------------------------------------------------------
-- R1 - an approved document and its renewal in review can coexist
--
-- Before: one row per (target, kind) across approved + pending, and a new
-- upload retired the approved one immediately. A carrier renewing an RCA a
-- month early dropped out of compliance and was suspended that night.
-- Now: one approved and one in review per (target, kind). An upload retires
-- only a previous upload still in review; the approved document is retired
-- by review_document() when its replacement is approved.
-- ---------------------------------------------------------------------
drop index if exists public.documents_one_active_company_doc;
drop index if exists public.documents_one_active_vehicle_doc;
drop index if exists public.documents_one_active_driver_doc;

create unique index documents_one_approved_company_doc
  on public.documents (company_id, kind) where scope = 'company' and status = 'approved';
create unique index documents_one_approved_vehicle_doc
  on public.documents (vehicle_id, kind) where scope = 'vehicle' and status = 'approved';
create unique index documents_one_approved_driver_doc
  on public.documents (driver_id, kind) where scope = 'driver' and status = 'approved';

create unique index documents_one_in_review_company_doc
  on public.documents (company_id, kind) where scope = 'company' and status in ('uploaded', 'parsing', 'pending');
create unique index documents_one_in_review_vehicle_doc
  on public.documents (vehicle_id, kind) where scope = 'vehicle' and status in ('uploaded', 'parsing', 'pending');
create unique index documents_one_in_review_driver_doc
  on public.documents (driver_id, kind) where scope = 'driver' and status in ('uploaded', 'parsing', 'pending');

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
    and d.status in ('uploaded', 'parsing', 'pending')
    and (
      (new.scope = 'company' and d.company_id = new.company_id)
      or (new.scope = 'vehicle' and d.vehicle_id = new.vehicle_id)
      or (new.scope = 'driver'  and d.driver_id  = new.driver_id)
    );
  return new;
end;
$fn$;

-- Deleting a document changes compliance; only staff can, and it is audited.
create or replace function public.audit_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.write_audit('document.deleted', 'documents', old.id, to_jsonb(old), null);
  return old;
end;
$fn$;

create trigger documents_audit_delete
  after delete on public.documents
  for each row execute function public.audit_document_delete();

-- ---------------------------------------------------------------------
-- review_document() - the only way a document is approved or rejected
-- ---------------------------------------------------------------------
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
  v_before public.documents;
  v_doc public.documents;
  v_has_expiry boolean;
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

  if p_approve then
    select r.has_expiry into v_has_expiry
    from public.document_requirements r
    where r.scope = v_before.scope and r.kind = v_before.kind;

    if coalesce(v_has_expiry, false) and coalesce(p_valid_until, v_before.valid_until) is null then
      raise exception 'Data de expirare este obligatorie pentru acest document' using errcode = '22023';
    end if;

    -- R1: the renewal replaces the approved document only now.
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
  elsif nullif(trim(p_rejection_reason), '') is null then
    raise exception 'Motivul respingerii este obligatoriu' using errcode = '22023';
  end if;

  update public.documents
  set status = case when p_approve then 'approved'::document_status else 'rejected'::document_status end,
      valid_until = coalesce(p_valid_until, valid_until),
      rejection_reason = case when p_approve then null else p_rejection_reason end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_document_id
  returning * into v_doc;

  -- Promote the company out of draft / pending once nothing blocking is left.
  update public.companies c
  set verification_status = 'verified'
  from public.v_company_compliance cc
  where c.id = v_doc.company_id
    and cc.company_id = c.id
    and cc.documents_ok
    and c.verification_status in ('draft', 'pending');

  perform public.write_audit(
    case when p_approve then 'document.approved' else 'document.rejected' end,
    'documents', v_doc.id, to_jsonb(v_before), to_jsonb(v_doc), p_rejection_reason);

  return v_doc;
end;
$fn$;

-- ---------------------------------------------------------------------
-- #14, P8 - compliance views
--
-- One document per requirement, the most relevant first: approved and in
-- date, then in review, then the latest rejected or expired. A pending
-- upload used to show as "missing" because the join only looked at
-- approved rows.
--
-- security_invoker: the caller's RLS applies, so a member sees their own
-- companies and staff see all. run_compliance_sweep() runs as the table
-- owner, which RLS does not restrict, so it still sees every company.
-- ---------------------------------------------------------------------
create or replace view public.v_company_missing_documents
with (security_invoker = true) as
select
  c.id as company_id,
  r.kind,
  r.label_ro,
  r.is_blocking,
  case
    when d.id is null then 'missing'
    when d.status = 'approved'
         and not (r.has_expiry and d.valid_until < current_date - r.grace_days) then 'ok'
    when d.status in ('uploaded', 'parsing', 'pending') then 'in_review'
    when d.status = 'rejected' then 'rejected'
    else 'expired'
  end as state,
  d.valid_until
from public.companies c
join public.document_requirements r
  on r.scope = 'company'
 and r.is_active
 and (r.for_company_types is null or c.company_type = any (r.for_company_types))
left join lateral (
  select dd.*
  from public.documents dd
  where dd.company_id = c.id
    and dd.scope = 'company'
    and dd.kind = r.kind
    and dd.status in ('approved', 'uploaded', 'parsing', 'pending', 'rejected', 'expired')
  order by
    case
      when dd.status = 'approved'
           and not (r.has_expiry and dd.valid_until < current_date - r.grace_days) then 0
      when dd.status in ('uploaded', 'parsing', 'pending') then 1
      else 2
    end,
    dd.created_at desc
  limit 1
) d on true;

create or replace view public.v_vehicle_missing_documents
with (security_invoker = true) as
select
  v.id as vehicle_id,
  v.company_id,
  r.kind,
  r.label_ro,
  r.is_blocking,
  case
    when d.id is null then 'missing'
    when d.status = 'approved'
         and not (r.has_expiry and d.valid_until < current_date - r.grace_days) then 'ok'
    when d.status in ('uploaded', 'parsing', 'pending') then 'in_review'
    when d.status = 'rejected' then 'rejected'
    else 'expired'
  end as state,
  d.valid_until
from public.vehicles v
join public.document_requirements r
  on r.scope = 'vehicle'
 and r.is_active
 and (r.for_vehicle_types is null or v.vehicle_type = any (r.for_vehicle_types))
left join lateral (
  select dd.*
  from public.documents dd
  where dd.vehicle_id = v.id
    and dd.scope = 'vehicle'
    and dd.kind = r.kind
    and dd.status in ('approved', 'uploaded', 'parsing', 'pending', 'rejected', 'expired')
  order by
    case
      when dd.status = 'approved'
           and not (r.has_expiry and dd.valid_until < current_date - r.grace_days) then 0
      when dd.status in ('uploaded', 'parsing', 'pending') then 1
      else 2
    end,
    dd.created_at desc
  limit 1
) d on true;

alter view public.v_company_compliance set (security_invoker = true);

revoke all on public.v_company_missing_documents, public.v_vehicle_missing_documents,
              public.v_company_compliance from anon;
grant select on public.v_company_missing_documents, public.v_vehicle_missing_documents,
               public.v_company_compliance to authenticated;

-- ---------------------------------------------------------------------
-- #15 - storage: a submitted document file is never overwritten
--
-- Members read and upload into their company's folder. Without UPDATE,
-- an upload cannot upsert over an existing object; without DELETE, a file
-- a document points to cannot disappear. A replacement is a new object and
-- a new documents row.
-- ---------------------------------------------------------------------
drop policy if exists "documents_update_own_company" on storage.objects;
drop policy if exists "documents_delete_own_company" on storage.objects;

create policy "documents_delete_staff" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_platform_admin());
