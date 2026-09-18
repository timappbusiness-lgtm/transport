-- =====================================================================
-- 0026 - Ștergerea contului: cerere, perioadă de grație, anonimizare
--
-- The right to erasure, built the way the rest of this schema is built:
-- the rules live in Postgres, the screens are a convenience.
--
-- Three things this file is careful about.
--
-- 1. **Blocked is a state, not an error.** Somebody who is the sole owner
--    of a firm with four other people in it, or who is halfway through a
--    transport, cannot have their account removed today — and telling
--    them that in a toast they can dismiss loses the request. So the
--    request is stored with `status = 'blocked'` and the sentence that
--    explains it, and it is re-checked the moment the obstacle could have
--    gone away.
--
-- 2. **Erasure is not always deletion.** A firm that has carried even one
--    transport cannot be removed: `transports.carrier_company_id` is
--    `on delete restrict` precisely so that a finished job keeps its two
--    ends. The firm is therefore *anonymised* — the row stays as a shell
--    with no identity, no contact details and no documents, and the
--    transports, invoices and audit entries that point at it keep
--    pointing somewhere. A person is different: an `auth.users` row can
--    go, and it does, last.
--
-- 3. **The grace period has to bite.** A deletion that leaves the account
--    posting for two weeks is not a deletion that was requested. So the
--    account is held: its listings come off the board and a trigger
--    refuses to put them back — including refusing the nightly compliance
--    sweep, which restores suspended listings row by row and swallows the
--    refusal without failing.
--
-- The cancel link in the e-mail carries a token rather than requiring a
-- login, because the account it would log into is the one we just held.
-- The token only ever cancels; every destructive direction needs a
-- session.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create table public.deletion_settings (
  id boolean primary key default true check (id),
  updated_at timestamptz not null default now(),

  grace_days integer not null default 14 check (grace_days between 0 and 90),
  -- Where somebody writes when the screen cannot help them. Null is a
  -- normal value: the page then points at the contact form instead of
  -- building a mailto for an address that may not exist.
  support_email text,

  export_valid_hours integer not null default 24 check (export_valid_hours between 1 and 168),
  export_per_day integer not null default 1 check (export_per_day between 1 and 20)
);

comment on table public.deletion_settings is
  'One row. How long the grace period lasts, where support is reached, and how long an export link lives.';

insert into public.deletion_settings (id) values (true) on conflict do nothing;

alter table public.deletion_settings enable row level security;

-- Readable by anyone signed in: the settings screen has to say "14 zile"
-- and the number has to be the real one.
create policy "deletion_settings_read" on public.deletion_settings
  for select to authenticated using (true);

revoke all on public.deletion_settings from anon, authenticated;
grant select on public.deletion_settings to authenticated;

-- ---------------------------------------------------------------------
-- The request itself
-- ---------------------------------------------------------------------
create type public.account_deletion_kind as enum ('user', 'company');
create type public.account_deletion_status as enum
  ('requested', 'blocked', 'scheduled', 'completed', 'cancelled');

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Nullable, and not because it is optional: a completed personal
  -- erasure deletes the `auth.users` row, the FK below sets this to null,
  -- and what is left is a record that an erasure happened on a date with
  -- nobody's identifier in it. That is the point.
  user_id uuid references public.profiles (id) on delete set null,
  -- Set for a firm deletion, and also for a personal one that takes a
  -- one-person firm with it.
  company_id uuid references public.companies (id) on delete set null,
  kind public.account_deletion_kind not null,
  status public.account_deletion_status not null default 'requested',

  reason_blocked text,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- The staff member who ran it, when it was not the person themselves.
  processed_by uuid references public.profiles (id) on delete set null,
  staff_reason text,

  -- Claimed by the job, so two overlapping runs cannot process one row.
  processing_started_at timestamptz,

  -- In the "anulează ștergerea" link. Only ever cancels; the account it
  -- would otherwise have to log into is the one being held.
  cancel_token uuid not null default gen_random_uuid(),

  constraint account_deletion_company_ck
    check (kind <> 'company' or company_id is not null),
  constraint account_deletion_staff_ck
    check (processed_by is null or nullif(trim(staff_reason), '') is not null),
  constraint account_deletion_user_ck
    check (status = 'completed' or user_id is not null)
);

comment on table public.account_deletion_requests is
  'One row per erasure request. Blocked is a state with a sentence, not a failed call. Written only by the RPCs below.';
comment on column public.account_deletion_requests.cancel_token is
  'Bearer token for the cancel link in the e-mail. Cancelling is the safe direction; every destructive one needs a session.';
comment on column public.account_deletion_requests.company_id is
  'The firm being erased, or the one-person firm that goes with a personal account.';

-- A person has at most one open personal request, a firm at most one.
create unique index account_deletion_one_open_user
  on public.account_deletion_requests (user_id)
  where kind = 'user' and status in ('requested', 'blocked', 'scheduled');
create unique index account_deletion_one_open_company
  on public.account_deletion_requests (company_id)
  where kind = 'company' and status in ('requested', 'blocked', 'scheduled');
create index account_deletion_due_idx
  on public.account_deletion_requests (scheduled_for)
  where status = 'scheduled';
create index account_deletion_token_idx
  on public.account_deletion_requests (cancel_token)
  where status = 'scheduled';

create trigger account_deletion_requests_set_updated_at
  before update on public.account_deletion_requests
  for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_select_own_or_staff" on public.account_deletion_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or (company_id is not null and public.is_company_manager(company_id))
    or public.is_platform_admin()
  );

-- No write privilege for anybody: the RPCs below are the only door.
revoke all on public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_requests to authenticated;

-- ---------------------------------------------------------------------
-- Holding an account
--
-- `deletion_scheduled_at` is deliberately not `is_suspended`. Suspension
-- belongs to the compliance sweep, which reactivates whatever it
-- suspended as soon as the documents are in order — and would therefore
-- undo this hold every night at two in the morning.
-- ---------------------------------------------------------------------
alter table public.profiles add column deletion_scheduled_at timestamptz;
alter table public.companies add column deletion_scheduled_at timestamptz;
alter table public.companies add column anonymised_at timestamptz;

comment on column public.profiles.deletion_scheduled_at is
  'Set while an erasure request is in its grace period. Nothing can be published from a held account.';
comment on column public.companies.anonymised_at is
  'When the firm was reduced to a shell: no identity, no contact details, no documents. The row stays so transports and invoices keep both ends.';

/**
 * The hold is not something an account can lift for itself.
 *
 * `companies` and `profiles` are both writable by their own people
 * through PostgREST — that is the point of the profile screens — so a new
 * column on either is a new column somebody can set. Clearing
 * `deletion_scheduled_at` from the browser would put a held account back
 * on the board for the fortnight it is supposed to be off it, so both
 * columns are added to the guards that already exist for exactly this.
 *
 * Checked before the staff exemption, unlike every other field here:
 * staff have `cancel_account_deletion` and do not need the column.
 */
create or replace function public.guard_profile_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.deletion_scheduled_at is distinct from old.deletion_scheduled_at then
    raise exception 'Ștergerea contului se pornește și se anulează doar din pagina Date personale'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.phone_verified is distinct from old.phone_verified
     or new.account_type is distinct from old.account_type
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Câmpul nu poate fi modificat din cont (telefon confirmat, e-mail, tip de cont)'
      using errcode = '42501';
  end if;

  if new.phone is distinct from old.phone then
    new.phone_verified := false;
  end if;
  return new;
end;
$fn$;

create or replace function public.guard_company_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.deletion_scheduled_at is distinct from old.deletion_scheduled_at
     or new.anonymised_at is distinct from old.anonymised_at then
    raise exception 'Ștergerea firmei se pornește și se anulează doar din pagina Date personale'
      using errcode = '42501';
  end if;

  if public.is_platform_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.slug is distinct from old.slug
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
     or new.anaf_is_inactive is distinct from old.anaf_is_inactive
     or new.profile_updated_at is distinct from old.profile_updated_at then
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
-- Nothing goes on the board from a held account
--
-- A trigger rather than a line in each publishing RPC: there are four of
-- those today and the fifth is the one that would forget. It also
-- happens to be what stops the nightly sweep from undoing the hold — the
-- sweep restores suspended listings row by row inside a `begin ... except
-- when others then null`, so a refusal here leaves that one listing off
-- the board and the rest of the sweep alone.
-- ---------------------------------------------------------------------
create or replace function public.account_is_held_for_deletion(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.companies c
    where c.id = p_company_id and c.deletion_scheduled_at is not null
  ) or exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.deletion_scheduled_at is not null
  );
$fn$;

comment on function public.account_is_held_for_deletion(uuid, uuid) is
  'Whether a listing''s firm or poster is inside a deletion grace period. Internal — the listing guards are its callers.';

create or replace function public.guard_listing_deletion_hold()
returns trigger
language plpgsql
-- Definer: it asks `account_is_held_for_deletion`, which is granted to
-- nobody on purpose. A browser that could call that could ask whether any
-- firm on the platform is on its way out.
security definer
set search_path = public
as $fn$
begin
  if new.status not in ('active', 'offers_received') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;
  if public.account_is_held_for_deletion(new.company_id, new.posted_by) then
    raise exception 'Contul este programat pentru ștergere. Anulează ștergerea ca să publici din nou.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

/**
 * A `before delete` trigger that returns `new` returns null, and a null
 * from a before-delete cancels the delete without a word.
 *
 * `guard_member_write` has had that line since migration 20260916140000.
 * Nothing noticed, because until this file nothing ever deleted a
 * membership from inside the database — the guard's own rule (an owner is
 * removed by transferring ownership, not by deletion) meant every caller
 * was an API role, and API roles take the branch below instead.
 *
 * `anonymise_company` is the first caller that is neither, and a firm
 * reduced to a shell that quietly keeps its members is not a firm anybody
 * has erased. The rule itself is unchanged: from a browser, an owner
 * still cannot be removed.
 */
create or replace function public.guard_member_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
       or new.user_id is distinct from old.user_id
       or new.invited_by is distinct from old.invited_by then
      raise exception 'Un membru nu poate fi mutat' using errcode = '42501';
    end if;
    if (old.role = 'owner') <> (new.role = 'owner') then
      raise exception 'Rolul de proprietar se schimbă doar prin transferul proprietății' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.role = 'owner' then
    raise exception 'Proprietarul nu poate fi eliminat; transferă mai întâi proprietatea' using errcode = '42501';
  end if;
  return old;
end;
$fn$;

create trigger cargo_listings_deletion_hold
  before insert or update on public.cargo_listings
  for each row execute function public.guard_listing_deletion_hold();

create trigger truck_listings_deletion_hold
  before insert or update on public.truck_listings
  for each row execute function public.guard_listing_deletion_hold();

-- ---------------------------------------------------------------------
-- Why it cannot happen yet
--
-- Two rules, both about somebody other than the person asking.
--
--   * A firm left without an owner is a firm whose four dispatchers can
--     no longer be paid, invited or removed. Transfer the role first.
--   * A transport that is agreed, loading, in transit, delivered,
--     invoiced or disputed has a counterparty who is owed something.
--     Closed and cancelled are the two endings.
--
-- Returned as sentences rather than codes: they are shown to the person
-- as they are, and a code would only be turned back into this text
-- somewhere the database could not check it.
-- ---------------------------------------------------------------------
create or replace function public.account_deletion_blockers(
  p_user_id uuid,
  p_kind public.account_deletion_kind,
  p_company_id uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out text[] := '{}';
  v_n integer;
  r record;
begin
  if p_kind = 'company' then
    select count(*) into v_n
    from public.transports t
    where (t.carrier_company_id = p_company_id or t.shipper_company_id = p_company_id)
      and t.status not in ('closed', 'cancelled');
    if v_n > 0 then
      v_out := v_out || format(
        'Firma are %s. Închide-le sau anulează-le înainte de ștergere.',
        case when v_n = 1 then 'un transport nefinalizat'
             else format('%s transporturi nefinalizate', v_n) end);
    end if;
    return v_out;
  end if;

  -- Personal account. Every firm they own is looked at: the ones with
  -- other people in them block, the one-person ones come along and bring
  -- their own obstacles with them.
  for r in
    select c.id,
           coalesce(nullif(c.display_name, ''), c.legal_name) as name,
           (select count(*) from public.company_members m
             where m.company_id = c.id and m.role = 'owner') as owners,
           (select count(*) from public.company_members m
             where m.company_id = c.id and m.user_id <> p_user_id) as others
    from public.companies c
    join public.company_members cm on cm.company_id = c.id
    where cm.user_id = p_user_id and cm.role = 'owner'
  loop
    if r.owners = 1 and r.others > 0 then
      v_out := v_out || format(
        'Ești singurul proprietar al firmei %s, care mai are %s. Transferă rolul de proprietar sau elimină membrii înainte de ștergere.',
        r.name,
        case when r.others = 1 then 'un membru'
             else format('%s membri', r.others) end);
    elsif r.owners = 1 then
      v_out := v_out || public.account_deletion_blockers(p_user_id, 'company', r.id);
    end if;
  end loop;

  select count(*) into v_n
  from public.transports t
  where t.shipper_user_id = p_user_id
    and t.status not in ('closed', 'cancelled');
  if v_n > 0 then
    v_out := v_out || format(
      'Ai %s. Închide-le sau anulează-le înainte de ștergere.',
      case when v_n = 1 then 'un transport nefinalizat'
           else format('%s transporturi nefinalizate', v_n) end);
  end if;

  return v_out;
end;
$fn$;

comment on function public.account_deletion_blockers(uuid, public.account_deletion_kind, uuid) is
  'What stands in the way of an erasure, in Romanian, as sentences shown to the person. Internal — request_account_deletion and complete_account_deletion are its callers.';

-- ---------------------------------------------------------------------
-- The one-person firms that go with a personal account
-- ---------------------------------------------------------------------
create or replace function public.companies_erased_with_user(p_user_id uuid)
returns table (company_id uuid)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id
  from public.companies c
  join public.company_members cm on cm.company_id = c.id
  where cm.user_id = p_user_id
    and cm.role = 'owner'
    and (select count(*) from public.company_members m where m.company_id = c.id) = 1;
$fn$;

comment on function public.companies_erased_with_user(uuid) is
  'Firms whose only member is this person, and which therefore have nobody left once the account goes. Internal.';

-- ---------------------------------------------------------------------
-- Holding and releasing
-- ---------------------------------------------------------------------
create or replace function public.hold_account_for_deletion(
  p_user_id uuid,
  p_company_id uuid,
  p_kind public.account_deletion_kind
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_companies uuid[];
begin
  if p_kind = 'user' then
    update public.profiles set deletion_scheduled_at = now() where id = p_user_id;
    select array_agg(company_id) into v_companies
    from public.companies_erased_with_user(p_user_id);
  else
    v_companies := array[p_company_id];
  end if;
  v_companies := coalesce(v_companies, '{}');

  update public.companies set deletion_scheduled_at = now() where id = any (v_companies);

  -- Off the board, remembering where they were, exactly the way the
  -- compliance sweep does it — so the same restore brings them back if
  -- the deletion is cancelled.
  update public.cargo_listings
  set previous_status = status, status = 'suspended'
  where status in ('active', 'offers_received')
    and (company_id = any (v_companies)
         or (p_kind = 'user' and company_id is null and posted_by = p_user_id));

  update public.truck_listings
  set previous_status = status, status = 'suspended'
  where status in ('active', 'offers_received')
    and company_id = any (v_companies);
end;
$fn$;

create or replace function public.release_account_from_deletion(
  p_user_id uuid,
  p_company_id uuid,
  p_kind public.account_deletion_kind
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_companies uuid[];
  r record;
begin
  if p_kind = 'user' then
    update public.profiles set deletion_scheduled_at = null where id = p_user_id;
    select array_agg(company_id) into v_companies
    from public.companies_erased_with_user(p_user_id);
  else
    v_companies := array[p_company_id];
  end if;
  v_companies := coalesce(v_companies, '{}');

  -- Cleared before the listings move: the trigger reads these columns.
  update public.companies set deletion_scheduled_at = null where id = any (v_companies);

  -- Back to where they were, or expired if their dates went past while
  -- the account was held. Row by row and forgiving, for the same reason
  -- the sweep is: one listing that cannot return must not cost somebody
  -- the cancellation of their deletion.
  for r in
    select l.id,
           case when coalesce(l.loading_to, l.loading_from) >= current_date
                     and (l.expires_at is null or l.expires_at > now())
                then l.previous_status else 'expired'::public.listing_status end as target
    from public.cargo_listings l
    where l.status = 'suspended' and l.previous_status is not null
      and (l.company_id = any (v_companies)
           or (p_kind = 'user' and l.company_id is null and l.posted_by = p_user_id))
      -- A listing the compliance sweep took off for a missing document
      -- stays off: cancelling a deletion is not a way to skip the
      -- paperwork. The sweep brings those back on its own terms.
      and (l.company_id is null or exists (
            select 1 from public.companies c
            where c.id = l.company_id
              and not c.is_suspended and c.verification_status = 'verified'))
  loop
    begin
      update public.cargo_listings set status = r.target, previous_status = null where id = r.id;
    exception when others then null;
    end;
  end loop;

  for r in
    select l.id,
           case when coalesce(l.available_to, l.available_from) >= current_date
                     and (l.expires_at is null or l.expires_at > now())
                then l.previous_status else 'expired'::public.listing_status end as target
    from public.truck_listings l
    join public.companies c on c.id = l.company_id
    join public.vehicles v on v.id = l.vehicle_id
    where l.status = 'suspended' and l.previous_status is not null
      and l.company_id = any (v_companies)
      and not c.is_suspended and c.verification_status = 'verified'
      and v.is_compliant
  loop
    begin
      update public.truck_listings set status = r.target, previous_status = null where id = r.id;
    exception when others then null;
    end;
  end loop;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Asking for it
--
-- One entry point for both kinds. Returns the row, blocked or scheduled,
-- because the screen has to show the same sentence the database decided
-- on rather than one of its own.
-- ---------------------------------------------------------------------
create or replace function public.request_account_deletion(
  p_kind text,
  p_company_id uuid default null
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_kind public.account_deletion_kind;
  v_blockers text[];
  v_grace integer;
  v_row public.account_deletion_requests;
  v_email text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să ceri ștergerea datelor' using errcode = '42501';
  end if;

  begin
    v_kind := p_kind::public.account_deletion_kind;
  exception when others then
    raise exception 'Tip de ștergere necunoscut' using errcode = '22023';
  end;

  if v_kind = 'company' then
    if p_company_id is null then
      raise exception 'Alege firma care trebuie ștearsă' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.company_members m
      where m.company_id = p_company_id and m.user_id = v_uid and m.role = 'owner'
    ) then
      raise exception 'Doar proprietarul firmei poate cere ștergerea ei' using errcode = '42501';
    end if;
  else
    p_company_id := null;
  end if;

  select grace_days into v_grace from public.deletion_settings where id;
  v_grace := coalesce(v_grace, 14);
  v_blockers := public.account_deletion_blockers(v_uid, v_kind, p_company_id);

  -- One open request per person and per firm. A second ask replaces the
  -- first rather than raising: somebody who was blocked in the morning
  -- and fixed it by lunchtime is asking the same question again.
  delete from public.account_deletion_requests
  where status in ('requested', 'blocked')
    and ((v_kind = 'user' and kind = 'user' and user_id = v_uid)
         or (v_kind = 'company' and kind = 'company' and company_id = p_company_id));

  insert into public.account_deletion_requests
    (user_id, company_id, kind, status, reason_blocked, scheduled_for)
  values (
    v_uid,
    case when v_kind = 'company' then p_company_id
         else (select company_id from public.companies_erased_with_user(v_uid) limit 1) end,
    v_kind,
    case when array_length(v_blockers, 1) > 0 then 'blocked' else 'scheduled' end
      ::public.account_deletion_status,
    case when array_length(v_blockers, 1) > 0 then array_to_string(v_blockers, ' ') else null end,
    case when array_length(v_blockers, 1) > 0 then null else now() + (v_grace || ' days')::interval end
  )
  returning * into v_row;

  if v_row.status = 'scheduled' then
    perform public.hold_account_for_deletion(v_uid, v_row.company_id, v_kind);
  end if;

  perform public.write_audit(
    case when v_row.status = 'blocked' then 'account.deletion_blocked'
         else 'account.deletion_requested' end,
    case when v_kind = 'company' then 'company' else 'profile' end,
    coalesce(p_company_id, v_uid),
    null,
    jsonb_build_object('request_id', v_row.id, 'kind', p_kind, 'status', v_row.status),
    v_row.reason_blocked);

  -- Who to write to. A firm deletion is still answered to the person who
  -- asked: the firm's shared inbox may be read by the people whose
  -- account is about to stop working.
  select p.email, coalesce(nullif(p.full_name, ''), 'colega/colegul nostru')
    into v_email, v_name
  from public.profiles p where p.id = v_uid;

  if v_email is not null then
    insert into public.notification_outbox
      (channel, template, recipient_user_id, to_email, payload, dedupe_key)
    values (
      'email',
      case when v_row.status = 'blocked' then 'account_deletion_blocked'
           else 'account_deletion_scheduled' end,
      v_uid, v_email,
      jsonb_build_object(
        'full_name', v_name,
        'what', case when v_kind = 'company' then 'firmei' else 'contului' end,
        'scheduled_for', to_char(v_row.scheduled_for at time zone 'Europe/Bucharest', 'DD.MM.YYYY'),
        'reason', coalesce(v_row.reason_blocked, ''),
        'cancel_token', v_row.cancel_token::text),
      'deletion:' || v_row.id || ':' || v_row.status)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return v_row;
end;
$fn$;

comment on function public.request_account_deletion(text, uuid) is
  'Starts an erasure. Blocked is a stored state with the sentence that explains it, not a raised error.';

-- ---------------------------------------------------------------------
-- Changing your mind
-- ---------------------------------------------------------------------
create or replace function public.cancel_account_deletion(p_id uuid)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.account_deletion_requests;
begin
  select * into v_row from public.account_deletion_requests where id = p_id for update;
  if v_row.id is null then
    raise exception 'Cererea de ștergere nu există' using errcode = 'P0002';
  end if;
  if not (v_row.user_id = auth.uid()
          or (v_row.company_id is not null and public.is_company_manager(v_row.company_id))
          or public.is_platform_admin()) then
    raise exception 'Nu poți anula ștergerea altui cont' using errcode = '42501';
  end if;
  if v_row.status not in ('scheduled', 'blocked', 'requested') then
    raise exception 'Ștergerea nu mai poate fi anulată' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set status = 'cancelled', cancelled_at = now(), scheduled_for = null
  where id = p_id
  returning * into v_row;

  perform public.release_account_from_deletion(v_row.user_id, v_row.company_id, v_row.kind);
  perform public.write_audit('account.deletion_cancelled',
    case when v_row.kind = 'company' then 'company' else 'profile' end,
    coalesce(v_row.company_id, v_row.user_id), null,
    jsonb_build_object('request_id', v_row.id));

  insert into public.notification_outbox
    (channel, template, recipient_user_id, to_email, payload, dedupe_key)
  select 'email', 'account_deletion_cancelled', p.id, p.email,
         jsonb_build_object(
           'full_name', coalesce(nullif(p.full_name, ''), 'colega/colegul nostru'),
           'what', case when v_row.kind = 'company' then 'firmei' else 'contului' end),
         'deletion:' || v_row.id || ':cancelled'
  from public.profiles p
  where p.id = v_row.user_id and p.email is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return v_row;
end;
$fn$;

/**
 * The same, from the link in the e-mail.
 *
 * Open to `anon` on purpose: the account the link belongs to is held, and
 * asking somebody to log into the thing they are trying to rescue is how
 * a grace period quietly becomes a deletion. The token is a random uuid,
 * it only ever cancels, and it stops working the moment it is used.
 */
create or replace function public.cancel_account_deletion_by_token(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.account_deletion_requests;
begin
  select * into v_row from public.account_deletion_requests
  where cancel_token = p_token and status = 'scheduled'
  for update;

  if v_row.id is null then
    return false;
  end if;

  update public.account_deletion_requests
  set status = 'cancelled', cancelled_at = now(), scheduled_for = null,
      cancel_token = gen_random_uuid()
  where id = v_row.id;

  perform public.release_account_from_deletion(v_row.user_id, v_row.company_id, v_row.kind);
  perform public.write_audit('account.deletion_cancelled',
    case when v_row.kind = 'company' then 'company' else 'profile' end,
    coalesce(v_row.company_id, v_row.user_id), null,
    jsonb_build_object('request_id', v_row.id, 'via', 'link'));

  insert into public.notification_outbox
    (channel, template, recipient_user_id, to_email, payload, dedupe_key)
  select 'email', 'account_deletion_cancelled', p.id, p.email,
         jsonb_build_object(
           'full_name', coalesce(nullif(p.full_name, ''), 'colega/colegul nostru'),
           'what', case when v_row.kind = 'company' then 'firmei' else 'contului' end),
         'deletion:' || v_row.id || ':cancelled'
  from public.profiles p
  where p.id = v_row.user_id and p.email is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return true;
end;
$fn$;

comment on function public.cancel_account_deletion_by_token(uuid) is
  'Cancels from the e-mail link. Open to anon because the account it rescues is the one being held.';

-- ---------------------------------------------------------------------
-- Staff anonymisation
--
-- Same path as a personal request, with two differences: no grace period,
-- and a reason that cannot be left empty. The blocking rules still apply
-- — they are not a courtesy to the account holder, they are what keeps a
-- counterparty's open transport from losing one of its two ends.
-- ---------------------------------------------------------------------
create or replace function public.staff_anonymise_account(
  p_user_id uuid,
  p_reason text
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_blockers text[];
  v_row public.account_deletion_requests;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate anonimiza un cont' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Motivul este obligatoriu' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Utilizator inexistent' using errcode = 'P0002';
  end if;

  v_blockers := public.account_deletion_blockers(p_user_id, 'user', null);

  delete from public.account_deletion_requests
  where kind = 'user' and user_id = p_user_id and status in ('requested', 'blocked');

  insert into public.account_deletion_requests
    (user_id, company_id, kind, status, reason_blocked, scheduled_for,
     processed_by, staff_reason)
  values (
    p_user_id,
    (select company_id from public.companies_erased_with_user(p_user_id) limit 1),
    'user',
    case when array_length(v_blockers, 1) > 0 then 'blocked' else 'scheduled' end
      ::public.account_deletion_status,
    case when array_length(v_blockers, 1) > 0 then array_to_string(v_blockers, ' ') else null end,
    case when array_length(v_blockers, 1) > 0 then null else now() end,
    auth.uid(), trim(p_reason))
  returning * into v_row;

  if v_row.status = 'scheduled' then
    perform public.hold_account_for_deletion(p_user_id, v_row.company_id, 'user');
  end if;

  perform public.write_audit('account.staff_anonymised', 'profile', p_user_id, null,
    jsonb_build_object('request_id', v_row.id, 'status', v_row.status),
    trim(p_reason));

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The job
--
-- Claim, then files, then the database, then `auth.users`. The order
-- matters: the file list has to be read while the rows that name the
-- files still exist, and the login has to be the last thing to go, so a
-- run that dies halfway leaves an account that can still be rescued
-- rather than a login with nothing behind it.
-- ---------------------------------------------------------------------
create or replace function public.claim_account_deletions(
  p_limit integer default 20,
  p_now timestamptz default now()
)
returns setof public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  with due as (
    select r.id
    from public.account_deletion_requests r
    where r.status = 'scheduled'
      and r.scheduled_for is not null
      and r.scheduled_for <= p_now
      -- A row another run is holding, or one that died mid-run less than
      -- an hour ago, is left alone.
      and (r.processing_started_at is null
           or r.processing_started_at < p_now - interval '1 hour')
    order by r.scheduled_for
    limit greatest(coalesce(p_limit, 20), 1)
    for update skip locked
  )
  update public.account_deletion_requests r
  set processing_started_at = p_now
  from due
  where r.id = due.id
  returning r.*;
end;
$fn$;

/**
 * Every file that has to leave the bucket with this account.
 *
 * Read before anything is deleted, because the rows that name the files
 * are themselves about to go. Returns bucket and path so the caller does
 * not have to know our storage conventions.
 */
create or replace function public.account_deletion_files(p_id uuid)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_row public.account_deletion_requests;
  v_companies uuid[];
begin
  select * into v_row from public.account_deletion_requests where id = p_id;
  if v_row.id is null then
    return;
  end if;

  if v_row.kind = 'company' then
    v_companies := array[v_row.company_id];
  else
    select coalesce(array_agg(c.company_id), '{}')
      into v_companies
    from public.companies_erased_with_user(v_row.user_id) c;
  end if;

  return query
    select 'documents'::text, d.file_path
    from public.documents d
    where d.company_id = any (v_companies) and d.file_path is not null;

  -- Listing photos live under the uploader's own folder, not the firm's,
  -- so a personal erasure can take them by prefix. A firm's erasure has
  -- to name them one by one from the listings that are about to go —
  -- those photos belong to a person who keeps their account.
  if v_row.kind = 'user' then
    return query
      select 'listing-photos'::text, o.name
      from storage.objects o
      where o.bucket_id = 'listing-photos'
        and (storage.foldername(o.name))[1] = v_row.user_id::text;
  end if;

  return query
    select 'listing-photos'::text, unnest(l.photo_paths)
    from public.cargo_listings l
    where l.company_id = any (v_companies);

  return query
    select 'exports'::text, o.name
    from storage.objects o
    where o.bucket_id = 'exports'
      and v_row.kind = 'user'
      and (storage.foldername(o.name))[1] = v_row.user_id::text;
end;
$fn$;

/**
 * Reducing a firm to a shell.
 *
 * Not a delete. `transports.carrier_company_id` is `on delete restrict`
 * on purpose: a job that was carried has two ends and keeps them. So the
 * row stays, with nothing in it that identifies anybody — and everything
 * that hangs off it and does identify somebody goes: members, documents,
 * vehicles, drivers, listings, invitations.
 *
 * The shell can never come back. `deletion_scheduled_at` stays set, which
 * is what the listing guard reads, and the verification status is one the
 * compliance sweep does not touch.
 */
create or replace function public.anonymise_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.documents where company_id = p_company_id;
  delete from public.cargo_listings where company_id = p_company_id;
  delete from public.truck_listings where company_id = p_company_id;
  delete from public.vehicles where company_id = p_company_id;
  delete from public.drivers where company_id = p_company_id;
  delete from public.company_members where company_id = p_company_id;
  delete from public.company_invitations where company_id = p_company_id;

  update public.companies set
    legal_name = 'Firmă ștearsă',
    display_name = null,
    -- Unique, because the index is: a second erased firm must not collide
    -- with the first.
    cui = 'STERS-' || left(replace(p_company_id::text, '-', ''), 12),
    reg_com = null,
    vat_payer = null,
    address = null,
    county = null,
    city = null,
    contact_email = null,
    contact_phone = null,
    website = null,
    anaf_payload = null,
    anaf_checked_at = null,
    anaf_is_inactive = null,
    created_by = null,
    public_profile_enabled = false,
    slug = null,
    public_description = null,
    logo_path = null,
    verification_note = null,
    alerts_enabled = false,
    alerts_email = null,
    indicative_rate_note = null,
    trust_score = 0,
    verification_status = 'rejected',
    is_suspended = true,
    suspension_reason = 'Firma a fost ștearsă la cerere',
    suspended_at = now(),
    anonymised_at = now(),
    deletion_scheduled_at = now()
  where id = p_company_id;
end;
$fn$;

comment on function public.anonymise_company(uuid) is
  'Leaves a firm as a shell with no identity and no people. Never a delete: a carried transport keeps both its ends.';

/**
 * Finishing one request.
 *
 * Called by the scheduled function after it has emptied the buckets. The
 * blocking rules are checked a second time here, because a fortnight is
 * long enough for somebody to have started a transport — and a deletion
 * that goes ahead anyway would take one end off a live job.
 */
create or replace function public.complete_account_deletion(p_id uuid)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.account_deletion_requests;
  v_blockers text[];
  v_email text;
  v_name text;
  v_companies uuid[];
  v_company uuid;
begin
  select * into v_row from public.account_deletion_requests where id = p_id for update;
  if v_row.id is null then
    raise exception 'Cererea de ștergere nu există' using errcode = 'P0002';
  end if;
  if v_row.status <> 'scheduled' then
    raise exception 'Cererea nu este programată pentru ștergere' using errcode = '22023';
  end if;
  if v_row.scheduled_for is null or v_row.scheduled_for > now() then
    raise exception 'Perioada de grație nu s-a încheiat' using errcode = '22023';
  end if;

  v_blockers := public.account_deletion_blockers(v_row.user_id, v_row.kind, v_row.company_id);
  if array_length(v_blockers, 1) > 0 then
    update public.account_deletion_requests
    set status = 'blocked', reason_blocked = array_to_string(v_blockers, ' '),
        scheduled_for = null, processing_started_at = null
    where id = p_id
    returning * into v_row;

    perform public.release_account_from_deletion(v_row.user_id, v_row.company_id, v_row.kind);
    perform public.write_audit('account.deletion_blocked',
      case when v_row.kind = 'company' then 'company' else 'profile' end,
      coalesce(v_row.company_id, v_row.user_id), null,
      jsonb_build_object('request_id', v_row.id, 'at', 'completion'),
      v_row.reason_blocked);

    insert into public.notification_outbox
      (channel, template, recipient_user_id, to_email, payload, dedupe_key)
    select 'email', 'account_deletion_blocked', p.id, p.email,
           jsonb_build_object(
             'full_name', coalesce(nullif(p.full_name, ''), 'colega/colegul nostru'),
             'what', case when v_row.kind = 'company' then 'firmei' else 'contului' end,
             'reason', v_row.reason_blocked),
           'deletion:' || v_row.id || ':blocked-late'
    from public.profiles p
    where p.id = v_row.user_id and p.email is not null
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    return v_row;
  end if;

  -- Read before anything goes: the final e-mail has to be addressed to
  -- somebody whose row is about to stop existing.
  select p.email, coalesce(nullif(p.full_name, ''), 'colega/colegul nostru')
    into v_email, v_name
  from public.profiles p where p.id = v_row.user_id;

  if v_row.kind = 'company' then
    v_companies := array[v_row.company_id];
  else
    select coalesce(array_agg(c.company_id), '{}') into v_companies
    from public.companies_erased_with_user(v_row.user_id) c;
  end if;

  foreach v_company in array v_companies loop
    perform public.anonymise_company(v_company);
  end loop;

  update public.account_deletion_requests
  set status = 'completed', completed_at = now(), processing_started_at = null
  where id = p_id
  returning * into v_row;

  if v_row.kind = 'user' then
    -- Explicit, although the foreign key would do it: a transport that
    -- keeps its dates, its price and its carrier but no longer names a
    -- person is the anonymised reference this whole file is about, and
    -- it should be visible here rather than inferred from a constraint.
    update public.transports set shipper_user_id = null where shipper_user_id = v_row.user_id;

    -- The e-mail row is addressed by address rather than by user, because
    -- the user is about to be deleted and the outbox cascades with them.
    if v_email is not null then
      insert into public.notification_outbox
        (channel, template, to_email, payload, dedupe_key)
      values ('email', 'account_deletion_completed', v_email,
              jsonb_build_object('full_name', v_name), 'deletion:' || v_row.id || ':done')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;

    perform public.write_audit('account.deletion_completed', 'profile', null, null,
      jsonb_build_object('request_id', v_row.id, 'kind', 'user',
                         'companies', to_jsonb(v_companies)));

    -- Last. Everything personal cascades from here: profile, listings,
    -- offers, messages, ratings, push subscriptions, preferences.
    delete from auth.users where id = v_row.user_id;
  else
    if v_email is not null then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, to_email, payload, dedupe_key)
      values ('email', 'account_deletion_completed', v_row.user_id, v_email,
              jsonb_build_object('full_name', v_name), 'deletion:' || v_row.id || ':done')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;

    perform public.write_audit('account.deletion_completed', 'company', v_row.company_id, null,
      jsonb_build_object('request_id', v_row.id, 'kind', 'company'));
  end if;

  return v_row;
end;
$fn$;

comment on function public.complete_account_deletion(uuid) is
  'Erases one request: firms become shells, the person''s auth row goes last. Re-checks the blocking rules, because a fortnight is long enough for a new transport.';

-- =====================================================================
-- „Descarcă datele mele"
--
-- Article 15 in one button. Built without a service-role key anywhere
-- near the web app: the person's own session asks the database for their
-- own data, writes the archive into their own folder, and the link that
-- hands it over is ours rather than the bucket's — so it can be used
-- once, expire, and take the file with it.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/zip'])
on conflict (id) do nothing;

create policy "exports_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exports_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "exports_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);

create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'downloaded', 'failed', 'expired')),
  file_path text,
  size_bytes integer,
  expires_at timestamptz,
  downloaded_at timestamptz,
  error text,
  -- In the download link. One use, and the row is what makes it one use.
  download_token uuid not null default gen_random_uuid()
);

comment on table public.data_export_requests is
  'One row per „Descarcă datele mele". The archive lives in the private exports bucket; this row is what makes the link single-use and short-lived.';

create index data_export_user_idx on public.data_export_requests (user_id, created_at desc);
create index data_export_expiry_idx on public.data_export_requests (expires_at)
  where status in ('ready', 'downloaded');

create trigger data_export_requests_set_updated_at
  before update on public.data_export_requests
  for each row execute function public.set_updated_at();

alter table public.data_export_requests enable row level security;

create policy "data_export_select_own_or_staff" on public.data_export_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

revoke all on public.data_export_requests from anon, authenticated;
grant select on public.data_export_requests to authenticated;

/**
 * Everything we hold about the person asking.
 *
 * Runs as the definer and reads by `auth.uid()` rather than by an
 * argument, so there is no version of this function that exports somebody
 * else. What comes back is deliberately flat and boring: the archive is
 * read by a person, or by the next platform they move to, and neither
 * wants our join graph.
 */
create or replace function public.my_data_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_companies uuid[];
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să îți ceri datele' using errcode = '42501';
  end if;

  select coalesce(array_agg(company_id), '{}') into v_companies
  from public.company_members where user_id = v_uid;

  return jsonb_build_object(
    'generat_la', to_char(now() at time zone 'Europe/Bucharest', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'profil', (select to_jsonb(p) - 'id' from public.profiles p where p.id = v_uid),
    'firme', (select coalesce(jsonb_agg(jsonb_build_object(
        'denumire', c.legal_name, 'cui', c.cui, 'rol', m.role,
        'membru_din', m.created_at, 'tip', c.company_type,
        'stare_verificare', c.verification_status)), '[]'::jsonb)
      from public.company_members m join public.companies c on c.id = m.company_id
      where m.user_id = v_uid),
    'cereri', (select coalesce(jsonb_agg(to_jsonb(l) - 'id' - 'company_id' - 'posted_by'), '[]'::jsonb)
      from public.cargo_listings l where l.posted_by = v_uid),
    'trasee', (select coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'company_id' - 'posted_by'), '[]'::jsonb)
      from public.truck_listings t where t.posted_by = v_uid),
    'oferte', (select coalesce(jsonb_agg(to_jsonb(o) - 'id' - 'from_user_id'), '[]'::jsonb)
      from public.offers o where o.from_user_id = v_uid),
    'transporturi', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', t.created_at, 'stare', t.status, 'pret', t.agreed_price,
        'moneda', t.currency, 'livrat_la', t.delivered_at)), '[]'::jsonb)
      from public.transports t
      where t.shipper_user_id = v_uid or t.shipper_company_id = any (v_companies)),
    'mesaje', (select coalesce(jsonb_agg(jsonb_build_object(
        'trimis_la', m.created_at, 'text', m.body)), '[]'::jsonb)
      from public.messages m where m.sender_user_id = v_uid),
    'evaluari_date', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', r.created_at, 'scor', r.score)), '[]'::jsonb)
      from public.ratings r where r.rater_user_id = v_uid),
    'documente', (select coalesce(jsonb_agg(jsonb_build_object(
        'firma', c.legal_name, 'tip', d.kind, 'stare', d.status,
        'valabil_pana', d.valid_until, 'incarcat_la', d.created_at)), '[]'::jsonb)
      from public.documents d join public.companies c on c.id = d.company_id
      where d.uploaded_by = v_uid),
    'preferinte_notificari', (select coalesce(jsonb_agg(to_jsonb(n) - 'user_id'), '[]'::jsonb)
      from public.notification_preferences n where n.user_id = v_uid),
    'notificari_trimise', (select coalesce(jsonb_agg(jsonb_build_object(
        'canal', o.channel, 'sablon', o.template, 'stare', o.status,
        'trimis_la', o.sent_at)), '[]'::jsonb)
      from public.notification_outbox o where o.recipient_user_id = v_uid),
    'contacte_deblocate', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', cr.created_at)), '[]'::jsonb)
      from public.contact_reveals cr where cr.user_id = v_uid),
    'invitatii', (select coalesce(jsonb_agg(jsonb_build_object(
        'firma', c.legal_name, 'rol', i.role, 'data', i.created_at,
        'stare', i.status)), '[]'::jsonb)
      from public.company_invitations i join public.companies c on c.id = i.company_id
      where i.invited_by = v_uid or i.accepted_by = v_uid
         or i.invited_email = lower((select email from public.profiles where id = v_uid)))
  );
end;
$fn$;

comment on function public.my_data_export() is
  'Everything we hold about the caller, as one JSON object. Reads by auth.uid(), so there is no version of it that exports somebody else.';

-- ---------------------------------------------------------------------
-- The request, the finish and the one-use link
-- ---------------------------------------------------------------------
create or replace function public.request_data_export()
returns public.data_export_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_per_day integer;
  v_today integer;
  v_row public.data_export_requests;
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să îți ceri datele' using errcode = '42501';
  end if;

  select export_per_day into v_per_day from public.deletion_settings where id;
  v_per_day := coalesce(v_per_day, 1);

  select count(*) into v_today
  from public.data_export_requests
  where user_id = v_uid and created_at > now() - interval '24 hours';

  if v_today >= v_per_day then
    raise exception 'Ai cerut deja datele în ultimele 24 de ore. Încearcă mâine.'
      using errcode = '22023';
  end if;

  insert into public.data_export_requests (user_id) values (v_uid) returning * into v_row;
  perform public.write_audit('account.export_requested', 'profile', v_uid, null,
    jsonb_build_object('export_id', v_row.id));
  return v_row;
end;
$fn$;

create or replace function public.finish_data_export(
  p_id uuid,
  p_file_path text,
  p_size_bytes integer default null,
  p_error text default null
)
returns public.data_export_requests
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_hours integer;
  v_row public.data_export_requests;
begin
  select * into v_row from public.data_export_requests where id = p_id for update;
  if v_row.id is null or v_row.user_id <> auth.uid() then
    raise exception 'Exportul nu există' using errcode = 'P0002';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'Exportul este deja finalizat' using errcode = '22023';
  end if;

  if p_error is not null then
    update public.data_export_requests
    set status = 'failed', error = left(p_error, 500)
    where id = p_id returning * into v_row;
    return v_row;
  end if;

  -- The path is checked rather than trusted: this function is reachable
  -- through PostgREST, and a path in somebody else's folder would turn a
  -- download link into a read of their archive.
  if p_file_path is null or p_file_path !~ ('^' || auth.uid()::text || '/') then
    raise exception 'Calea fișierului nu îți aparține' using errcode = '42501';
  end if;

  select export_valid_hours into v_hours from public.deletion_settings where id;

  update public.data_export_requests
  set status = 'ready', file_path = p_file_path, size_bytes = p_size_bytes,
      expires_at = now() + (coalesce(v_hours, 24) || ' hours')::interval
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$fn$;

/**
 * Handing the archive over, once.
 *
 * The token is checked here rather than by the storage layer so that
 * "once" is a row in a table instead of a promise about a URL. What comes
 * back is the path; the route that called this signs it for a minute and
 * redirects.
 */
create or replace function public.claim_data_export(p_id uuid, p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.data_export_requests;
begin
  select * into v_row from public.data_export_requests where id = p_id for update;
  if v_row.id is null or v_row.user_id <> auth.uid() or v_row.download_token <> p_token then
    raise exception 'Linkul nu este valabil' using errcode = '42501';
  end if;
  if v_row.status <> 'ready' then
    raise exception 'Arhiva nu mai este disponibilă. Cere-o din nou.' using errcode = '22023';
  end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    update public.data_export_requests set status = 'expired' where id = p_id;
    raise exception 'Linkul a expirat. Cere arhiva din nou.' using errcode = '22023';
  end if;

  update public.data_export_requests
  set status = 'downloaded', downloaded_at = now()
  where id = p_id;

  perform public.write_audit('account.export_downloaded', 'profile', v_row.user_id, null,
    jsonb_build_object('export_id', p_id));

  return v_row.file_path;
end;
$fn$;

/** Archives whose day is up. The job deletes the files it names. */
create or replace function public.expired_data_exports(p_now timestamptz default now())
returns table (id uuid, file_path text)
language sql
security definer
set search_path = public
as $fn$
  select e.id, e.file_path
  from public.data_export_requests e
  where e.file_path is not null
    and e.status in ('ready', 'downloaded')
    and e.expires_at is not null
    and e.expires_at < p_now;
$fn$;

create or replace function public.forget_data_export(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.data_export_requests
  set status = 'expired', file_path = null, size_bytes = null
  where id = p_id;
$fn$;

-- ---------------------------------------------------------------------
-- What the screen may ask before somebody types their e-mail
--
-- The same rules, addressed to the caller only. Separate from the
-- internal one so that there is no signature anybody outside can pass
-- another person's id to.
-- ---------------------------------------------------------------------
create or replace function public.my_deletion_blockers(
  p_kind text,
  p_company_id uuid default null
)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_kind public.account_deletion_kind;
begin
  if v_uid is null then
    raise exception 'Intră în cont' using errcode = '42501';
  end if;
  begin
    v_kind := p_kind::public.account_deletion_kind;
  exception when others then
    raise exception 'Tip de ștergere necunoscut' using errcode = '22023';
  end;
  if v_kind = 'company' then
    if not exists (
      select 1 from public.company_members m
      where m.company_id = p_company_id and m.user_id = v_uid and m.role = 'owner'
    ) then
      raise exception 'Doar proprietarul firmei poate cere ștergerea ei' using errcode = '42501';
    end if;
  else
    p_company_id := null;
  end if;
  return public.account_deletion_blockers(v_uid, v_kind, p_company_id);
end;
$fn$;

create or replace function public.set_deletion_settings(
  p_grace_days integer,
  p_support_email text
)
returns public.deletion_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.deletion_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările de ștergere'
      using errcode = '42501';
  end if;
  update public.deletion_settings
  set grace_days = coalesce(p_grace_days, grace_days),
      support_email = nullif(trim(coalesce(p_support_email, '')), ''),
      updated_at = now()
  where id
  returning * into v_row;
  perform public.write_audit('settings.deletion_changed', 'settings', null, null,
    to_jsonb(v_row));
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (migration 20260916130300),
-- so everything callable is listed here and nothing else is callable.
-- The internal helpers — the blockers by user id, the hold and release,
-- the anonymisation — are deliberately absent.
-- ---------------------------------------------------------------------
grant execute on function public.request_account_deletion(text, uuid) to authenticated;
grant execute on function public.cancel_account_deletion(uuid) to authenticated;
grant execute on function public.cancel_account_deletion_by_token(uuid) to anon, authenticated;
grant execute on function public.my_deletion_blockers(text, uuid) to authenticated;
grant execute on function public.staff_anonymise_account(uuid, text) to authenticated;
grant execute on function public.set_deletion_settings(integer, text) to authenticated;

grant execute on function public.my_data_export() to authenticated;
grant execute on function public.request_data_export() to authenticated;
grant execute on function public.finish_data_export(uuid, text, integer, text) to authenticated;
grant execute on function public.claim_data_export(uuid, uuid) to authenticated;

grant execute on function public.claim_account_deletions(integer, timestamptz) to service_role;
grant execute on function public.account_deletion_files(uuid) to service_role;
grant execute on function public.complete_account_deletion(uuid) to service_role;
grant execute on function public.expired_data_exports(timestamptz) to service_role;
grant execute on function public.forget_data_export(uuid) to service_role;

-- ---------------------------------------------------------------------
-- The job's place in the health screen
--
-- Added here rather than left out: a deletion job that stops running is
-- the one failure in this file nobody would notice, because its whole
-- output is things quietly not being there any more.
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
      ('nightly-compliance-sweep', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('hourly-listing-cleanup', 3.0),
      ('outbox-dispatcher', 1.0),
      ('account-deletion', 36.0)
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
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('hourly-listing-cleanup', 3.0), ('outbox-dispatcher', 1.0),
      ('account-deletion', 36.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$fn$;

comment on function public.job_health is
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. The compliance sweep and the deletion job are late after 36 hours.';

-- ---------------------------------------------------------------------
-- The bridge from pg_cron to the edge function
--
-- Same shape as `dispatch_outbox_http`, and for the same reason: the URL
-- and the shared secret come from Vault, never from a file that lives in
-- git. Deleting the bytes behind a document needs the storage API, so
-- this one cannot be plain SQL however much simpler that would be.
-- ---------------------------------------------------------------------
create or replace function public.dispatch_account_deletions_http()
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'account_deletion_url';
    select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';
  exception when undefined_table or invalid_schema_name or insufficient_privilege then
    raise exception using
      message = 'Vault nu este disponibil, deci jobul de ștergere nu poate fi pornit',
      errcode = '42501';
  end;

  if v_url is null or v_secret is null then
    raise exception using
      message = 'Secretele account_deletion_url și cron_secret nu sunt în Vault. Vezi docs/DEPLOYMENT.md.',
      errcode = '42501';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

grant execute on function public.dispatch_account_deletions_http() to service_role;

do $cron$
begin
  if to_regproc('cron.schedule(text,text,text)') is null then
    raise warning
      'pg_cron nu este disponibil, deci jobul de ștergere a conturilor NU este programat. Cererile rămân în așteptare până când este pornit. Vezi docs/DEPLOYMENT.md, secțiunea Joburi programate.';
    return;
  end if;
  if to_regproc('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise warning
      'pg_net nu este disponibil, deci jobul de ștergere a conturilor NU este programat. Vezi docs/DEPLOYMENT.md.';
    return;
  end if;

  -- 03:10 UTC: after the compliance sweep and the expiry reminders, so a
  -- firm is never suspended and erased in the same minute.
  perform cron.schedule('account-deletion', '10 3 * * *',
                        'select public.dispatch_account_deletions_http();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Jobul de ștergere există deja; îl las cum este.';
end;
$cron$;
