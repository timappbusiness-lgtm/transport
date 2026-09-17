-- =====================================================================
-- Abonamente: what a plan costs, what it includes, and how a company asks
-- for one.
--
-- Three things this migration is careful about:
--
--   1. A discount is never stored. `plan_billing_periods` holds the total
--      for a period; "economisești 298 lei" is that total subtracted from
--      the monthly price times the months. A percentage in a column is a
--      number nobody can check against the price next to it.
--   2. There is one home for the trial length. `homepage_settings.trial_days`
--      (migration 20260917150000) moves to `pricing_settings`, because the
--      pricing page, the FAQ, the homepage and the trial that actually
--      starts at approval must all mean the same number.
--   3. Nothing here sells verification. A paid plan changes quotas; it
--      never changes `verification_status`, and no badge on the pricing
--      page resembles the verified one.
--
-- Payment is manual in this phase: a company asks, we invoice, staff
-- activate. `subscription_requests` is that conversation, and the row is
-- what /cont/abonament shows the company while it waits.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Who a plan is sold to
--
-- Nullable on purpose: `individual` is not sold on the pricing page at all
-- — it is what a fast personal account gets — so it has no audience rather
-- than a third enum value that would need a third tab nobody wants.
-- ---------------------------------------------------------------------
create type public.plan_audience as enum ('carrier', 'forwarder');

alter table public.plans
  add column audience public.plan_audience,
  add column short_description text
    check (short_description is null or length(short_description) <= 160),
  add column highlight boolean not null default false,
  add column features jsonb not null default '[]'::jsonb;

comment on column public.plans.audience is
  'Which tab of /abonamente shows this plan. NULL keeps it off the page entirely.';
comment on column public.plans.highlight is
  'The plan the page recommends for this audience. At most one per audience.';
comment on column public.plans.features is
  'What the card and the comparison table list: [{key, label, status}], status in (included, not_included, coming_soon). Display text, separate from the limits above, which the database enforces.';

-- At most one recommendation per audience. A page that recommends two
-- plans recommends neither.
create unique index plans_one_highlight_per_audience
  on public.plans (audience)
  where highlight and audience is not null;

-- Every feature entry has the three keys, and a status we know how to draw.
--
-- A CHECK cannot hold a subquery, and walking a JSON array needs one, so
-- the test lives in an immutable function. It touches no table, which is
-- what makes it safe to use in a constraint. Granted to nobody: the
-- constraint evaluates it as the system, and nothing else calls it.
create or replace function public.plan_features_valid(p_features jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select jsonb_typeof(p_features) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p_features) as f
       where jsonb_typeof(f) <> 'object'
          or f->>'key' is null
          or f->>'label' is null
          or coalesce(f->>'status', '') not in ('included', 'not_included', 'coming_soon')
     );
$fn$;

alter table public.plans
  add constraint plans_features_shape_ck check (public.plan_features_valid(features));

-- ---------------------------------------------------------------------
-- What a period costs
--
-- The total, never the discount. `months` is small and closed because the
-- page has a control with three positions, not a free-text field.
-- ---------------------------------------------------------------------
create table public.plan_billing_periods (
  plan_code text not null references public.plans (code) on delete cascade,
  months integer not null check (months in (1, 6, 12)),
  total_price_ron numeric(8,2) not null check (total_price_ron >= 0),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_code, months)
);

comment on table public.plan_billing_periods is
  'The total for a plan over a period. Savings are computed from this and the monthly price; a percentage is never stored.';

create trigger plan_billing_periods_set_updated_at
  before update on public.plan_billing_periods
  for each row execute function public.set_updated_at();

alter table public.plan_billing_periods enable row level security;

create policy "plan_periods_select_public" on public.plan_billing_periods
  for select to authenticated, anon
  using (
    (is_public and exists (
      select 1 from public.plans p where p.code = plan_code and p.is_public
    ))
    or public.is_platform_admin()
  );

-- No insert/update/delete policy: the audited RPC below is the only way in.

-- ---------------------------------------------------------------------
-- The settings the pricing page reads
-- ---------------------------------------------------------------------
create table public.pricing_settings (
  id boolean primary key default true check (id),
  updated_at timestamptz not null default now(),
  trial_days integer not null default 30 check (trial_days between 0 and 365),
  -- NULL says nothing about VAT rather than guessing, which is the honest
  -- state until the accountant confirms which sentence is true.
  vat_label text check (vat_label is null or length(btrim(vat_label)) between 3 and 120),
  manual_billing boolean not null default true,
  billing_contact_email text
);

comment on table public.pricing_settings is
  'One row. What /abonamente says about the trial, VAT and how billing works.';

insert into public.pricing_settings (id, trial_days, vat_label, manual_billing)
values (true, 30, 'Prețurile nu includ TVA', true);

create trigger pricing_settings_set_updated_at
  before update on public.pricing_settings
  for each row execute function public.set_updated_at();

alter table public.pricing_settings enable row level security;

create policy "pricing_settings_select_all" on public.pricing_settings
  for select to authenticated, anon using (true);

-- The trial length had two homes for one migration. This is the one that
-- stays, because it is the one the trial itself reads at approval.
alter table public.homepage_settings drop column trial_days;

drop function if exists public.set_directory_settings(integer, integer, integer);

create or replace function public.set_directory_settings(
  p_stats_min_companies integer,
  p_directory_min_companies integer
)
returns public.homepage_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.homepage_settings;
  v_after public.homepage_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica pragurile de afișare' using errcode = '42501';
  end if;

  if p_stats_min_companies is null or p_stats_min_companies < 1
     or p_directory_min_companies is null or p_directory_min_companies < 1 then
    raise exception 'Pragurile trebuie să fie cel puțin 1' using errcode = '22023';
  end if;

  select * into v_before from public.homepage_settings where id;

  update public.homepage_settings
  set stats_min_companies = p_stats_min_companies,
      directory_min_companies = p_directory_min_companies
  where id
  returning * into v_after;

  perform public.write_audit(
    'homepage_settings.updated', 'homepage_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), 'Praguri pentru lista de firme'
  );

  return v_after;
end;
$fn$;

create or replace function public.set_pricing_settings(
  p_trial_days integer,
  p_vat_label text,
  p_manual_billing boolean,
  p_billing_contact_email text
)
returns public.pricing_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.pricing_settings;
  v_after public.pricing_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica setările de facturare' using errcode = '42501';
  end if;

  if p_trial_days is null or p_trial_days < 0 or p_trial_days > 365 then
    raise exception 'Perioada gratuită trebuie să fie între 0 și 365 de zile' using errcode = '22023';
  end if;

  select * into v_before from public.pricing_settings where id;

  update public.pricing_settings
  set trial_days = p_trial_days,
      -- An empty box means "say nothing about VAT", not an empty sentence.
      vat_label = nullif(btrim(coalesce(p_vat_label, '')), ''),
      manual_billing = coalesce(p_manual_billing, true),
      billing_contact_email = nullif(btrim(coalesce(p_billing_contact_email, '')), '')
  where id
  returning * into v_after;

  perform public.write_audit(
    'pricing_settings.updated', 'pricing_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), 'Setări de facturare'
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Editing a plan
--
-- `set_plan` gains the columns the pricing page needs. The old signature
-- is dropped rather than kept alongside: two ways to write a price is one
-- too many, and the four-argument version could silently clear `features`.
-- ---------------------------------------------------------------------
drop function if exists public.set_plan(text, numeric, boolean, text[]);

-- display_features was a flat list of strings (migration 20260917150000).
-- It becomes the same list with a status, so the comparison table can draw
-- a dash and an "în curând" as well as a check.
update public.plans p
set features = coalesce((
  select jsonb_agg(jsonb_build_object(
    'key', 'f' || ordinality,
    'label', label,
    'status', 'included'
  ) order by ordinality)
  from unnest(p.display_features) with ordinality as t(label, ordinality)
), '[]'::jsonb)
where p.display_features is not null and array_length(p.display_features, 1) > 0;

alter table public.plans drop column display_features;

create or replace function public.set_plan(
  p_code text,
  p_name text,
  p_short_description text,
  p_audience public.plan_audience,
  p_price_ron_month numeric,
  p_is_public boolean,
  p_highlight boolean,
  p_features jsonb
)
returns public.plans
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.plans;
  v_after public.plans;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica planurile' using errcode = '42501';
  end if;

  if p_price_ron_month is null or p_price_ron_month < 0 then
    raise exception 'Prețul trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Planul are nevoie de un nume' using errcode = '22023';
  end if;

  select * into v_before from public.plans where code = p_code;
  if v_before.code is null then
    raise exception 'Planul nu există' using errcode = 'P0002';
  end if;

  -- One recommendation per audience. Rather than refusing the second one
  -- and making the admin clear the first, the new one wins and the old one
  -- steps down — which is what "recomandat" means when you tick it.
  if p_highlight and p_audience is not null then
    update public.plans
    set highlight = false
    where audience = p_audience and highlight and code <> p_code;
  end if;

  update public.plans
  set name = btrim(p_name),
      short_description = nullif(btrim(coalesce(p_short_description, '')), ''),
      audience = p_audience,
      price_ron_month = p_price_ron_month,
      is_public = p_is_public,
      highlight = coalesce(p_highlight, false) and p_audience is not null,
      features = coalesce(p_features, '[]'::jsonb)
  where code = p_code
  returning * into v_after;

  perform public.write_audit(
    'plan.updated', 'plans', null, to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

create or replace function public.set_plan_period(
  p_code text,
  p_months integer,
  p_total_price_ron numeric,
  p_is_public boolean
)
returns public.plan_billing_periods
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.plan_billing_periods;
  v_after public.plan_billing_periods;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica perioadele de facturare' using errcode = '42501';
  end if;

  if p_months not in (1, 6, 12) then
    raise exception 'Perioada poate fi 1, 6 sau 12 luni' using errcode = '22023';
  end if;

  if p_total_price_ron is null or p_total_price_ron < 0 then
    raise exception 'Totalul trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  -- A period that costs more than paying monthly is not a longer commitment,
  -- it is a mistake in a form. Equal is allowed: a plan may simply not
  -- discount the longer period.
  if exists (
    select 1 from public.plans p
    where p.code = p_code and p_total_price_ron > p.price_ron_month * p_months
  ) then
    raise exception 'Totalul pe % luni nu poate depăși plata lunară înmulțită cu %', p_months, p_months
      using errcode = '22023';
  end if;

  select * into v_before from public.plan_billing_periods
  where plan_code = p_code and months = p_months;

  insert into public.plan_billing_periods (plan_code, months, total_price_ron, is_public)
  values (p_code, p_months, p_total_price_ron, coalesce(p_is_public, true))
  on conflict (plan_code, months) do update
  set total_price_ron = excluded.total_price_ron,
      is_public = excluded.is_public
  returning * into v_after;

  perform public.write_audit(
    'plan_period.updated', 'plan_billing_periods', null,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Asking for a plan
--
-- Payment is manual in this phase, so the button on /abonamente does not
-- charge anything: it starts a conversation. The row is what the company
-- sees while it waits and what the staff screen works through.
-- ---------------------------------------------------------------------
create type public.subscription_request_status as enum
  ('new', 'contacted', 'activated', 'rejected');

create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_code text not null references public.plans (code),
  months integer not null check (months in (1, 6, 12)),
  status public.subscription_request_status not null default 'new',
  requested_by uuid not null references public.profiles (id) on delete cascade,
  notes text check (notes is null or length(notes) <= 500),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  decision_reason text
);

comment on table public.subscription_requests is
  'A company asking for a plan while billing is manual. Never a payment: staff invoice and activate.';

create index subscription_requests_company_idx
  on public.subscription_requests (company_id, created_at desc);

-- One open request per company. A second one is a double click or an
-- impatient second thought, and either way the answer is the first one.
create unique index subscription_requests_one_open
  on public.subscription_requests (company_id)
  where status in ('new', 'contacted');

create trigger subscription_requests_set_updated_at
  before update on public.subscription_requests
  for each row execute function public.set_updated_at();

alter table public.subscription_requests enable row level security;

-- A manager reads their own company's requests. Nobody writes through
-- PostgREST at all: every transition is an audited RPC below.
create policy "subscription_requests_select_own" on public.subscription_requests
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

create or replace function public.request_subscription(
  p_company_id uuid,
  p_plan_code text,
  p_months integer,
  p_notes text default null
)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company public.companies;
  v_plan public.plans;
  v_period public.plan_billing_periods;
  v_settings public.pricing_settings;
  v_row public.subscription_requests;
begin
  if not public.is_company_manager(p_company_id) then
    raise exception 'Doar administratorii firmei pot cere un abonament' using errcode = '42501';
  end if;

  select * into v_company from public.companies where id = p_company_id;
  if v_company.id is null then
    raise exception 'Firma nu există' using errcode = 'P0002';
  end if;

  select * into v_plan from public.plans where code = p_plan_code and is_public;
  if v_plan.code is null then
    raise exception 'Planul nu există sau nu este disponibil' using errcode = 'P0002';
  end if;

  select * into v_period from public.plan_billing_periods
  where plan_code = p_plan_code and months = p_months and is_public;
  if v_period.plan_code is null then
    raise exception 'Perioada de facturare nu este disponibilă pentru acest plan' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.subscription_requests
    where company_id = p_company_id and status in ('new', 'contacted')
  ) then
    raise exception 'Ai deja o cerere în lucru. Te contactăm în legătură cu ea.' using errcode = '23505';
  end if;

  insert into public.subscription_requests
    (company_id, plan_code, months, requested_by, notes)
  values
    (p_company_id, p_plan_code, p_months, auth.uid(),
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_row;

  perform public.write_audit(
    'subscription_request.created', 'subscription_requests', v_row.id,
    null, to_jsonb(v_row), null
  );

  select * into v_settings from public.pricing_settings where id;

  -- Two e-mails: one so the team knows to invoice, one so the company has
  -- the request in writing. The team's address is a setting because it is
  -- a person's inbox and people change.
  if v_settings.billing_contact_email is not null then
    insert into public.notification_outbox
      (channel, template, recipient_company_id, to_email, payload, dedupe_key)
    values (
      'email', 'subscription_request_staff', p_company_id, v_settings.billing_contact_email,
      jsonb_build_object(
        'legal_name', v_company.legal_name,
        'cui', v_company.cui,
        'plan', v_plan.name,
        'months', p_months,
        'total_price_ron', v_period.total_price_ron
      ),
      format('subscription_request_staff:%s', v_row.id)
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  values (
    'email', 'subscription_request_received', p_company_id, v_company.contact_email,
    jsonb_build_object(
      'legal_name', v_company.legal_name,
      'plan', v_plan.name,
      'months', p_months,
      'total_price_ron', v_period.total_price_ron
    ),
    format('subscription_request_received:%s', v_row.id)
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Working the queue
--
-- Three transitions, each audited. Activation is the only one that touches
-- `subscriptions`, and it updates the company's existing row rather than
-- inserting a second: `subscriptions_active_company` allows one live
-- subscription per company, which is the rule the quotas read.
-- ---------------------------------------------------------------------
create or replace function public.mark_subscription_request_contacted(p_id uuid)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.subscription_requests;
  v_after public.subscription_requests;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate lucra cererile de abonament' using errcode = '42501';
  end if;

  select * into v_before from public.subscription_requests where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if v_before.status <> 'new' then
    raise exception 'Cererea nu mai este nouă' using errcode = '42501';
  end if;

  update public.subscription_requests
  set status = 'contacted', handled_at = now(), handled_by = auth.uid()
  where id = p_id
  returning * into v_after;

  perform public.write_audit(
    'subscription_request.contacted', 'subscription_requests', p_id,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

create or replace function public.activate_subscription_request(p_id uuid)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.subscription_requests;
  v_after public.subscription_requests;
  v_sub_before public.subscriptions;
  v_sub_after public.subscriptions;
  v_company public.companies;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate activa un abonament' using errcode = '42501';
  end if;

  select * into v_before from public.subscription_requests where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if v_before.status not in ('new', 'contacted') then
    raise exception 'Cererea a fost deja închisă' using errcode = '42501';
  end if;

  select * into v_company from public.companies where id = v_before.company_id;
  if v_company.verification_status <> 'verified' or v_company.is_suspended then
    raise exception 'Firma trebuie să fie verificată și nesuspendată' using errcode = '42501';
  end if;

  select * into v_sub_before from public.subscriptions
  where company_id = v_before.company_id
    and status in ('trialing', 'active', 'past_due');

  if v_sub_before.id is null then
    insert into public.subscriptions
      (company_id, plan_code, status, current_period_start, current_period_end, provider)
    values
      (v_before.company_id, v_before.plan_code, 'active', now(),
       now() + (v_before.months || ' months')::interval, 'manual')
    returning * into v_sub_after;
  else
    update public.subscriptions
    set plan_code = v_before.plan_code,
        status = 'active',
        current_period_start = now(),
        current_period_end = now() + (v_before.months || ' months')::interval,
        cancel_at_period_end = false,
        provider = 'manual'
    where id = v_sub_before.id
    returning * into v_sub_after;
  end if;

  update public.subscription_requests
  set status = 'activated', handled_at = now(), handled_by = auth.uid()
  where id = p_id
  returning * into v_after;

  perform public.write_audit(
    'subscription.activated', 'subscriptions', v_sub_after.id,
    to_jsonb(v_sub_before), to_jsonb(v_sub_after), null
  );
  perform public.write_audit(
    'subscription_request.activated', 'subscription_requests', p_id,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  values (
    'email', 'subscription_activated', v_before.company_id, v_company.contact_email,
    jsonb_build_object(
      'legal_name', v_company.legal_name,
      'plan_code', v_before.plan_code,
      'months', v_before.months,
      'period_end', v_sub_after.current_period_end
    ),
    format('subscription_activated:%s', p_id)
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_after;
end;
$fn$;

create or replace function public.reject_subscription_request(
  p_id uuid,
  p_reason text
)
returns public.subscription_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.subscription_requests;
  v_after public.subscription_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate închide cererile de abonament' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Respingerea are nevoie de un motiv' using errcode = '22023';
  end if;

  select * into v_before from public.subscription_requests where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if v_before.status not in ('new', 'contacted') then
    raise exception 'Cererea a fost deja închisă' using errcode = '42501';
  end if;

  update public.subscription_requests
  set status = 'rejected', handled_at = now(), handled_by = auth.uid(),
      decision_reason = v_reason
  where id = p_id
  returning * into v_after;

  perform public.write_audit(
    'subscription_request.rejected', 'subscription_requests', p_id,
    to_jsonb(v_before), to_jsonb(v_after), v_reason
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The trial starts when the firm is approved, not when it signs up
--
-- That is what the homepage and the pricing page both promise, and until
-- now nothing made it true. Same function as migration 20260917140000,
-- with the trial added on approval: the recommended plan for the company's
-- audience, for `pricing_settings.trial_days`, and only if the company has
-- no live subscription already.
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
  v_trial_days integer;
  v_plan_code text;
  v_sub public.subscriptions;
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

  if p_approve then
    select trial_days into v_trial_days from public.pricing_settings where id;

    -- The recommended plan for what this company does. A firm that is both
    -- is a carrier for this purpose, because that is the plan with the
    -- routes on it.
    select code into v_plan_code
    from public.plans
    where highlight
      and audience = (case when v_after.company_type = 'expeditie' then 'forwarder' else 'carrier' end)
                       ::public.plan_audience
    limit 1;

    select * into v_sub from public.subscriptions
    where company_id = p_company_id and status in ('trialing', 'active', 'past_due');

    if coalesce(v_trial_days, 0) > 0 and v_plan_code is not null and v_sub.id is null then
      insert into public.subscriptions
        (company_id, plan_code, status, current_period_start, current_period_end, provider)
      values
        (p_company_id, v_plan_code, 'trialing', now(),
         now() + (v_trial_days || ' days')::interval, 'trial')
      returning * into v_sub;

      perform public.write_audit(
        'subscription.trial_started', 'subscriptions', v_sub.id,
        null, to_jsonb(v_sub), format('Perioadă gratuită de %s zile', v_trial_days)
      );
    end if;
  end if;

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
      'reason', v_reason,
      'trial_ends_at', case when p_approve then v_sub.current_period_end else null end
    ),
    format('company_review:%s:%s', p_company_id, v_after.verification_status)
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Starting values
--
-- TO BE CONFIRMED: these prices, period totals and feature lists are the
-- team's starting point, not a decision. They are editable from
-- /admin/planuri without a deploy, and every change leaves a row in
-- audit_log. The limits are unchanged — they come from docs/05-pricing.md
-- and the quota code already reads them.
-- ---------------------------------------------------------------------
update public.plans set audience = 'carrier', sort_order = 1,
  short_description = 'Pentru firmele care încep și vor să vadă cum arată cererile.',
  features = jsonb_build_array(
    jsonb_build_object('key', 'board',     'label', 'Acces la cereri și trasee',            'status', 'included'),
    jsonb_build_object('key', 'docs',      'label', 'Evidența documentelor firmei',          'status', 'included'),
    jsonb_build_object('key', 'expiry',    'label', 'Notificare înainte să expire un document', 'status', 'included'),
    jsonb_build_object('key', 'alerts',    'label', 'Alerte pe e-mail pentru cereri noi',    'status', 'not_included'),
    jsonb_build_object('key', 'directory', 'label', 'Profil în lista publică de firme',      'status', 'not_included'),
    jsonb_build_object('key', 'promoted',  'label', 'Anunțuri promovate',                    'status', 'coming_soon')
  )
where code = 'free';

update public.plans set audience = 'carrier', highlight = true, sort_order = 2,
  name = 'Transportator',
  short_description = 'Pentru firmele de transport care lucrează pe tur și pe retur.',
  features = jsonb_build_array(
    jsonb_build_object('key', 'board',     'label', 'Acces la cereri și trasee',             'status', 'included'),
    jsonb_build_object('key', 'contacts',  'label', 'Contacte nelimitate',                   'status', 'included'),
    jsonb_build_object('key', 'routes',    'label', 'Publicare nelimitată pe tur și pe retur', 'status', 'included'),
    jsonb_build_object('key', 'alerts',    'label', 'Alerte pe e-mail pentru cereri de pe traseele tale', 'status', 'included'),
    jsonb_build_object('key', 'docs',      'label', 'Evidența documentelor firmei și ale vehiculelor', 'status', 'included'),
    jsonb_build_object('key', 'directory', 'label', 'Profil în lista publică de firme',      'status', 'included'),
    jsonb_build_object('key', 'promoted',  'label', 'Anunțuri promovate',                    'status', 'coming_soon')
  )
where code = 'carrier';

update public.plans set audience = 'carrier', sort_order = 3,
  name = 'Flotă',
  short_description = 'Pentru flote mari și grupuri de firme, cu mai mulți dispeceri.',
  features = jsonb_build_array(
    jsonb_build_object('key', 'board',     'label', 'Acces la cereri și trasee',             'status', 'included'),
    jsonb_build_object('key', 'contacts',  'label', 'Contacte nelimitate',                   'status', 'included'),
    jsonb_build_object('key', 'routes',    'label', 'Publicare nelimitată pe tur și pe retur', 'status', 'included'),
    jsonb_build_object('key', 'alerts',    'label', 'Alerte pe e-mail pentru cereri de pe traseele tale', 'status', 'included'),
    jsonb_build_object('key', 'seats',     'label', 'Dispeceri nelimitați în contul firmei', 'status', 'included'),
    jsonb_build_object('key', 'directory', 'label', 'Profil în lista publică de firme',      'status', 'included'),
    jsonb_build_object('key', 'support',   'label', 'Suport prioritar',                      'status', 'coming_soon')
  )
where code = 'business';

update public.plans set audience = 'forwarder', highlight = true, sort_order = 1,
  name = 'Casă de expediții',
  short_description = 'Pentru casele de expediții care trimit curse către transportatori verificați.',
  features = jsonb_build_array(
    jsonb_build_object('key', 'board',     'label', 'Acces la cereri și trasee',             'status', 'included'),
    jsonb_build_object('key', 'post',      'label', 'Publicare nelimitată de curse',         'status', 'included'),
    jsonb_build_object('key', 'contacts',  'label', 'Contacte nelimitate',                   'status', 'included'),
    jsonb_build_object('key', 'seats',     'label', 'Mai mulți dispeceri în același cont',   'status', 'included'),
    jsonb_build_object('key', 'docs',      'label', 'Vezi documentele fiecărui ofertant',    'status', 'included'),
    jsonb_build_object('key', 'promoted',  'label', 'Anunțuri promovate',                    'status', 'coming_soon')
  )
where code = 'forwarder';

-- `individual` stays off the pricing page: it is what a personal account
-- gets, not something anybody buys.
update public.plans set audience = null, highlight = false where code = 'individual';

insert into public.plan_billing_periods (plan_code, months, total_price_ron) values
  ('free',      1,  0),
  ('carrier',   1,  149),
  ('carrier',   6,  804),
  ('carrier',   12, 1490),
  ('business',  1,  449),
  ('business',  6,  2424),
  ('business',  12, 4490),
  ('forwarder', 1,  249),
  ('forwarder', 6,  1344),
  ('forwarder', 12, 2490)
on conflict (plan_code, months) do nothing;

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (migration 20260916130300),
-- so each function is granted to exactly the roles that call it.
-- ---------------------------------------------------------------------
grant execute on function public.set_directory_settings(integer, integer) to authenticated;
grant execute on function public.set_pricing_settings(integer, text, boolean, text) to authenticated;
grant execute on function public.set_plan(text, text, text, public.plan_audience, numeric, boolean, boolean, jsonb) to authenticated;
grant execute on function public.set_plan_period(text, integer, numeric, boolean) to authenticated;
grant execute on function public.request_subscription(uuid, text, integer, text) to authenticated;
grant execute on function public.mark_subscription_request_contacted(uuid) to authenticated;
grant execute on function public.activate_subscription_request(uuid) to authenticated;
grant execute on function public.reject_subscription_request(uuid, text) to authenticated;
