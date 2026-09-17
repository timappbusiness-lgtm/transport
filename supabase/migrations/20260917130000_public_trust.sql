-- =====================================================================
-- 0025 - What we can say in public about verification
--
-- The homepage and /verificare make claims about safety. A claim the
-- database does not enforce is marketing; a claim it does enforce is a
-- fact. This migration exposes exactly the two facts those pages need, and
-- nothing else:
--
--   v_document_requirements_public  which documents are required, of whom,
--                                   and what happens when one expires
--   verified_carriers_count()       how many carriers can send offers today
--
-- The second returns a number, never a row. "2.500 de firme" on a
-- competitor's homepage is a number nobody can check; this one is a count
-- of companies that are verified, not suspended, and carry a transport
-- licence — which is the same set the offer guard lets through.
--
-- Plus two more settings on homepage_settings, so the team can decide how
-- many companies is enough to be worth stating, and can change what the
-- page says about review times without a deploy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The rules, in public
--
-- document_requirements is readable by `authenticated` only, and the page
-- that explains the rules has to work for somebody who has not signed up
-- yet — that is the entire point of it. The view carries the columns the
-- page renders and leaves the operational ones (is_active, ids, timestamps)
-- behind.
-- ---------------------------------------------------------------------
create view public.v_document_requirements_public as
select
  r.scope,
  r.kind,
  r.label_ro,
  r.for_company_types,
  r.for_vehicle_types,
  r.is_blocking,
  r.has_expiry,
  r.grace_days,
  r.reminder_days
from public.document_requirements r
where r.is_active;

comment on view public.v_document_requirements_public is
  'The document rules as /verificare states them. Read by anon: a page explaining what we ask for has to work before somebody signs up.';

revoke all on public.v_document_requirements_public from public;
grant select on public.v_document_requirements_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- How many carriers can act today
--
-- Verified, not suspended, and licensed for transport — the same three
-- conditions company_can_act() applies before an offer is allowed through.
-- A company whose licence lapsed is suspended by the nightly sweep, so it
-- drops out of this count on its own.
--
-- SECURITY DEFINER because anon cannot read `companies` at all, and must
-- not be able to: the count is a number, and the rows behind it are not
-- public. It returns an integer and nothing else.
-- ---------------------------------------------------------------------
create or replace function public.verified_carriers_count()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
  from public.companies c
  where c.verification_status = 'verified'
    and not c.is_suspended
    and c.company_type in ('transport', 'both');
$fn$;

comment on function public.verified_carriers_count() is
  'How many transport companies are verified and not suspended right now. A number, never a row: anon has no read access to companies.';

create index if not exists companies_verified_carrier_idx
  on public.companies (company_type)
  where verification_status = 'verified' and not is_suspended;

-- ---------------------------------------------------------------------
-- Two more thresholds
--
-- verified_companies_min: below this, the homepage says nothing about how
-- many carriers there are. Nineteen companies is not a market, and a line
-- that reads "3 firme" does more harm than no line.
--
-- review_time_label: what /verificare answers to "how long does it take".
-- Text rather than a number of hours, because the honest answer changes
-- shape as the queue grows. NULL hides the question entirely, which is the
-- right answer on a day when we cannot promise anything.
-- ---------------------------------------------------------------------
alter table public.homepage_settings
  add column verified_companies_min integer not null default 20
    check (verified_companies_min between 0 and 100000),
  add column review_time_label text
    check (review_time_label is null or length(btrim(review_time_label)) between 3 and 120);

update public.homepage_settings
set review_time_label = 'în cel mult o zi lucrătoare'
where id;

comment on column public.homepage_settings.review_time_label is
  'The answer /verificare gives to "how long does verification take". NULL hides the question rather than guessing.';

-- ---------------------------------------------------------------------
-- The settings RPC takes two more values
--
-- Dropped and recreated rather than overloaded: two functions of the same
-- name with different arity confuse PostgREST, and there is no caller left
-- on the two-argument one.
-- ---------------------------------------------------------------------
drop function if exists public.set_homepage_settings(integer, integer);

create or replace function public.set_homepage_settings(
  p_stats_min_requests integer,
  p_feed_min_requests integer,
  p_verified_companies_min integer,
  p_review_time_label text
)
returns public.homepage_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.homepage_settings;
  v_after public.homepage_settings;
  v_label text := nullif(btrim(coalesce(p_review_time_label, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica pragurile de afișare' using errcode = '42501';
  end if;

  if p_stats_min_requests is null or p_stats_min_requests < 0 then
    raise exception 'Pragul pentru statistici trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  if p_feed_min_requests is null or p_feed_min_requests < 1 then
    raise exception 'Pragul pentru lista de cereri trebuie să fie cel puțin 1' using errcode = '22023';
  end if;

  if p_verified_companies_min is null or p_verified_companies_min < 1 then
    raise exception 'Pragul pentru numărul de firme trebuie să fie cel puțin 1' using errcode = '22023';
  end if;

  if v_label is not null and length(v_label) < 3 then
    raise exception 'Textul despre durata verificării este prea scurt' using errcode = '22023';
  end if;

  select * into v_before from public.homepage_settings where id;

  update public.homepage_settings
  set stats_min_requests = p_stats_min_requests,
      feed_min_requests = p_feed_min_requests,
      verified_companies_min = p_verified_companies_min,
      review_time_label = v_label,
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit(
    'homepage_settings.updated', 'homepage_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants. Default privileges grant EXECUTE to nobody (20260916130300).
-- ---------------------------------------------------------------------
grant execute on function public.verified_carriers_count() to anon, authenticated;
grant execute on function public.set_homepage_settings(integer, integer, integer, text) to authenticated;
