-- =====================================================================
-- Faza 1 — deblocare
--
-- Five things, all of them about a person being able to finish what they
-- started, and one about us being able to tell whether anybody did.
--
-- 1. An individual publishes with a CONFIRMED E-MAIL and a phone number
--    ON FILE. Until now publishing needed a phone confirmed by SMS, and
--    there is no SMS provider — so the whole individual side of the
--    marketplace was closed by a rule nobody could satisfy. The rule does
--    not disappear: a verified phone is still required to open somebody's
--    contact details or to accept an offer, which are the two moments
--    where a fake number costs a real person time. It moved; it did not
--    soften.
--
-- 2. Staff can verify a phone by hand. Until an SMS provider exists, that
--    is the only way a number becomes verified, so it has to exist, be
--    audited, and survive the trigger that mirrors auth.users.
--
-- 3. Test accounts are marked and excluded from everything public. A
--    counter that includes our own seeded firms is a counter that lies,
--    and the pilot dashboard below would inherit the lie.
--
-- 4. The client chooses how long a request stays on the board, and hears
--    from us before it expires rather than after.
--
-- 5. The mail dispatcher records the provider's id per row and learns
--    what a hard bounce is, so an address that will never work is marked
--    once instead of retried five times a week forever.
--
-- Nothing here is Faza 2: no offers, no orders, no messaging, no
-- moderation. `accept_offer` is touched only in that it reads the same
-- `phone_verified` column staff can now set — its body is unchanged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. What a profile now records about being reachable
--
-- `email_confirmed_at` is mirrored rather than looked up. The publish
-- guard needs it on every insert, and a trigger reaching into auth.users
-- on the hot path is a coupling that shows up as a permissions puzzle the
-- first time somebody runs the suite as a different role.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column email_confirmed_at timestamptz,
  add column phone_verified_by_staff boolean not null default false,
  add column phone_verified_at timestamptz,
  add column phone_verified_by uuid references public.profiles (id) on delete set null,
  add column phone_verified_note text,
  -- An address that bounced hard. Not a status: a date, because "since
  -- when" is the question support asks.
  add column email_undeliverable_at timestamptz,
  add column email_undeliverable_reason text,
  add column is_test boolean not null default false;

comment on column public.profiles.email_confirmed_at is
  'Mirrored from auth.users. The publish guard reads it, so an unconfirmed address cannot put a request on the board.';
comment on column public.profiles.phone_verified_by_staff is
  'Set by staff_set_phone_verified() when somebody on the team confirmed the number another way. Kept separate from phone_verified so the auth mirror below cannot undo it, and cleared whenever the number itself changes.';
comment on column public.profiles.is_test is
  'Our own accounts. Excluded from every public count, board, directory and match. A test row that shows up in a number is a number nobody can trust.';
comment on column public.profiles.email_undeliverable_at is
  'When the mail provider told us this address is permanently bad. The account shows a warning; the dispatcher stops trying.';

alter table public.companies
  add column is_test boolean not null default false;

comment on column public.companies.is_test is
  'Our own firms. Same rule as profiles.is_test: never counted, never listed, never matched.';

create index profiles_is_test_idx on public.profiles (is_test) where is_test;
create index companies_is_test_idx on public.companies (is_test) where is_test;

-- ---------------------------------------------------------------------
-- The two questions the guards ask
--
-- Written as functions rather than inline predicates because three
-- different places ask them and the answer must not drift between them.
-- ---------------------------------------------------------------------
create or replace function public.email_is_confirmed(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select p.email_confirmed_at is not null
                   from public.profiles p where p.id = p_user), false);
$fn$;

comment on function public.email_is_confirmed(uuid) is
  'True once the address has been confirmed through the link we e-mailed. The publish guard''s first condition.';

/**
 * A phone number on file, in a shape somebody could ring.
 *
 * Not verification — reachability. The number is checked for shape by
 * `normalise_phone` at the point it is written; here we only ask that
 * there is one, because "publishing needs a number we can show a carrier"
 * and "opening a stranger's details needs a number we have confirmed" are
 * two different bars and conflating them is what closed the individual
 * side of the marketplace in the first place.
 */
create or replace function public.phone_is_on_file(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select coalesce(trim(p.phone), '') <> ''
                   from public.profiles p where p.id = p_user), false);
$fn$;

comment on function public.phone_is_on_file(uuid) is
  'True when the profile carries a telephone number. Reachability, not verification — see phone_verified for the stricter bar.';

-- Policy helpers are called by the guards, which are SECURITY DEFINER and
-- therefore run as the owner; nothing calls these as `authenticated`.
revoke all on function public.email_is_confirmed(uuid) from public;
revoke all on function public.phone_is_on_file(uuid) from public;

-- ---------------------------------------------------------------------
-- 2. Mirroring auth.users without undoing staff
--
-- The previous version recomputed phone_verified from auth on every
-- e-mail change. With staff verification that would silently un-verify a
-- number a person on the team had checked, at a moment unrelated to the
-- phone — the worst kind of bug, because the cause and the effect are in
-- different weeks.
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.profiles p
  set email = new.email,
      email_confirmed_at = new.email_confirmed_at,
      phone = coalesce(new.phone, p.phone),
      phone_verified = (
        (new.phone is not null and new.phone_confirmed_at is not null)
        or p.phone_verified_by_staff
      )
  where p.id = new.id;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
  after insert or update of email, phone, phone_confirmed_at, email_confirmed_at on auth.users
  for each row execute function public.sync_profile_from_auth();

/**
 * The profile row, at the moment the account is created.
 *
 * Rebased on the 20260918220000 version, which added the terms. What is
 * new is `phone` being required to survive as it arrives (it already was)
 * and `email_confirmed_at` being carried over, so an account created by
 * an invitation that is already confirmed does not have to wait for an
 * unrelated update to the row before it may publish.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_version text := nullif(new.raw_user_meta_data ->> 'terms_version', '');
begin
  insert into public.profiles (id, email, email_confirmed_at, full_name, phone, account_type,
                               terms_version_accepted, terms_accepted_at)
  values (
    new.id,
    new.email,
    new.email_confirmed_at,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    coalesce((new.raw_user_meta_data ->> 'account_type')::account_type, 'company'),
    case when v_version ~ '^[0-9]+\.[0-9]+$' then v_version end,
    case when v_version ~ '^[0-9]+\.[0-9]+$' then now() end
  )
  on conflict (id) do nothing;

  if v_version ~ '^[0-9]+\.[0-9]+$' then
    insert into public.terms_acceptances (user_id, document, version)
    values (new.id, 'termeni', v_version)
    on conflict (user_id, document, version) do nothing;
  end if;

  return new;
end;
$fn$;

/**
 * What a person may not change about themselves.
 *
 * Rebased on the 20260918220000 version. Two additions: the new columns
 * are protected exactly like the ones they sit next to, and changing the
 * telephone number now clears the staff flag as well as the automatic
 * one. Without that second line, a person could get their number verified
 * by support and then edit it to somebody else's, keeping the tick.
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

  if new.terms_version_accepted is distinct from old.terms_version_accepted
     or new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'Acceptarea termenilor se înregistrează la acceptare, nu din cont'
      using errcode = '42501';
  end if;

  if new.is_test is distinct from old.is_test
     or new.phone_verified_by_staff is distinct from old.phone_verified_by_staff
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.phone_verified_by is distinct from old.phone_verified_by
     or new.email_confirmed_at is distinct from old.email_confirmed_at
     or new.email_undeliverable_at is distinct from old.email_undeliverable_at then
    raise exception 'Câmpul se schimbă doar de către echipa platformei'
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
    new.phone_verified_by_staff := false;
    new.phone_verified_at := null;
    new.phone_verified_by := null;
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Staff verifying a phone number by hand
--
-- Until there is an SMS provider this is the only route, so it is a real
-- function with a real audit row rather than a note in a runbook. The
-- reason is mandatory: „verificat" with no record of how is the same
-- claim the competitor makes, and the whole product is an argument
-- against it.
-- ---------------------------------------------------------------------
create or replace function public.staff_set_phone_verified(
  p_user uuid,
  p_verified boolean,
  p_note text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.profiles;
  v_after public.profiles;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate confirma un număr de telefon'
      using errcode = '42501';
  end if;

  if p_verified and coalesce(trim(p_note), '') = '' then
    raise exception 'Scrie cum ai confirmat numărul (ex. „sunat 20.09, a răspuns Maria Ion")'
      using errcode = '22023';
  end if;

  select * into v_before from public.profiles where id = p_user;
  if v_before.id is null then
    raise exception 'Contul % nu există', p_user using errcode = 'P0002';
  end if;

  if p_verified and not public.phone_is_on_file(p_user) then
    raise exception 'Contul nu are niciun număr de telefon de confirmat'
      using errcode = '22023';
  end if;

  update public.profiles set
    phone_verified = p_verified,
    phone_verified_by_staff = p_verified,
    phone_verified_at = case when p_verified then now() end,
    phone_verified_by = case when p_verified then auth.uid() end,
    phone_verified_note = nullif(trim(p_note), '')
  where id = p_user
  returning * into v_after;

  perform public.write_audit(
    case when p_verified then 'profile.phone_verified' else 'profile.phone_unverified' end,
    'profiles', p_user, to_jsonb(v_before), to_jsonb(v_after), nullif(trim(p_note), '')
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Marking one of our own accounts
-- ---------------------------------------------------------------------
create or replace function public.staff_set_test_account(
  p_user uuid default null,
  p_company uuid default null,
  p_is_test boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate marca un cont de test'
      using errcode = '42501';
  end if;
  if (p_user is not null)::int + (p_company is not null)::int <> 1 then
    raise exception 'Trimite exact un cont sau o firmă' using errcode = '22023';
  end if;

  if p_user is not null then
    select to_jsonb(p) into v_before from public.profiles p where p.id = p_user;
    if v_before is null then
      raise exception 'Contul % nu există', p_user using errcode = 'P0002';
    end if;
    update public.profiles set is_test = p_is_test where id = p_user
    returning to_jsonb(profiles) into v_after;
    perform public.write_audit('profile.test_flag', 'profiles', p_user, v_before, v_after, null);
  else
    select to_jsonb(c) into v_before from public.companies c where c.id = p_company;
    if v_before is null then
      raise exception 'Firma % nu există', p_company using errcode = 'P0002';
    end if;
    update public.companies set is_test = p_is_test where id = p_company
    returning to_jsonb(companies) into v_after;
    perform public.write_audit('company.test_flag', 'companies', p_company, v_before, v_after, null);
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------
-- How long a request stays on the board
--
-- Fourteen days was a number in a trigger. For a car being collected on
-- Saturday it is twelve days of a dead listing on the board; for a
-- caravan moving in spring it is far too short. The client picks, from
-- four options rather than a free number, because a board full of
-- 365-day listings is a board nobody trusts.
-- ---------------------------------------------------------------------
alter table public.cargo_listings
  add column duration_days integer not null default 14
    check (duration_days in (3, 7, 14, 30)),
  -- Set when the „expiră în trei zile" e-mail went out, so the nightly
  -- job does not send it again every night until it expires.
  add column expiry_reminded_at timestamptz;

comment on column public.cargo_listings.duration_days is
  'How long the client asked the request to stay on the board: 3, 7, 14 or 30 days. The publish guard turns it into expires_at; reopening recomputes it.';

alter table public.truck_listings
  add column duration_days integer not null default 14
    check (duration_days in (3, 7, 14, 30)),
  add column expiry_reminded_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. The publish guard
--
-- The individual branch is the whole point of this migration. What it
-- asked for before — a phone confirmed by SMS — could not be satisfied by
-- anybody, because no SMS provider is configured. What it asks for now is
-- what we can actually check today and what a carrier actually needs: an
-- address that answered our confirmation link, and a number to ring.
--
-- The company branch is unchanged, and so is the test-account rule: a
-- test account publishes normally, it is simply never counted or shown.
-- ---------------------------------------------------------------------
create or replace function public.guard_cargo_listing_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if new.company_id is null then
      if not public.email_is_confirmed(new.posted_by) then
        raise exception 'Confirmă adresa de e-mail înainte de publicare. Ți-am trimis un link când ți-ai făcut contul.'
          using errcode = '42501';
      end if;
      if not public.phone_is_on_file(new.posted_by) then
        raise exception 'Adaugă un număr de telefon în profil înainte de publicare. Transportatorul are nevoie de el ca să te sune.'
          using errcode = '42501';
      end if;
    elsif not public.company_can_act(new.company_id) then
      raise exception 'Compania nu poate publica anunțuri: cont neverificat sau suspendat'
        using errcode = '42501';
    end if;

    new.published_at := coalesce(new.published_at, now());
    -- The client's choice, when there is one. The column carries a check
    -- constraint, so the trigger does not have to repeat the list.
    new.expires_at := coalesce(
      new.expires_at,
      now() + (coalesce(new.duration_days, 14) || ' days')::interval
    );
  end if;
  return new;
end;
$fn$;

/**
 * Opening somebody's contact details.
 *
 * Rebased on the 20260916130200 version. One thing changes: the sentence
 * an individual without a verified number sees. It used to say „confirmă
 * numărul de telefon" and point at nothing, which since the SMS provider
 * was never configured meant „do something impossible". It now says who
 * to write to, because until that provider exists a person on the team
 * doing it by hand is the route.
 */
create or replace function public.consume_contact_access(
  p_user uuid,
  p_cargo_listing_id uuid,
  p_truck_listing_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_profile public.profiles;
  v_member boolean;
  v_company uuid;
  v_status listing_status;
  v_plan public.plans;
  v_used integer;
begin
  if p_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if (p_cargo_listing_id is not null)::int + (p_truck_listing_id is not null)::int <> 1 then
    raise exception 'Trimite exact un id de anunț' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user;

  select exists (select 1 from public.company_members where user_id = p_user) into v_member;

  if v_member then
    select cm.company_id into v_company
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user
      and c.verification_status = 'verified'
      and not c.is_suspended
    order by cm.created_at
    limit 1;

    if v_company is null then
      raise exception 'Cont suspendat sau neverificat. Actualizează documentele pentru a debloca contactele.'
        using errcode = '42501';
    end if;
  elsif v_profile.account_type = 'individual' then
    if not v_profile.phone_verified then
      raise exception 'Numărul tău de telefon trebuie confirmat înainte să deschizi datele de contact ale unui transportator. Scrie-ne la % și îl confirmăm noi — durează câteva minute în timpul programului.',
        coalesce((select s.support_email from public.deletion_settings s where s.id), 'contact@coridor.ro')
        using errcode = '42501';
    end if;
  else
    raise exception 'Înregistrează și verifică firma pentru a contacta parteneri' using errcode = '42501';
  end if;

  if p_cargo_listing_id is not null then
    select status into v_status from public.cargo_listings where id = p_cargo_listing_id;
  else
    select status into v_status from public.truck_listings where id = p_truck_listing_id;
  end if;
  if v_status is distinct from 'active' then
    raise exception 'Anunțul nu mai este activ' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.contact_reveals r
    where r.user_id = p_user
      and r.cargo_listing_id is not distinct from p_cargo_listing_id
      and r.truck_listing_id is not distinct from p_truck_listing_id
  ) then
    return v_company;
  end if;

  select p.* into v_plan
  from public.plans p
  where p.code = coalesce(
    (select s.plan_code from public.subscriptions s
     where s.status in ('trialing', 'active')
       and s.current_period_end > now()
       and ((v_company is not null and s.company_id = v_company)
            or (v_company is null and s.user_id = p_user))
     order by s.current_period_end desc
     limit 1),
    case when v_profile.account_type = 'individual' then 'individual' else 'free' end
  );

  if v_plan.max_contact_reveals_month is not null then
    select count(*) into v_used
    from public.contact_reveals r
    where r.user_id = p_user
      and r.created_at >= date_trunc('month', now());

    if v_used >= v_plan.max_contact_reveals_month then
      raise exception 'Ai atins limita de % contacte pe luna aceasta (plan %). Treci la un plan superior.',
        v_plan.max_contact_reveals_month, v_plan.name
        using errcode = '42501';
    end if;
  end if;

  insert into public.contact_reveals (user_id, company_id, cargo_listing_id, truck_listing_id)
  values (p_user, v_company, p_cargo_listing_id, p_truck_listing_id);

  return v_company;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The three functions that put a request on the board
--
-- Reproduced from 20260917180000 with one change each, because a merged
-- migration is never edited: the fourteen days they hardcoded become the
-- duration the client chose, and republishing clears the reminder so the
-- „expiră curând" e-mail can be sent again for the new window.
--
-- The old signature of create_cargo_request is dropped rather than left
-- beside the new one: two overloads that differ only by a defaulted
-- parameter is an ambiguity PostgREST resolves by guessing.
-- ---------------------------------------------------------------------
drop function if exists public.create_cargo_request(
  text, text, date, cargo_category, text, text, integer, boolean, service_type, uuid,
  text, text, text, text, date, boolean, boolean, boolean, boolean, text, integer,
  text, text, text, text, text[], boolean, numeric, numeric, numeric, numeric
);

create or replace function public.create_cargo_request(
  p_from_city text,
  p_to_city text,
  p_loading_from date,
  p_category cargo_category,
  p_make text,
  p_model text,
  p_year integer,
  p_is_running boolean,
  p_service_type service_type default 'pe_sens',
  p_company_id uuid default null,
  p_from_country text default 'RO',
  p_from_county text default null,
  p_to_country text default 'RO',
  p_to_county text default null,
  p_loading_to date default null,
  p_wheels_turn boolean default true,
  p_steering_works boolean default true,
  p_has_keys boolean default true,
  p_is_damaged boolean default false,
  p_damage_notes text default null,
  p_weight_kg integer default null,
  p_description text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_photo_paths text[] default '{}',
  p_publish boolean default true,
  -- Looked up from the city list on the server, never taken from the form.
  -- They feed the straight-line distance a card shows, and a number the
  -- browser chooses is a number the browser can use to make a request look
  -- nearer than it is.
  p_from_lat numeric default null,
  p_from_lng numeric default null,
  p_to_lat numeric default null,
  p_to_lng numeric default null,
  -- How long it stays on the board. The column's check constraint is
  -- the list of allowed values; nothing repeats it here.
  p_duration_days integer default 14
)
returns table (request_id uuid, request_status public.listing_status, publish_error text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_company public.companies;
  v_board listing_board;
  v_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_row public.cargo_listings;
  v_status public.listing_status;
  v_publish_error text;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_user;

  -- Who it is posted as. A company id that the caller is not a member of is
  -- refused rather than ignored: silently posting it as an individual would
  -- put somebody's work on the wrong board.
  if p_company_id is null then
    v_board := 'retur';
  else
    if not public.is_company_member(p_company_id) then
      raise exception 'Nu faci parte din firma pentru care publici cererea'
        using errcode = '42501';
    end if;
    v_board := 'curse';
  end if;

  if coalesce(trim(p_from_city), '') = '' then
    raise exception 'Scrie orașul de plecare' using errcode = '22023';
  end if;
  if coalesce(trim(p_to_city), '') = '' then
    raise exception 'Scrie orașul de destinație' using errcode = '22023';
  end if;
  if coalesce(trim(p_make), '') = '' or coalesce(trim(p_model), '') = '' then
    raise exception 'Scrie marca și modelul vehiculului' using errcode = '22023';
  end if;
  if p_year is null or p_year < 1900 or p_year > extract(year from current_date)::integer + 1 then
    raise exception 'Anul de fabricație nu pare corect' using errcode = '22023';
  end if;
  if p_loading_from is null or p_loading_from < current_date then
    raise exception 'Alege o dată de încărcare de azi înainte' using errcode = '22023';
  end if;
  if p_loading_to is not null and p_loading_to < p_loading_from then
    raise exception 'Sfârșitul intervalului este înaintea începutului' using errcode = '22023';
  end if;
  if p_weight_kg is not null and p_weight_kg <= 0 then
    raise exception 'Greutatea trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  -- The contact is what a carrier spends a reveal on, so a request without
  -- one would cost somebody a contact and give them nothing. What is typed
  -- wins; after that a firm answers on its own number rather than on
  -- whichever dispatcher happened to post, and a private person on theirs.
  if p_company_id is not null then
    select * into v_company from public.companies where id = p_company_id;
  end if;

  v_name := coalesce(nullif(trim(p_contact_name), ''),
                     nullif(v_company.display_name, ''), nullif(v_company.legal_name, ''),
                     v_profile.full_name);
  v_phone := coalesce(nullif(trim(p_contact_phone), ''),
                      nullif(v_company.contact_phone, ''), v_profile.phone);
  v_email := coalesce(nullif(trim(p_contact_email), ''),
                      nullif(v_company.contact_email, ''), v_profile.email);
  if coalesce(v_phone, '') = '' then
    raise exception 'Lasă un număr de telefon la care te poate suna transportatorul'
      using errcode = '22023';
  end if;

  insert into public.cargo_listings (
    company_id, posted_by, board, listing_kind,
    title, description, service_type,
    loading_country, loading_county, loading_city, loading_from, loading_to,
    loading_lat, loading_lng,
    unloading_country, unloading_county, unloading_city,
    unloading_lat, unloading_lng,
    weight_kg, photo_paths, status, duration_days
  ) values (
    p_company_id, v_user, v_board, 'vehicul',
    public.cargo_request_title(p_make, p_model, p_year, p_from_city, p_to_city),
    nullif(trim(p_description), ''), p_service_type,
    coalesce(nullif(trim(p_from_country), ''), 'RO'), nullif(trim(p_from_county), ''),
    trim(p_from_city), p_loading_from, p_loading_to,
    p_from_lat, p_from_lng,
    coalesce(nullif(trim(p_to_country), ''), 'RO'), nullif(trim(p_to_county), ''),
    trim(p_to_city),
    p_to_lat, p_to_lng,
    p_weight_kg, coalesce(p_photo_paths, '{}'), 'draft',
    coalesce(p_duration_days, 14)
  )
  returning id into v_id;

  insert into public.cargo_vehicle_details (
    cargo_listing_id, category, make, model, year,
    is_running, wheels_turn, steering_works, has_keys,
    is_damaged, damage_notes, weight_kg
  ) values (
    v_id, p_category, trim(p_make), trim(p_model), p_year,
    p_is_running, p_wheels_turn, p_steering_works, p_has_keys,
    p_is_damaged, nullif(trim(p_damage_notes), ''), p_weight_kg
  );

  insert into public.listing_contacts (cargo_listing_id, contact_name, contact_phone, contact_email)
  values (v_id, v_name, v_phone, v_email);

  select * into v_row from public.cargo_listings where id = v_id;
  perform public.write_audit('request.created', 'cargo_listings', v_id, null, to_jsonb(v_row));

  -- Publishing can be refused for reasons that have nothing to do with what
  -- was typed: an unconfirmed phone number, a firm still in review. Losing
  -- the whole form to that would be the worst possible answer, so the
  -- publish runs in its own subtransaction and only it is rolled back. The
  -- caller gets the draft and the sentence explaining what is left to do.
  if p_publish then
    begin
      perform public.publish_cargo_request(v_id);
    exception when others then
      v_publish_error := sqlerrm;
    end;
  end if;

  select l.status into v_status from public.cargo_listings l where l.id = v_id;
  return query select v_id, v_status, v_publish_error;
end;
$fn$;

create or replace function public.publish_cargo_request(p_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_after public.cargo_listings;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_before from public.cargo_listings where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;

  if v_before.status = 'active' then
    return v_before.status;
  end if;
  if v_before.status not in ('draft', 'expired') then
    raise exception 'O cerere % nu mai poate fi publicată', v_before.status
      using errcode = '22023';
  end if;
  if coalesce(v_before.loading_to, v_before.loading_from) < current_date then
    raise exception 'Perioada de încărcare a trecut. Alege alte date și republică cererea'
      using errcode = '22023';
  end if;

  update public.cargo_listings
  set status = 'active',
      published_at = now(),
      expires_at = now() + (v_before.duration_days || ' days')::interval,
      expiry_reminded_at = null
  where id = p_id
  returning * into v_after;

  perform public.write_audit('request.published', 'cargo_listings', p_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after.status;
end;
$fn$;

create or replace function public.reopen_cargo_request(
  p_id uuid,
  p_loading_from date,
  p_loading_to date default null
)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_after public.cargo_listings;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_before from public.cargo_listings where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;
  if v_before.status not in ('draft', 'expired', 'cancelled') then
    raise exception 'O cerere % este deja pe panou sau are un transportator ales', v_before.status
      using errcode = '22023';
  end if;
  if p_loading_from is null or p_loading_from < current_date then
    raise exception 'Alege o dată de încărcare de azi înainte' using errcode = '22023';
  end if;
  if p_loading_to is not null and p_loading_to < p_loading_from then
    raise exception 'Sfârșitul intervalului este înaintea începutului' using errcode = '22023';
  end if;

  update public.cargo_listings
  set loading_from = p_loading_from,
      loading_to = p_loading_to,
      status = 'active',
      published_at = now(),
      expires_at = now() + (v_before.duration_days || ' days')::interval,
      expiry_reminded_at = null
  where id = p_id
  returning * into v_after;

  perform public.write_audit('request.reopened', 'cargo_listings', p_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after.status;
end;
$fn$;


grant execute on function public.create_cargo_request(
  text, text, date, cargo_category, text, text, integer, boolean, service_type, uuid,
  text, text, text, text, date, boolean, boolean, boolean, boolean, text, integer,
  text, text, text, text, text[], boolean, numeric, numeric, numeric, numeric, integer
) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Keeping our own accounts out of everything public
--
-- Each of these is a `create or replace` of a view or function that
-- already existed, with one condition added. Reproduced rather than
-- edited in place, because a merged migration is never edited.
-- ---------------------------------------------------------------------

/**
 * The public request board.
 *
 * Reproduced from 20260917180000 with the test exclusion appended. The
 * join to profiles is on the poster rather than the company, because an
 * individual's request has no company and a test individual is exactly
 * the account we seed most often.
 */
create or replace view public.v_requests_public as
select
  c.id,
  d.category,
  d.make,
  d.model,
  d.year,
  d.is_running,
  c.service_type,
  c.loading_city as from_city,
  c.loading_country as from_country,
  c.unloading_city as to_city,
  c.unloading_country as to_country,
  round(
    public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
  )::integer as estimated_km,
  c.published_at,
  c.board,
  c.loading_from,
  c.loading_to,
  c.weight_kg,
  d.needs_winch,
  coalesce(array_length(c.photo_paths, 1), 0) as photo_count,
  c.loading_country = c.unloading_country as is_domestic,

  -- Appended by migration 20260918090000.
  c.loading_county as from_county,
  c.unloading_county as to_county,

  -- Appended by migration 20260920100000: when the listing comes off the
  -- board, so a card can say „mai are două zile" rather than making
  -- somebody guess. A view is only ever added to, never re-cut — Postgres
  -- refuses to drop a column from one, and every column above is somebody
  -- else's query.
  c.expires_at
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
join public.profiles p on p.id = c.posted_by
left join public.companies co on co.id = c.company_id
where c.status = 'active'
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  and coalesce(c.loading_to, c.loading_from) >= current_date
  and not p.is_test
  and not coalesce(co.is_test, false);

comment on view public.v_requests_public is
  'Active vehicle transport requests at locality level, for anon and authenticated. No notes, photos, price, contact, address or owner. Test accounts are excluded: a board that shows our own seeded rows is a board whose numbers mean nothing.';

revoke all on public.v_requests_public from public;
grant select on public.v_requests_public to anon, authenticated;

/**
 * The public departures board.
 *
 * Reproduced from 20260917150000 with the same exclusion. A departure
 * always has a company, so one join is enough.
 */
create or replace view public.v_departures_public as
select
  t.id as truck_listing_id,
  t.direction,
  t.from_country,
  t.from_county,
  t.from_city,
  t.to_country,
  t.to_county,
  t.to_city,
  t.waypoints,
  t.available_from,
  t.available_to,
  t.service_types,
  t.accepted_vehicle_types,
  t.platform_slots_total,
  coalesce(b.taken, 0)::integer as slots_taken,
  greatest(coalesce(t.platform_slots_total, 0) - coalesce(b.taken, 0), 0)::integer as slots_free,
  t.price_indicative,
  t.currency,
  t.published_at,
  t.from_country = t.to_country as is_domestic
from public.truck_listings t
join public.companies c on c.id = t.company_id
left join lateral (
  select sum(bb.slots) as taken
  from public.departure_bookings bb
  where bb.truck_listing_id = t.id
    and (bb.status = 'confirmed' or (bb.status = 'reserved' and bb.expires_at > now()))
) b on true
where t.status = 'active'
  and coalesce(t.available_to, t.available_from) >= current_date
  and not c.is_test;

revoke all on public.v_departures_public from public;
grant select on public.v_departures_public to anon, authenticated;

/**
 * The company directory.
 *
 * `v_public_companies` has a long column list that two later migrations
 * appended to. Rather than reproduce all of it a third time and risk
 * dropping a column, the exclusion goes on the table underneath: a test
 * firm simply never has a public profile.
 *
 * That is stricter than a view filter and better: it also keeps the firm
 * out of `v_public_company_routes` and `v_public_company_documents`,
 * which select from the same flag.
 */
create or replace function public.guard_test_company_not_public()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.is_test and new.public_profile_enabled then
    new.public_profile_enabled := false;
  end if;
  return new;
end;
$fn$;

create trigger companies_test_not_public
  before insert or update on public.companies
  for each row execute function public.guard_test_company_not_public();

comment on function public.guard_test_company_not_public() is
  'A firm marked as ours cannot appear in the public directory. Enforced here rather than in the view, so every view built on public_profile_enabled inherits it.';

/**
 * The three numbers on the homepage.
 *
 * Reproduced from 20260917150000 with the exclusion in all three counts.
 * These are the figures a visitor is invited to check, so a seeded firm
 * inside them is the one lie the whole product is arguing against.
 */
create or replace function public.directory_stats()
returns table (verified_companies integer, compliant_vehicles integer, listed_companies integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select count(*)::integer from public.companies c
      where c.verification_status = 'verified'
        and not c.is_suspended
        and not c.is_test
        and c.company_type in ('transport', 'both')),
    (select count(*)::integer from public.vehicles v
      join public.companies c on c.id = v.company_id
      where v.is_active and v.is_compliant
        and c.verification_status = 'verified' and not c.is_suspended
        and not c.is_test),
    (select count(*)::integer from public.v_public_companies);
$fn$;

grant execute on function public.directory_stats() to anon, authenticated;

/**
 * The homepage figures.
 *
 * Reproduced from 20260917120000. `active_total` was already clean —
 * it counts `v_requests_public`, which now excludes test rows — but the
 * total, the week and the kilometres read `cargo_listings` directly and
 * were counting ours.
 */
create or replace function public.homepage_activity()
returns table (
  published_total integer,
  published_last_7d integer,
  total_km bigint,
  active_total integer,
  daily_counts integer[],
  daily_from date
)
language sql
stable
security definer
set search_path = public
as $fn$
  with published as (
    select
      c.published_at,
      round(
        public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
      ) as km
    from public.cargo_listings c
    join public.profiles p on p.id = c.posted_by
    left join public.companies co on co.id = c.company_id
    where c.published_at is not null
      and c.listing_kind = 'vehicul'
      and c.status not in ('draft', 'cancelled')
      and not p.is_test
      and not coalesce(co.is_test, false)
  ),
  days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as d
  ),
  per_day as (
    select
      days.d,
      (select count(*)::integer from published p where p.published_at::date = days.d) as n
    from days
  )
  select
    (select count(*) from published)::integer,
    (select count(*) from published where published_at >= now() - interval '7 days')::integer,
    coalesce((select sum(km) from published), 0)::bigint,
    (select count(*) from public.v_requests_public)::integer,
    (select array_agg(per_day.n order by per_day.d) from per_day),
    (current_date - 29)::date;
$fn$;

grant execute on function public.homepage_activity() to anon, authenticated;

/**
 * „N transportatori verificați circulă pe această rută".
 *
 * Reproduced from 20260918200000 with the test exclusion. This one
 * matters more than the others: it is a number shown to a client at the
 * moment they decide whether publishing is worth the effort, and our own
 * seeded carrier inside it turns an honest encouragement into a lie.
 *
 * The same exclusion covers the saved-route alerts, because the fan-out
 * that writes them picks carriers through `company_matches_route` under
 * the same verified/not-suspended conditions.
 */
create or replace function public.count_matching_carriers_on_route(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_posted_by_company_id uuid default null
)
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
    and not c.is_test
    and c.deletion_scheduled_at is null
    and c.company_type in ('transport', 'both')
    and public.company_matches_route(
          c.id, p_loading_country, p_loading_county,
          p_unloading_country, p_unloading_county,
          p_category, p_needs_winch, p_service_type, p_posted_by_company_id);
$fn$;

-- Deliberately granted to nobody, exactly as 20260918200000 left it. The
-- browser reaches this through `preview_matching_carriers`, which is rate
-- limited; a direct grant would be an unmetered way to probe which routes
-- carriers cover, one query at a time.
revoke all on function public.count_matching_carriers_on_route(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid
) from public, anon, authenticated;

-- Our own seeded accounts, marked as what they are.
--
-- Matching on the address is a one-time migration step, not a rule: from
-- here on `staff_set_test_account` is how an account becomes ours. The
-- two domains are the ones the fixtures and the September seeds used.
update public.profiles
set is_test = true
where email ilike '%@test.ro' or email ilike '%@example.com' or email ilike '%@example.org';

update public.companies c
set is_test = true
where exists (
  select 1 from public.company_members m
  join public.profiles p on p.id = m.user_id
  where m.company_id = c.id and m.role = 'owner' and p.is_test
);

-- ---------------------------------------------------------------------
-- 5. One more scheduled job, and the screen that watches it
--
-- `job_health` is reproduced from 20260918210000 with the ninth job
-- added to both of its lists — the main query and the fallback that runs
-- where pg_cron is absent. The JOB block in rls_test.sql asserts the two
-- lists match what is scheduled, so a job added to one and not the other
-- fails the suite rather than going quietly unwatched.
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
      ('hourly-listing-cleanup', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0),
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
      ('hourly-listing-cleanup', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0), ('outbox-dispatcher', 1.0)
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
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. Nine jobs since 20260920100000 — the listing expiry reminder joined the list.';

-- ---------------------------------------------------------------------
-- Telling somebody their request is about to come off the board
--
-- Before expiry, not after. A client who finds out on Monday that the
-- request came off on Friday has already assumed nobody wanted the job.
-- Two days ahead for every duration, because a reminder on the day is
-- not a reminder, it is a notification.
-- ---------------------------------------------------------------------
create or replace function public.queue_listing_expiry_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
begin
  with due as (
    select l.id, l.posted_by, l.company_id, l.title, l.expires_at,
           coalesce(nullif(lc.contact_email, ''), p.email) as to_email
    from public.cargo_listings l
    join public.profiles p on p.id = l.posted_by
    left join public.listing_contacts lc on lc.cargo_listing_id = l.id
    where l.status = 'active'
      and l.expires_at is not null
      and l.expires_at <= p_now + interval '2 days'
      and l.expires_at > p_now
      and l.expiry_reminded_at is null
      and p.email_undeliverable_at is null
      -- Our own rows do not generate e-mail to ourselves.
      and not p.is_test
  ),
  queued as (
    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
    select 'email', 'listing_expiring_soon', d.posted_by, d.company_id, d.to_email,
           jsonb_build_object(
             'listing_title', d.title,
             'days_left', greatest(1, ceil(extract(epoch from (d.expires_at - p_now)) / 86400.0))::integer,
             'listing_id', d.id
           ),
           'listing-expiry-' || d.id::text
    from due d
    where coalesce(d.to_email, '') <> ''
    -- The dedupe index is partial, so the predicate has to be named or
    -- Postgres cannot tell which index this refers to.
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  ),
  marked as (
    update public.cargo_listings l
    set expiry_reminded_at = p_now
    where l.id in (select id from due)
    returning 1
  )
  select count(*) into v_count from queued;

  perform public.log_job_run('nightly-listing-expiry-reminders', v_count, 0,
                             jsonb_build_object('window_days', 2));
  return v_count;
end;
$fn$;

comment on function public.queue_listing_expiry_reminders(timestamptz) is
  'Queues one e-mail per active request two days before it comes off the board. expiry_reminded_at is what stops it being sent again every night; republishing clears it.';

revoke all on function public.queue_listing_expiry_reminders(timestamptz) from public;
grant execute on function public.queue_listing_expiry_reminders(timestamptz) to service_role;

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci memento-ul de expirare a anunțurilor nu este programat. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-listing-expiry-reminders', '30 2 * * *',
                        'select public.queue_listing_expiry_reminders();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Jobul există deja; îl las cum este.';
end;
$cron$;

-- ---------------------------------------------------------------------
-- 6. What the mail provider tells us back
--
-- Three things were missing: which message at the provider a row became,
-- so a support question can be answered without guessing; a record of
-- when a send last succeeded, so „neconfigurat" and „configured but
-- silent" are different answers on the admin screen; and what to do with
-- an address that will never work.
-- ---------------------------------------------------------------------
alter table public.notification_outbox
  add column provider_message_id text;

comment on column public.notification_outbox.provider_message_id is
  'The id the mail provider gave this message. The one thing that lets a bounce or a complaint be traced back to the row that caused it.';

/**
 * Finishing a claimed row.
 *
 * Reproduced from 20260918160000 with one parameter added. The old
 * three-argument form is dropped rather than left beside it: the
 * dispatcher is the only caller, it is deployed with this migration, and
 * two overloads would let a stale deployment keep writing rows with no
 * provider id and nobody notice.
 */
drop function if exists public.finish_outbox(uuid, text, text, timestamptz);

create or replace function public.finish_outbox(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_now timestamptz default now(),
  p_provider_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.notification_outbox;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Stare necunoscută pentru o notificare: %', p_status using errcode = '22023';
  end if;

  select * into v from public.notification_outbox where id = p_id;
  if v.id is null then
    raise exception 'Notificarea % nu există', p_id using errcode = 'P0002';
  end if;

  if p_status = 'sent' then
    update public.notification_outbox
    set status = 'sent', sent_at = p_now, last_error = null,
        provider_message_id = coalesce(nullif(trim(p_provider_id), ''), provider_message_id)
    where id = p_id;
    return 'sent';
  end if;

  -- Five attempts, then it stays failed and a person has to look at it.
  if v.attempts >= 5 then
    update public.notification_outbox
    set status = 'failed', last_error = left(coalesce(p_error, 'necunoscut'), 500),
        provider_message_id = coalesce(nullif(trim(p_provider_id), ''), provider_message_id)
    where id = p_id;
    return 'failed';
  end if;

  update public.notification_outbox
  set status = 'queued',
      last_error = left(coalesce(p_error, 'necunoscut'), 500),
      provider_message_id = coalesce(nullif(trim(p_provider_id), ''), provider_message_id),
      send_after = p_now + (public.outbox_backoff_minutes(v.attempts) || ' minutes')::interval
  where id = p_id;
  return 'queued';
end;
$fn$;

comment on function public.finish_outbox(uuid, text, text, timestamptz, text) is
  'Marks a claimed row sent, or queues it again with backoff until the fifth attempt. Records the provider message id either way.';

grant execute on function public.finish_outbox(uuid, text, text, timestamptz, text) to service_role;

/**
 * An address the provider says will never work.
 *
 * A hard bounce is not a retry: five more attempts at a mailbox that no
 * longer exists is five more chances to be marked a spammer. The address
 * is flagged once on the profile, every queued row for it is skipped in
 * the same breath, and the account sees a warning the next time somebody
 * signs in — because the only fix is a person changing their address.
 */
create or replace function public.flag_email_undeliverable(p_email text, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_skipped integer := 0;
begin
  if coalesce(trim(p_email), '') = '' then
    return 0;
  end if;

  update public.profiles
  set email_undeliverable_at = now(),
      email_undeliverable_reason = left(coalesce(p_reason, 'adresă respinsă de furnizor'), 300)
  where lower(email) = lower(trim(p_email));

  with skipped as (
    update public.notification_outbox
    set status = 'skipped',
        last_error = left('adresă nelivrabilă: ' || coalesce(p_reason, 'respinsă de furnizor'), 500)
    where lower(to_email) = lower(trim(p_email))
      and status in ('queued', 'sending')
    returning 1
  )
  select count(*) into v_skipped from skipped;

  return v_skipped;
end;
$fn$;

comment on function public.flag_email_undeliverable(text, text) is
  'Marks an address permanently bad and skips everything queued for it. Called by the dispatcher on a hard bounce; nothing retries afterwards.';

grant execute on function public.flag_email_undeliverable(text, text) to service_role;

/**
 * Clearing the flag, once somebody has fixed the address.
 *
 * Staff-only and audited, because it is the one action that puts a
 * previously bouncing address back in front of the provider.
 */
create or replace function public.staff_clear_email_undeliverable(p_user uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.profiles;
  v_after public.profiles;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate reactiva o adresă' using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_user;
  if v_before.id is null then
    raise exception 'Contul % nu există', p_user using errcode = 'P0002';
  end if;

  update public.profiles
  set email_undeliverable_at = null, email_undeliverable_reason = null
  where id = p_user
  returning * into v_after;

  perform public.write_audit('profile.email_reactivated', 'profiles', p_user,
                             to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$fn$;

grant execute on function public.staff_clear_email_undeliverable(uuid) to authenticated;

/**
 * When a send last worked.
 *
 * The number that separates „no provider configured" from „configured
 * and nothing has gone out in two days", which are different problems
 * with different owners.
 */
create or replace function public.mail_provider_state()
returns table (
  last_sent_at timestamptz,
  sent_24h integer,
  failed_24h integer,
  queued_now integer,
  undeliverable_addresses integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select max(o.sent_at) from public.notification_outbox o where o.channel = 'email'),
    (select count(*)::integer from public.notification_outbox o
      where o.channel = 'email' and o.status = 'sent' and o.sent_at > now() - interval '24 hours'),
    (select count(*)::integer from public.notification_outbox o
      where o.channel = 'email' and o.status in ('failed', 'skipped')
        and o.updated_at > now() - interval '24 hours'),
    (select count(*)::integer from public.notification_outbox o
      where o.channel = 'email' and o.status = 'queued'),
    (select count(*)::integer from public.profiles p where p.email_undeliverable_at is not null);
$fn$;

comment on function public.mail_provider_state() is
  'Last successful send, the last 24 hours, what is waiting, and how many addresses are permanently bad. Staff read it on /admin/notificari.';

revoke all on function public.mail_provider_state() from public;
grant execute on function public.mail_provider_state() to authenticated;

/**
 * A test e-mail, from the admin screen.
 *
 * The payload comes from the application rather than from here, because
 * the templates and their variables live in the edge function and a
 * second copy of them in SQL would drift within a week. What this
 * enforces is the part that belongs in the database: staff only, one
 * address, and an audit row — a function that can send mail to any
 * address on request is one worth recording every use of.
 */
create or replace function public.enqueue_test_notification(
  p_template text,
  p_to_email text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate trimite un e-mail de test'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_to_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Adresa de e-mail nu pare validă' using errcode = '22023';
  end if;
  if coalesce(trim(p_template), '') = '' then
    raise exception 'Alege un șablon' using errcode = '22023';
  end if;

  insert into public.notification_outbox (channel, template, recipient_user_id, to_email, payload)
  values ('email', trim(p_template), auth.uid(), trim(p_to_email),
          coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('is_test_send', true))
  returning id into v_id;

  perform public.write_audit('notification.test_send', 'notification_outbox', v_id, null,
                             jsonb_build_object('template', p_template, 'to_email', p_to_email),
                             null);
  return v_id;
end;
$fn$;

grant execute on function public.enqueue_test_notification(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Photos go when the request goes
--
-- The bucket is public and organised by uploader. Deleting the listing
-- row left the files behind, which for a photograph of somebody's car
-- and number plate is a leak with no expiry date. Account erasure
-- already collected them (`account_deletion_files`); this covers the
-- ordinary case of a person deleting one request.
-- ---------------------------------------------------------------------
create or replace function public.drop_listing_photos()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if old.photo_paths is not null and array_length(old.photo_paths, 1) > 0 then
    delete from storage.objects
    where bucket_id = 'listing-photos'
      and name = any (old.photo_paths);
  end if;
  return old;
end;
$fn$;

create trigger cargo_listings_drop_photos
  after delete on public.cargo_listings
  for each row execute function public.drop_listing_photos();

comment on function public.drop_listing_photos() is
  'Removes a request''s photographs from storage when the request row goes. A public bucket plus an orphaned path is somebody''s number plate with no owner left to ask.';

-- ---------------------------------------------------------------------
-- 8. The pilot dashboard
--
-- The exit criterion — 20 verified carriers and 5 forwarders using the
-- platform weekly, without us in the loop — has been written down since
-- the roadmap and readable nowhere. Two functions, both staff-only, both
-- excluding our own accounts, because a criterion measured on seeded
-- rows is a criterion nobody has met.
--
-- „Active in a week" is defined here, once, so the screen and any later
-- report cannot disagree: the firm published, opened a contact, booked a
-- seat, or somebody from it signed in.
-- ---------------------------------------------------------------------
create or replace function public.pilot_weekly_activity(
  p_from date default (current_date - 55),
  p_to date default current_date
)
returns table (
  week_start date,
  active_carriers integer,
  active_forwarders integer,
  requests_published integer,
  departures_published integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  with weeks as (
    select generate_series(
      date_trunc('week', p_from::timestamptz),
      date_trunc('week', p_to::timestamptz),
      interval '1 week'
    )::date as week_start
  ),
  -- Every company action that counts as "used the platform", with the
  -- week it happened in. One union rather than four subqueries so the
  -- definition lives in exactly one place.
  actions as (
    select l.company_id, date_trunc('week', l.published_at)::date as week_start
      from public.cargo_listings l where l.company_id is not null and l.published_at is not null
    union all
    select t.company_id, date_trunc('week', t.published_at)::date
      from public.truck_listings t where t.published_at is not null
    union all
    select r.company_id, date_trunc('week', r.created_at)::date
      from public.contact_reveals r where r.company_id is not null
    union all
    -- A booking is activity for both ends of it: the carrier whose
    -- departure got one, and the firm whose request took the seat.
    select t.company_id, date_trunc('week', b.created_at)::date
      from public.departure_bookings b
      join public.truck_listings t on t.id = b.truck_listing_id
    union all
    select cl.company_id, date_trunc('week', b.created_at)::date
      from public.departure_bookings b
      join public.cargo_listings cl on cl.id = b.cargo_listing_id
      where cl.company_id is not null
    union all
    select m.company_id, date_trunc('week', p.last_seen_at)::date
      from public.company_members m
      join public.profiles p on p.id = m.user_id
      where p.last_seen_at is not null and not p.is_test
  ),
  live as (
    select a.company_id, a.week_start, c.company_type
    from actions a
    join public.companies c on c.id = a.company_id
    where not c.is_test
      and c.verification_status = 'verified'
      and not c.is_suspended
  )
  select
    w.week_start,
    (select count(distinct l.company_id)::integer from live l
      where l.week_start = w.week_start and l.company_type in ('transport', 'both')),
    (select count(distinct l.company_id)::integer from live l
      where l.week_start = w.week_start and l.company_type in ('expeditie', 'both')),
    (select count(*)::integer from public.cargo_listings cl
      join public.profiles pr on pr.id = cl.posted_by
      left join public.companies co on co.id = cl.company_id
      where cl.published_at is not null
        and date_trunc('week', cl.published_at)::date = w.week_start
        and not pr.is_test and not coalesce(co.is_test, false)),
    (select count(*)::integer from public.truck_listings tl
      join public.companies co on co.id = tl.company_id
      where tl.published_at is not null
        and date_trunc('week', tl.published_at)::date = w.week_start
        and not co.is_test)
  from weeks w
  order by w.week_start;
$fn$;

create or replace function public.pilot_overview(
  p_from date default (current_date - 55),
  p_to date default current_date
)
returns table (
  verified_carriers integer,
  verified_forwarders integer,
  carriers_weekly integer,
  forwarders_weekly integer,
  carriers_target integer,
  forwarders_target integer,
  documents_pending integer,
  oldest_pending_hours numeric,
  notifications_failed_24h integer,
  median_hours_to_first_contact numeric,
  staff_interventions integer
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
  with latest as (
    select * from public.pilot_weekly_activity(p_from, p_to)
    order by week_start desc limit 1
  ),
  -- How long a client waits between publishing and the first carrier
  -- opening their details. The closest thing to „did the platform do
  -- anything for them" that exists before offers are built.
  first_contact as (
    select l.id,
           extract(epoch from (min(r.created_at) - l.published_at)) / 3600.0 as hours
    from public.cargo_listings l
    join public.contact_reveals r on r.cargo_listing_id = l.id
    join public.profiles p on p.id = l.posted_by
    left join public.companies co on co.id = l.company_id
    where l.published_at is not null
      and l.published_at::date between p_from and p_to
      and not p.is_test
      and not coalesce(co.is_test, false)
    group by l.id, l.published_at
  )
  select
    (select count(*)::integer from public.companies c
      where c.verification_status = 'verified' and not c.is_suspended and not c.is_test
        and c.company_type in ('transport', 'both')),
    (select count(*)::integer from public.companies c
      where c.verification_status = 'verified' and not c.is_suspended and not c.is_test
        and c.company_type in ('expeditie', 'both')),
    coalesce((select active_carriers from latest), 0),
    coalesce((select active_forwarders from latest), 0),
    20, 5,
    (select count(*)::integer from public.documents d
      join public.companies c on c.id = d.company_id
      where d.status = 'pending' and not c.is_test),
    (select round(extract(epoch from (now() - min(d.created_at))) / 3600.0, 1)
      from public.documents d
      join public.companies c on c.id = d.company_id
      where d.status = 'pending' and not c.is_test),
    (select count(*)::integer from public.notification_outbox o
      where o.status in ('failed', 'skipped') and o.updated_at > now() - interval '24 hours'),
    (select round(percentile_cont(0.5) within group (order by fc.hours)::numeric, 1)
      from first_contact fc),
    -- „Without us in the loop": everything staff did that was not
    -- approving a document, which is the one intervention the model
    -- expects for ever.
    (select count(*)::integer from public.audit_log a
      where a.actor_role = 'staff'
        and a.created_at::date between p_from and p_to
        and a.action not like 'document.%');
end;
$fn$;

comment on function public.pilot_overview(date, date) is
  'The two exit criteria and what stands between us and them, with our own accounts excluded. 20 verified carriers and 5 forwarders active weekly is the target the roadmap set.';

revoke all on function public.pilot_weekly_activity(date, date) from public;
revoke all on function public.pilot_overview(date, date) from public;
grant execute on function public.pilot_weekly_activity(date, date) to authenticated;
grant execute on function public.pilot_overview(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Grants for everything else new here
--
-- Default privileges grant EXECUTE to nobody (20260916130300), so each
-- function is named for exactly the roles that call it. The two guards
-- and the auth mirror are trigger functions and go to nobody at all.
-- ---------------------------------------------------------------------
grant execute on function public.staff_set_phone_verified(uuid, boolean, text) to authenticated;
grant execute on function public.staff_set_test_account(uuid, uuid, boolean) to authenticated;
