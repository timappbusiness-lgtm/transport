-- =====================================================================
-- 0025 - Sending a company to verification, and a person deciding
--
-- Three things were missing between "I uploaded my documents" and "I can
-- send offers", and without them the onboarding a carrier is asked to
-- complete has no end:
--
--   1. No way to submit. Nothing moved a company from `draft` to `pending`,
--      so the review queue was always empty by construction.
--   2. No way to decide. `review_document()` reviews one file; nothing
--      approved or rejected the company itself.
--   3. No queue to look at. /admin/documente was a placeholder.
--
-- This migration adds the first two. The third is the screen that calls
-- them.
--
-- It also fixes a rule that was wider than the law: copie conformă ARR was
-- required of every vehicle, including light commercials under 3.5 t, which
-- do not need one.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Requirements that do not apply to every vehicle
--
-- `for_vehicle_types` already exists, but listing every type a rule *does*
-- apply to fails in the wrong direction: add a vehicle type next year and
-- it silently escapes the requirement. An exclusion list fails safe — a new
-- type keeps the rule until somebody decides otherwise.
-- ---------------------------------------------------------------------
alter table public.document_requirements
  add column excluded_vehicle_types vehicle_type[];

comment on column public.document_requirements.excluded_vehicle_types is
  'Vehicle types this requirement does NOT apply to. Preferred over listing the included types: a type added later keeps the requirement instead of quietly losing it.';

update public.document_requirements
set excluded_vehicle_types = '{autoutilitara_3_5t}'::vehicle_type[]
where scope = 'vehicle' and kind = 'copie_conforma';

-- Recreated only to add the exclusion to the join. Everything else is the
-- definition from migration 20260916130100, unchanged.
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
 and (r.excluded_vehicle_types is null or not (v.vehicle_type = any (r.excluded_vehicle_types)))
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

-- ---------------------------------------------------------------------
-- When the decision was taken, and why
-- ---------------------------------------------------------------------
alter table public.companies
  add column verified_at timestamptz,
  add column verification_note text;

comment on column public.companies.verification_note is
  'Why a company was rejected, in the words the applicant reads. Written only by review_company().';

-- The guard gains the two new columns. Same function as migration
-- 20260916130100, with verified_at and verification_note added to the list
-- a company account may not write.
create or replace function public.guard_company_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.verification_note is distinct from old.verification_note
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

-- ---------------------------------------------------------------------
-- Is this company ready to be looked at?
--
-- One function, used by the wizard to enable its button and by the submit
-- RPC to refuse — so the screen and the rule cannot disagree about what
-- "complete" means.
--
-- Blocking documents must be uploaded, not approved: the whole point of
-- submitting is that somebody then approves them. Rejected and expired do
-- not count, because both mean the company has something to do first.
-- ---------------------------------------------------------------------
create or replace function public.company_review_readiness(p_company_id uuid)
returns table (
  missing_company_documents integer,
  vehicles_total integer,
  vehicles_incomplete integer,
  needs_vehicles boolean,
  is_ready boolean
)
language sql
stable
security definer
set search_path = public
as $fn$
  with company as (
    select c.company_type from public.companies c where c.id = p_company_id
  ),
  docs as (
    select count(*)::integer as n
    from public.v_company_missing_documents m
    where m.company_id = p_company_id
      and m.is_blocking
      and m.state not in ('ok', 'in_review')
  ),
  per_vehicle as (
    select
      vm.vehicle_id,
      count(*) filter (where vm.is_blocking and vm.state not in ('ok', 'in_review')) as missing
    from public.v_vehicle_missing_documents vm
    where vm.company_id = p_company_id
    group by vm.vehicle_id
  ),
  fleet as (
    select
      (select count(*)::integer from public.vehicles v where v.company_id = p_company_id) as total,
      (select count(*)::integer from per_vehicle where missing > 0) as incomplete
  )
  select
    docs.n,
    fleet.total,
    fleet.incomplete,
    -- A forwarder moves nothing itself, so it is not asked for a fleet.
    (select company_type in ('transport', 'both') from company),
    docs.n = 0
      and fleet.incomplete = 0
      and (
        (select company_type from company) = 'expeditie'
        or fleet.total > 0
      )
  from docs, fleet;
$fn$;

comment on function public.company_review_readiness(uuid) is
  'What still stands between this company and the review queue. Read by the onboarding wizard and applied by submit_company_for_review(), so the button and the rule agree.';

-- ---------------------------------------------------------------------
-- Submitting
--
-- A manager's decision, not a dispatcher's: sending the company to review
-- is a statement about the company's paperwork.
-- ---------------------------------------------------------------------
create or replace function public.submit_company_for_review(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.companies;
  v_after public.companies;
  v_ready record;
begin
  if not public.is_company_manager(p_company_id) then
    raise exception 'Doar administratorii firmei pot trimite firma la verificare'
      using errcode = '42501';
  end if;

  select * into v_before from public.companies where id = p_company_id;
  if v_before.id is null then
    raise exception 'Firma nu există' using errcode = 'P0002';
  end if;

  if v_before.verification_status not in ('draft', 'rejected') then
    raise exception 'Firma este deja trimisă la verificare sau verificată'
      using errcode = '42501';
  end if;

  if v_before.anaf_is_inactive then
    raise exception 'Firma apare inactivă sau radiată la ANAF. Scrie-ne dacă este o eroare.'
      using errcode = '42501';
  end if;

  select * into v_ready from public.company_review_readiness(p_company_id);
  if not v_ready.is_ready then
    raise exception 'Mai sunt documente obligatorii de încărcat înainte de verificare'
      using errcode = '23502';
  end if;

  update public.companies
  set verification_status = 'pending',
      verification_note = null
  where id = p_company_id
  returning * into v_after;

  perform public.write_audit(
    'company.submitted_for_review', 'companies', p_company_id,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Deciding
--
-- Staff only, and only on a company that is actually waiting. Approving
-- clears any earlier rejection note; rejecting requires a reason, because
-- "respins" with no explanation is a support ticket rather than a decision.
-- ---------------------------------------------------------------------
create or replace function public.review_company(
  p_company_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.companies;
  v_after public.companies;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate aproba firme' using errcode = '42501';
  end if;

  select * into v_before from public.companies where id = p_company_id;
  if v_before.id is null then
    raise exception 'Firma nu există' using errcode = 'P0002';
  end if;

  if v_before.verification_status <> 'pending' then
    raise exception 'Firma nu este în așteptarea verificării' using errcode = '42501';
  end if;

  if not p_approve and v_reason is null then
    raise exception 'Respingerea are nevoie de un motiv' using errcode = '22023';
  end if;

  update public.companies
  set verification_status = (case when p_approve then 'verified' else 'rejected' end)
                              ::public.company_verification_status,
      verified_at = case when p_approve then now() else null end,
      verification_note = case when p_approve then null else v_reason end,
      is_suspended = false,
      suspended_at = null,
      suspension_reason = null
  where id = p_company_id
  returning * into v_after;

  perform public.write_audit(
    case when p_approve then 'company.verified' else 'company.rejected' end,
    'companies', p_company_id,
    to_jsonb(v_before), to_jsonb(v_after), v_reason
  );

  -- The applicant is waiting on an e-mail, not on a page they might not
  -- reload. dedupe_key keeps a double click from sending it twice.
  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  values (
    'email',
    case when p_approve then 'company_verified' else 'company_rejected' end,
    p_company_id,
    v_after.contact_email,
    jsonb_build_object(
      'legal_name', v_after.legal_name,
      'company_type', v_after.company_type,
      'reason', v_reason
    ),
    format('company_review:%s:%s', p_company_id, v_after.verification_status)
  )
  -- The unique index on dedupe_key is partial, so the predicate has to be
  -- repeated here for Postgres to infer it.
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (migration 20260916130300).
-- ---------------------------------------------------------------------
grant execute on function public.company_review_readiness(uuid) to authenticated;
grant execute on function public.submit_company_for_review(uuid) to authenticated;
grant execute on function public.review_company(uuid, boolean, text) to authenticated;
