-- =====================================================================
-- Importing a car listing into a transport request
--
-- Somebody who wants a car moved usually has the listing open in another
-- tab. Retyping make, model, year and city from it is the point at which
-- a four-step form loses people, so the form offers to read the listing
-- and fill what it finds.
--
-- Three things this schema exists to enforce, none of which belong in a
-- component:
--
--   1. A model call costs money. Every extraction claims a slot BEFORE
--      it runs, against a per-person daily limit and a monthly budget,
--      and the slot is what gets written even when the call fails.
--      A limit checked after the spend is not a limit.
--
--   2. Nothing from the third-party page is stored. The log keeps who,
--      when, which kind of source, how long, whether it worked and what
--      it cost. The host is kept because a site that starts refusing us
--      is something we need to see; the page, its text and its HTML are
--      never written down.
--
--   3. Extracted data is never verified data. Nothing here writes a
--      request. The extraction returns fields to a form that a person
--      reads, corrects and submits, and `create_cargo_request` applies
--      exactly the same rules it always did.
--
-- Anonymous callers are counted too, by a salted hash of their address
-- and never the address itself: enough to stop one machine spending the
-- month's budget, not enough to follow anybody around. See
-- `claim_import_slot` for where the salt comes from.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The dials
-- ---------------------------------------------------------------------
create table public.import_settings (
  id boolean primary key default true check (id),
  updated_at timestamptz not null default now(),

  -- The whole feature, off in one place. The form keeps working; only
  -- the two import tabs disappear.
  is_enabled boolean not null default true,

  -- Per person per day. Ten is roughly "I am moving my car and got it
  -- wrong a few times", and well under what an afternoon of abuse costs.
  daily_limit_per_user integer not null default 10
    check (daily_limit_per_user between 0 and 500),

  -- Stricter without an account, because there is nothing to suspend.
  daily_limit_per_ip integer not null default 3
    check (daily_limit_per_ip between 0 and 100),

  -- Dollars, because that is the unit the model is priced in. Converting
  -- to RON here would bake in a rate that goes stale.
  monthly_budget_usd numeric(10, 2) not null default 50.00
    check (monthly_budget_usd >= 0),

  -- Staff hear once when the month's spend crosses this share of the
  -- budget, and again when it is spent. Not on every extraction after.
  alert_at_pct integer not null default 80 check (alert_at_pct between 1 and 100),

  -- Below this, a field is dropped rather than shown. A wrong value the
  -- person has to notice and delete is worse than an empty box.
  min_field_confidence numeric(3, 2) not null default 0.70
    check (min_field_confidence between 0 and 1)
);

comment on table public.import_settings is
  'One row. The limits, the budget and the confidence floor for listing import. Staff change it through set_import_settings.';
comment on column public.import_settings.min_field_confidence is
  'A field the model is less sure of than this is not offered at all. An empty box costs a person ten seconds; a wrong year they did not notice costs them a transport.';

insert into public.import_settings (id) values (true);

create trigger import_settings_set_updated_at
  before update on public.import_settings
  for each row execute function public.set_updated_at();

alter table public.import_settings enable row level security;

-- The form needs to know whether the tabs exist and what the limit is,
-- logged out included. There is nothing secret in this row.
create policy "import_settings_select_all" on public.import_settings
  for select to anon, authenticated using (true);

-- No write policy: set_import_settings is the only way in.

-- ---------------------------------------------------------------------
-- The log
--
-- One row per attempt, written before the attempt and completed after.
-- A row that never completes is an extraction that crashed, and that is
-- worth being able to see.
-- ---------------------------------------------------------------------
create table public.listing_extractions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Exactly one of these is set. Both null would be a row nobody is
  -- counted against, which is the shape a quota bug takes.
  user_id uuid references public.profiles (id) on delete set null,
  ip_hash text,

  source_type text not null check (source_type in ('link', 'photo')),

  -- Host only, and only for a link. Never the path, the query or the
  -- page: a listing URL identifies a specific car somebody is selling.
  source_host text check (source_host is null or length(source_host) <= 253),

  status text not null default 'running'
    check (status in ('running', 'ok', 'failed')),

  -- A code from a fixed list, not the site's or the model's words. Free
  -- text from a third party is how a page's content ends up in our logs.
  failure_reason text check (failure_reason is null or failure_reason in (
    'robots_disallow',    -- the site's robots.txt says no
    'fetch_failed',       -- unreachable, TLS, DNS
    'fetch_timeout',
    'http_error',         -- 4xx/5xx, including a challenge page
    'not_html',
    'too_large',
    'no_metadata',        -- fetched fine, carries no OG and no JSON-LD
    'model_error',
    'model_refused',
    'bad_request',
    'unknown'
  )),

  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),

  -- How many of the fields survived the confidence floor. Tells us
  -- whether the feature is helping without keeping what it extracted.
  fields_kept integer check (fields_kept is null or fields_kept >= 0),

  constraint listing_extractions_has_a_subject
    check (user_id is not null or ip_hash is not null)
);

comment on table public.listing_extractions is
  'One row per extraction attempt. Who, when, what kind of source, how long, whether it worked and what it cost. Never what the page said.';
comment on column public.listing_extractions.ip_hash is
  'Salted SHA-256 of the caller address for anonymous attempts. The salt lives in the edge function environment, so a row here cannot be walked back to an address by anyone holding only the database.';
comment on column public.listing_extractions.source_host is
  'Hostname only. A full listing URL identifies a particular car somebody is selling, which is not ours to keep.';

create index listing_extractions_user_day_idx
  on public.listing_extractions (user_id, created_at desc)
  where user_id is not null;
create index listing_extractions_ip_day_idx
  on public.listing_extractions (ip_hash, created_at desc)
  where ip_hash is not null;
create index listing_extractions_month_idx
  on public.listing_extractions (created_at desc);

alter table public.listing_extractions enable row level security;

-- Your own attempts, so "you have 4 left today" can be shown honestly.
create policy "listing_extractions_select_own" on public.listing_extractions
  for select to authenticated
  using (user_id = auth.uid());

create policy "listing_extractions_select_staff" on public.listing_extractions
  for select to authenticated
  using (public.is_platform_admin());

-- No insert, update or delete policy for anybody. The two functions
-- below are SECURITY DEFINER and service_role only; a row a caller could
-- write is a quota a caller could reset.

-- ---------------------------------------------------------------------
-- What the month has cost so far
--
-- The month is a Bucharest month, not a UTC one, for the same reason the
-- quiet hours are Bucharest hours: a budget that rolls over at 02:00 on
-- the 1st is a budget nobody can reconcile against an invoice.
-- ---------------------------------------------------------------------
create or replace function public.import_month_spend(p_now timestamptz default now())
returns table (spent_usd numeric, budget_usd numeric, extractions integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    coalesce(sum(e.cost_usd), 0)::numeric,
    (select s.monthly_budget_usd from public.import_settings s where s.id),
    count(e.id)::integer
  from public.listing_extractions e
  where e.created_at >= (
    date_trunc('month', p_now at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
  );
$fn$;

comment on function public.import_month_spend is
  'Spend and attempt count for the current Bucharest month, with the budget it runs against. Internal: the platform''s spend is not every account''s business, so the staff-facing wrapper below is what a screen calls.';

-- ---------------------------------------------------------------------
-- The same number, for the team
--
-- A separate function rather than a wider grant, because the guard has to
-- be the caller's identity and `claim_import_slot` calls the one above
-- with no caller at all.
-- ---------------------------------------------------------------------
create or replace function public.import_budget_status(p_now timestamptz default now())
returns table (spent_usd numeric, budget_usd numeric, extractions integer, used_pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v record;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea consumul' using errcode = '42501';
  end if;

  select * into v from public.import_month_spend(p_now);

  return query select
    v.spent_usd,
    v.budget_usd,
    v.extractions,
    case when v.budget_usd > 0 then round(v.spent_usd * 100 / v.budget_usd, 1) else null end;
end;
$fn$;

comment on function public.import_budget_status is
  'Staff-only view of this month''s extraction spend against the budget.';

-- ---------------------------------------------------------------------
-- How many the caller has left today
--
-- Only ever their own: the parameterless shape is deliberate, so a
-- caller cannot ask about somebody else.
-- ---------------------------------------------------------------------
create or replace function public.import_quota(p_now timestamptz default now())
returns table (used integer, limit_per_day integer, remaining integer, is_enabled boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    v.used,
    v.cap,
    greatest(v.cap - v.used, 0),
    v.enabled
  from (
    select
      (
        select count(*)::integer
        from public.listing_extractions e
        where e.user_id = auth.uid()
          and e.created_at >= (
            date_trunc('day', p_now at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
          )
      ) as used,
      s.daily_limit_per_user as cap,
      s.is_enabled as enabled
    from public.import_settings s
    where s.id
  ) v;
$fn$;

comment on function public.import_quota is
  'The calling account''s extractions today, the daily cap and what is left. Reads auth.uid() rather than taking an id, so nobody can ask about somebody else.';

-- ---------------------------------------------------------------------
-- claim_import_slot
--
-- Called before the model is, and the row it writes is the claim. Every
-- refusal is a named reason the interface turns into a Romanian
-- sentence; a refusal never says "try again" when trying again cannot
-- work.
--
-- service_role only. The whole point of a quota is that the party being
-- limited cannot reach the counter.
-- ---------------------------------------------------------------------
create or replace function public.claim_import_slot(
  p_user_id uuid,
  p_ip_hash text,
  p_source_type text,
  p_now timestamptz default now()
)
returns table (extraction_id uuid, allowed boolean, reason text, remaining integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.import_settings;
  v_day_start timestamptz;
  v_used integer;
  v_cap integer;
  v_spent numeric;
  v_id uuid;
begin
  if p_source_type is null or p_source_type not in ('link', 'photo') then
    return query select null::uuid, false, 'bad_request'::text, 0;
    return;
  end if;

  -- Somebody has to be counted. A call with neither is a bug in the
  -- caller, and answering it would be a free extraction.
  if p_user_id is null and (p_ip_hash is null or p_ip_hash = '') then
    return query select null::uuid, false, 'bad_request'::text, 0;
    return;
  end if;

  select * into s from public.import_settings where id;

  if not s.is_enabled then
    return query select null::uuid, false, 'disabled'::text, 0;
    return;
  end if;

  v_day_start := date_trunc('day', p_now at time zone 'Europe/Bucharest')
                 at time zone 'Europe/Bucharest';

  if p_user_id is not null then
    v_cap := s.daily_limit_per_user;
    select count(*)::integer into v_used
    from public.listing_extractions e
    where e.user_id = p_user_id and e.created_at >= v_day_start;
  else
    v_cap := s.daily_limit_per_ip;
    select count(*)::integer into v_used
    from public.listing_extractions e
    where e.ip_hash = p_ip_hash and e.created_at >= v_day_start;
  end if;

  if v_used >= v_cap then
    return query select null::uuid, false, 'daily_limit'::text, 0;
    return;
  end if;

  -- The budget is checked against what has already been spent, not what
  -- this call might cost: the cost is only known afterwards. A month can
  -- therefore end a few cents over, which is the correct trade against
  -- refusing somebody over an estimate.
  select spent_usd into v_spent from public.import_month_spend(p_now);
  if v_spent >= s.monthly_budget_usd then
    return query select null::uuid, false, 'budget'::text, 0;
    return;
  end if;

  insert into public.listing_extractions (user_id, ip_hash, source_type, status)
  values (p_user_id, case when p_user_id is null then p_ip_hash else null end, p_source_type, 'running')
  returning id into v_id;

  return query select v_id, true, null::text, greatest(v_cap - v_used - 1, 0);
end;
$fn$;

comment on function public.claim_import_slot is
  'Reserves one extraction and returns the row to complete, or a named refusal. Called before the model, never after: a limit checked after the spend is not a limit.';

-- ---------------------------------------------------------------------
-- finish_import
--
-- Completes the claimed row and, if this attempt took the month over a
-- threshold, tells the team once.
-- ---------------------------------------------------------------------
create or replace function public.finish_import(
  p_extraction_id uuid,
  p_status text,
  p_duration_ms integer default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_cost_usd numeric default 0,
  p_failure_reason text default null,
  p_source_host text default null,
  p_fields_kept integer default null,
  p_now timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.import_settings;
  v_before numeric;
  v_after numeric;
  v_threshold numeric;
begin
  if p_status not in ('ok', 'failed') then
    raise exception 'Stare necunoscută pentru o extragere: %', p_status using errcode = '22023';
  end if;

  select spent_usd into v_before from public.import_month_spend(p_now);

  update public.listing_extractions
  set status = p_status,
      duration_ms = p_duration_ms,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      cost_usd = coalesce(p_cost_usd, 0),
      failure_reason = case when p_status = 'failed' then coalesce(p_failure_reason, 'unknown') end,
      source_host = p_source_host,
      fields_kept = p_fields_kept
  where id = p_extraction_id;

  if not found then
    raise exception 'Extragerea % nu există', p_extraction_id using errcode = 'P0002';
  end if;

  select * into s from public.import_settings where id;
  if s.monthly_budget_usd = 0 then
    return;
  end if;

  select spent_usd into v_after from public.import_month_spend(p_now);
  v_threshold := s.monthly_budget_usd * s.alert_at_pct / 100.0;

  -- Two moments, each announced once a month: the warning line, and the
  -- budget itself. The dedupe key carries the month, so next month says
  -- it again.
  if v_before < v_threshold and v_after >= v_threshold then
    perform public.queue_import_budget_alert('warning', v_after, s.monthly_budget_usd, p_now);
  end if;
  if v_before < s.monthly_budget_usd and v_after >= s.monthly_budget_usd then
    perform public.queue_import_budget_alert('spent', v_after, s.monthly_budget_usd, p_now);
  end if;
end;
$fn$;

comment on function public.finish_import is
  'Completes a claimed extraction row and raises the budget alert when this attempt crossed a threshold.';

-- ---------------------------------------------------------------------
-- The budget alert
--
-- Straight into the outbox rather than through the notification
-- catalogue: that catalogue is a screen every account can see and switch
-- off, and this is an operational alert to the team about money. It is
-- not something a person should be able to mute for us.
-- ---------------------------------------------------------------------
create or replace function public.queue_import_budget_alert(
  p_kind text,
  p_spent numeric,
  p_budget numeric,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_month text := to_char(p_now at time zone 'Europe/Bucharest', 'YYYY-MM');
  v_payload jsonb;
  v_queued integer := 0;
  r record;
begin
  v_payload := jsonb_build_object(
    'kind', p_kind,
    'month', v_month,
    'spent_usd', round(p_spent, 2),
    'budget_usd', round(p_budget, 2),
    'link', '/admin/import'
  );

  -- platform_staff, not profiles: 20260916130000 dropped the column a
  -- user could set on their own row.
  for r in
    select st.user_id as id from public.platform_staff st where st.role = 'admin'
  loop
    insert into public.notification_outbox
      (channel, template, recipient_user_id, payload, dedupe_key)
    values
      ('inapp', 'import_budget_' || p_kind, r.id, v_payload,
       'import_budget:' || p_kind || ':' || v_month || ':inapp:' || r.id),
      ('email', 'import_budget_' || p_kind, r.id, v_payload,
       'import_budget:' || p_kind || ':' || v_month || ':email:' || r.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    v_queued := v_queued + 1;
  end loop;

  return v_queued;
end;
$fn$;

comment on function public.queue_import_budget_alert is
  'Tells every platform admin, once per month per threshold, that the extraction budget is running out.';

-- ---------------------------------------------------------------------
-- set_import_settings
-- ---------------------------------------------------------------------
create or replace function public.set_import_settings(
  p_is_enabled boolean,
  p_daily_limit_per_user integer,
  p_daily_limit_per_ip integer,
  p_monthly_budget_usd numeric,
  p_alert_at_pct integer,
  p_min_field_confidence numeric
)
returns public.import_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.import_settings;
  v_after public.import_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba limitele de import'
      using errcode = '42501';
  end if;

  select * into v_before from public.import_settings where id;

  update public.import_settings
  set is_enabled = p_is_enabled,
      daily_limit_per_user = p_daily_limit_per_user,
      daily_limit_per_ip = p_daily_limit_per_ip,
      monthly_budget_usd = p_monthly_budget_usd,
      alert_at_pct = p_alert_at_pct,
      min_field_confidence = p_min_field_confidence
  where id
  returning * into v_after;

  perform public.write_audit(
    'import_settings.update', 'import_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

comment on function public.set_import_settings is
  'Staff-only, audited. The check constraints on the table do the validation, so a bad number fails with the column''s own rule rather than a second copy of it here.';

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (20260916130300), so each
-- function is named to exactly the roles that call it.
-- ---------------------------------------------------------------------

-- The edge function, and nobody else. These three move the counter.
grant execute on function public.claim_import_slot(uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.finish_import(
  uuid, text, integer, integer, integer, numeric, text, text, integer, timestamptz
) to service_role;
grant execute on function public.queue_import_budget_alert(text, numeric, numeric, timestamptz)
  to service_role;

-- A person asking about their own allowance.
grant execute on function public.import_quota(timestamptz) to authenticated;

-- The budget check inside claim_import_slot runs as the definer, so this
-- one is only named to the edge function reporting a cost.
grant execute on function public.import_month_spend(timestamptz) to service_role;

-- The admin screen.
grant execute on function public.import_budget_status(timestamptz) to authenticated;

grant execute on function public.set_import_settings(
  boolean, integer, integer, numeric, integer, numeric
) to authenticated;
