-- =====================================================================
-- Web push: subscriptions, preferences, and the rules about when not to
--
-- The queue in migration 20260916120600 already allows `push` as a
-- channel and already dedupes by key. What was missing is everything
-- around it: where a browser's subscription lives, which types a person
-- wants on which channel, and — the half that decides whether any of this
-- survives contact with users — when *not* to send.
--
-- Three rules shape the file.
--
-- 1. **A notification nobody can turn off is a notification that gets the
--    whole channel turned off.** So every type is switchable, with two
--    exceptions written into the data rather than into a screen: being
--    suspended and being reactivated stay on for in-app and e-mail,
--    because they are the two messages that explain why the account
--    stopped working.
-- 2. **Push goes only where there is somewhere to land.** A type carries
--    the route its notification opens, and a type with no screen behind
--    it is marked unavailable and never queued. A push that opens a 404
--    is worse than no push: it spends the one tap a person gives you.
-- 3. **Keys are not staff business.** A subscription row carries the two
--    secrets that let anyone send to that browser. The policy is the
--    user's own rows and nothing else — no admin bypass — and the counts
--    staff need come from an aggregate function that returns numbers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- What a browser gave us
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  user_id uuid not null references public.profiles (id) on delete cascade,

  -- The endpoint is the identity of a subscription: the same browser
  -- re-subscribing returns the same one, and a different browser on the
  -- same machine returns a different one.
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,

  -- For the "this device" line on the settings screen. Trimmed on the way
  -- in: a full user-agent string is a fingerprint, and all the screen
  -- needs is something a person recognises.
  user_agent text check (user_agent is null or length(user_agent) <= 200),
  platform text check (platform is null or length(platform) <= 40),

  last_seen_at timestamptz not null default now(),
  -- The last thing the push service said, without the endpoint in it.
  last_error text check (last_error is null or length(last_error) <= 200),
  -- Set when the push service says the subscription is gone (404/410).
  -- The row is kept rather than deleted so the settings screen can say
  -- "acest dispozitiv nu mai primește" instead of quietly showing nothing.
  disabled_at timestamptz
);

comment on table public.push_subscriptions is
  'One row per browser that accepted notifications. Carries the keys that let anyone send to it, so the policy is the owner and nobody else — staff counts come from push_subscription_stats().';

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where disabled_at is null;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- No `or is_platform_admin()`. That is the point of this policy.
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

/**
 * How many browsers are subscribed, for the staff screen.
 *
 * An aggregate rather than a policy exception: a count answers the
 * question staff actually have ("is anybody using this?") and a row
 * answers a question nobody should be able to ask.
 */
create or replace function public.push_subscription_stats()
returns table (total integer, active integer, users integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    count(*)::integer,
    count(*) filter (where disabled_at is null)::integer,
    count(distinct user_id) filter (where disabled_at is null)::integer
  from public.push_subscriptions;
$fn$;

comment on function public.push_subscription_stats() is
  'Counts only. Staff may know how many browsers are subscribed and may not read the keys that would let them send to one.';

-- ---------------------------------------------------------------------
-- The catalogue of what we send
--
-- A table rather than an enum, because each type carries behaviour: which
-- channels it defaults to, whether it can be switched off, whether it
-- waits for quiet hours, and — the one that keeps push honest — the route
-- it opens. A type with `is_available = false` has no screen behind it
-- yet and is never queued on any channel.
-- ---------------------------------------------------------------------
create table public.notification_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  label_ro text not null,
  description_ro text,
  -- Which audience sees it on the settings screen.
  audience text not null check (audience in ('carrier', 'client', 'both')),

  default_inapp boolean not null default true,
  default_email boolean not null default true,
  default_push boolean not null default false,

  -- Cannot be switched off on in-app and e-mail. Push still follows the
  -- preference: a person who turned push off everywhere did so on purpose,
  -- and overriding that is how an app gets its notifications revoked at
  -- the operating system.
  is_mandatory boolean not null default false,

  -- Delivered during quiet hours anyway. Reserved for the messages that
  -- explain why something stopped working.
  bypasses_quiet_hours boolean not null default false,

  -- Where the notification opens. `{id}` is substituted from the payload.
  deep_link text not null,

  -- False when there is no screen behind it yet. Such a type is listed
  -- here so the preference survives the day the screen lands, and is
  -- never queued until then.
  is_available boolean not null default true,
  sort_order integer not null default 100
);

comment on table public.notification_types is
  'Every kind of notification, with the channels it defaults to and the route it opens. A type with is_available = false has no screen yet and is never queued.';
comment on column public.notification_types.is_mandatory is
  'In-app and e-mail cannot be switched off. Push still follows the preference — overriding that is how an app gets notifications revoked at the operating system.';

create trigger notification_types_set_updated_at
  before update on public.notification_types
  for each row execute function public.set_updated_at();

alter table public.notification_types enable row level security;

create policy "notification_types_read_all" on public.notification_types
  for select to authenticated using (true);

revoke all on public.notification_types from anon, authenticated;
grant select on public.notification_types to authenticated;

-- ---------------------------------------------------------------------
-- What a person changed about the defaults
--
-- Overrides, not a row per person per type. A table seeded on sign-up
-- would need a backfill today and a second one the day a type is added,
-- and a person who never opened the screen would own rows describing
-- choices they never made. Absence means "the default", and the default
-- lives with the type.
-- ---------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.notification_types (code) on delete cascade,
  inapp boolean,
  email boolean,
  push boolean,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

comment on table public.notification_preferences is
  'Only the deviations from the type defaults. A null column means "whatever the type says", so a default changed later reaches everybody who never touched it.';

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy "notification_preferences_own" on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

/**
 * A mandatory type cannot be switched off on in-app or e-mail.
 *
 * Enforced here rather than by leaving the control off a screen: the
 * screen is a convenience and the table is reachable through PostgREST by
 * the row's own owner, which the policy above deliberately allows.
 */
create or replace function public.guard_notification_preference()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_type public.notification_types;
begin
  select * into v_type from public.notification_types where code = new.type;
  if v_type.code is null then
    raise exception 'Tipul de notificare nu există' using errcode = 'P0002';
  end if;

  if v_type.is_mandatory and (new.inapp = false or new.email = false) then
    raise exception 'Notificările despre starea contului nu pot fi oprite în aplicație sau pe e-mail'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger notification_preferences_guard
  before insert or update on public.notification_preferences
  for each row execute function public.guard_notification_preference();

-- ---------------------------------------------------------------------
-- Quiet hours and how many is too many
--
-- Both per person, both with a default that applies to everybody who
-- never opened the screen. Times are stored as local wall-clock in
-- Europe/Bucharest and compared in that zone, so 22:00 stays 22:00 on
-- both sides of the March and October changes rather than drifting by an
-- hour twice a year.
-- ---------------------------------------------------------------------
create table public.notification_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  quiet_hours_enabled boolean not null default true,
  quiet_from time not null default '22:00',
  quiet_to time not null default '07:00',

  -- Beyond this, the rest of the hour is folded into one digest. The
  -- alternative is a person turning the channel off at the operating
  -- system, which we never get back.
  max_push_per_hour integer not null default 10
    check (max_push_per_hour between 1 and 100)
);

comment on table public.notification_settings is
  'Per-person quiet hours and hourly push cap. A row is written the first time somebody changes something; everybody else runs on the column defaults.';
comment on column public.notification_settings.quiet_from is
  'Local wall-clock in Europe/Bucharest. Compared in that zone, so 22:00 is 22:00 on both sides of the daylight-saving changes.';

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;

create policy "notification_settings_own" on public.notification_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update, delete on public.notification_settings to authenticated;

-- ---------------------------------------------------------------------
-- The catalogue
--
-- Only types that have both a producer and a screen are available. The
-- rest are listed with `is_available = false` so a preference set today
-- survives the day the screen lands — and are never queued until then.
-- ---------------------------------------------------------------------
insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  -- Carrier, available.
  ('request_match', 'Cerere nouă potrivită',
   'O cerere care se potrivește cu acoperirea și dotările firmei tale.',
   'carrier', true, false, false, '/cereri/{id}', true, 10),
  ('booking_to_confirm', 'Rezervare de confirmat',
   'Cineva a rezervat un loc pe unul dintre traseele tale.',
   'carrier', true, false, true, '/cont/trasee', true, 20),
  ('booking_expiring', 'Rezervare care expiră',
   'O rezervare neconfirmată se eliberează în curând.',
   'carrier', true, false, true, '/cont/trasee', true, 30),
  ('document_expiry', 'Document care expiră',
   'Un document obligatoriu al firmei sau al unui vehicul se apropie de expirare.',
   'carrier', true, false, false, '/cont/firma/documente', true, 40),
  ('company_verified', 'Firmă verificată',
   'Verificarea firmei s-a încheiat.',
   'carrier', true, false, false, '/cont/firma', true, 50),
  ('company_suspended', 'Cont suspendat',
   'Firma a fost suspendată. Nu poate fi oprită în aplicație și pe e-mail.',
   'carrier', true, true, true, '/cont/firma', true, 60),
  ('company_reactivated', 'Cont reactivat',
   'Firma a revenit în funcțiune. Nu poate fi oprită în aplicație și pe e-mail.',
   'carrier', true, true, true, '/cont/firma', true, 70),
  ('company_invitation', 'Invitație într-o firmă',
   'Cineva te-a invitat în contul unei firme.',
   'both', false, false, false, '/cont/invitatii', true, 80),
  ('subscription_activated', 'Abonament activat',
   'Abonamentul firmei a fost activat sau prelungit.',
   'carrier', false, false, false, '/cont/abonament', true, 90),

  -- Listed and unavailable: the tables exist, the screens do not. A push
  -- that opens a 404 spends the one tap a person gives you, so these stay
  -- off every channel until `/cont/oferte` and `/cont/mesaje` exist. The
  -- preferences a person sets meanwhile survive.
  ('offer_received', 'Ofertă nouă la cererea ta', null,
   'client', false, false, false, '/cont/cereri', false, 100),
  ('offer_accepted', 'Ofertă acceptată', null,
   'both', false, false, false, '/cont/cereri', false, 110),
  ('offer_rejected', 'Ofertă refuzată', null,
   'carrier', false, false, false, '/cont/cereri', false, 120),
  ('order_status_changed', 'Schimbare de stare a comenzii', null,
   'both', false, false, true, '/cont/cereri', false, 130),
  ('message_received', 'Mesaj nou', null,
   'both', false, false, false, '/cont/cereri', false, 140);

-- ---------------------------------------------------------------------
-- Is this channel on, for this person, for this type
--
-- The override when there is one, the type's default when there is not,
-- and `false` for a type with no screen behind it whatever anybody set.
-- One function, so no caller can get the precedence wrong.
-- ---------------------------------------------------------------------
create or replace function public.notification_channel_enabled(
  p_user_id uuid,
  p_type text,
  p_channel text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  t public.notification_types;
  p public.notification_preferences;
begin
  select * into t from public.notification_types where code = p_type;
  if t.code is null or not t.is_available then
    return false;
  end if;

  select * into p from public.notification_preferences
   where user_id = p_user_id and type = p_type;

  return case p_channel
    when 'inapp' then
      -- A mandatory type ignores the override on these two channels; the
      -- trigger refuses to store one, and this is the second answer in
      -- case a row predates the trigger.
      case when t.is_mandatory then true else coalesce(p.inapp, t.default_inapp) end
    when 'email' then
      case when t.is_mandatory then true else coalesce(p.email, t.default_email) end
    when 'push' then coalesce(p.push, t.default_push)
    else false
  end;
end;
$fn$;

comment on function public.notification_channel_enabled(uuid, text, text) is
  'The override, else the type default, and always false for a type with no screen behind it. One place, so no caller gets the precedence wrong.';

-- ---------------------------------------------------------------------
-- When a push may actually leave
--
-- Returns the moment it should be sent: now, or the end of quiet hours.
--
-- Quiet hours are compared in Europe/Bucharest rather than in UTC, which
-- is the whole reason this is a function and not an expression. Romania
-- is UTC+2 in winter and UTC+3 in summer; a comparison done in UTC sends
-- at 21:00 local for half the year and nobody notices until somebody's
-- telephone goes off during dinner in April.
--
-- A window that wraps midnight (22:00–07:00, which is the default and
-- most of the real ones) is the case an hour comparison gets wrong, so it
-- is handled explicitly rather than with a BETWEEN.
-- ---------------------------------------------------------------------
create or replace function public.push_send_after(
  p_user_id uuid,
  p_type text,
  p_now timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  s public.notification_settings;
  t public.notification_types;
  v_local timestamp;
  v_time time;
  v_quiet boolean;
  v_next timestamp;
begin
  select * into t from public.notification_types where code = p_type;
  if t.bypasses_quiet_hours then
    return p_now;
  end if;

  select * into s from public.notification_settings where user_id = p_user_id;
  -- No row means the defaults, which are the column defaults above.
  if s.user_id is null then
    s.quiet_hours_enabled := true;
    s.quiet_from := '22:00';
    s.quiet_to := '07:00';
  end if;

  if not s.quiet_hours_enabled or s.quiet_from = s.quiet_to then
    return p_now;
  end if;

  v_local := p_now at time zone 'Europe/Bucharest';
  v_time := v_local::time;

  v_quiet := case
    -- Wraps midnight: quiet from 22:00 to 07:00 means late evening OR
    -- early morning, which a BETWEEN reads as the empty set.
    when s.quiet_from > s.quiet_to then v_time >= s.quiet_from or v_time < s.quiet_to
    else v_time >= s.quiet_from and v_time < s.quiet_to
  end;

  if not v_quiet then
    return p_now;
  end if;

  -- The next occurrence of the end of quiet hours, in local time, turned
  -- back into an instant. `at time zone` on a naive timestamp resolves it
  -- in that zone, which is what makes the March jump land correctly.
  v_next := date_trunc('day', v_local) + s.quiet_to;
  if v_next <= v_local then
    v_next := v_next + interval '1 day';
  end if;

  return v_next at time zone 'Europe/Bucharest';
end;
$fn$;

comment on function public.push_send_after(uuid, text, timestamptz) is
  'Now, or the end of quiet hours, compared in Europe/Bucharest. A UTC comparison would send at 21:00 local for half the year.';

-- ---------------------------------------------------------------------
-- How many have already gone out this hour
-- ---------------------------------------------------------------------
create or replace function public.push_sent_last_hour(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
  from public.notification_outbox
  where channel = 'push'
    and recipient_user_id = p_user_id
    and created_at > p_now - interval '1 hour'
    and status <> 'skipped';
$fn$;

-- ---------------------------------------------------------------------
-- Queue a push, or decide not to
--
-- The single entry point. Everything that wants to push calls this, so
-- the preference, the quiet hours, the cap and the dedupe are applied in
-- one place rather than in each producer — which is how a channel ends up
-- respecting preferences in four places out of five.
--
-- Returns the id of the queued row, or null when nothing was queued. A
-- null is a normal outcome and not an error: the person turned it off,
-- the type has no screen, or they have had enough this hour.
-- ---------------------------------------------------------------------
create or replace function public.queue_push(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  t public.notification_types;
  s public.notification_settings;
  v_cap integer;
  v_sent integer;
  v_id uuid;
  v_link text;
begin
  if p_user_id is null then
    return null;
  end if;

  select * into t from public.notification_types where code = p_type;
  if t.code is null or not t.is_available then
    return null;
  end if;

  if not public.notification_channel_enabled(p_user_id, p_type, 'push') then
    return null;
  end if;

  -- Nothing to send to. A row queued for a person with no browser
  -- subscribed would sit in the outbox failing forever.
  if not exists (
    select 1 from public.push_subscriptions
    where user_id = p_user_id and disabled_at is null
  ) then
    return null;
  end if;

  select * into s from public.notification_settings where user_id = p_user_id;
  v_cap := coalesce(s.max_push_per_hour, 10);
  v_sent := public.push_sent_last_hour(p_user_id, p_now);

  -- Over the cap: one digest row for the hour instead, deduped so the
  -- eleventh, twelfth and thirtieth all fold into it. The person gets
  -- "3 cereri noi pe traseele tale" rather than thirty buzzes and a
  -- disabled channel.
  if v_sent >= v_cap then
    insert into public.notification_outbox
      (channel, template, recipient_user_id, payload, send_after, dedupe_key)
    values (
      'push', 'push_digest', p_user_id,
      jsonb_build_object('type', p_type, 'deep_link', '/cont'),
      public.push_send_after(p_user_id, p_type, p_now),
      'push_digest:' || p_user_id || ':' || to_char(p_now at time zone 'Europe/Bucharest', 'YYYY-MM-DD-HH24')
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
    return v_id;
  end if;

  v_link := replace(t.deep_link, '{id}', coalesce(p_payload ->> 'id', ''));

  insert into public.notification_outbox
    (channel, template, recipient_user_id, payload, send_after, dedupe_key)
  values (
    'push', p_type, p_user_id,
    p_payload
      || jsonb_build_object('title', p_title, 'body', p_body, 'deep_link', v_link)
      -- The tag is what makes a second notification of the same kind
      -- replace the first on the device instead of stacking.
      || jsonb_build_object('tag', p_type),
    public.push_send_after(p_user_id, p_type, p_now),
    p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.queue_push(uuid, text, text, text, jsonb, text, timestamptz) is
  'The only way a push is queued. Applies the preference, the quiet hours, the hourly cap and the dedupe in one place. Returns null when nothing was queued, which is a normal outcome.';

/**
 * The same, for a notification addressed to a firm.
 *
 * The outbox addresses companies; push subscriptions belong to browsers,
 * which belong to people. So a company event fans out to its members —
 * and the dedupe key gains the user id, because one key shared by five
 * members would deliver to exactly one of them.
 */
create or replace function public.queue_push_for_company(
  p_company_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_member record;
  v_count integer := 0;
begin
  for v_member in
    select user_id from public.company_members
    where company_id = p_company_id and role in ('owner', 'admin', 'dispatcher')
  loop
    if public.queue_push(
         v_member.user_id, p_type, p_title, p_body, p_payload,
         case when p_dedupe_key is null then null
              else p_dedupe_key || ':' || v_member.user_id end,
         p_now
       ) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$fn$;

comment on function public.queue_push_for_company(uuid, text, text, text, jsonb, text, timestamptz) is
  'Fans a firm''s notification out to its members. Drivers are left out: none of the available types is theirs to act on.';

-- Triggers and jobs, so nobody calls these by hand.
-- The settings screen reads it for the toggles; the jobs read it before
-- queueing anything.
grant execute on function public.notification_channel_enabled(uuid, text, text) to authenticated, service_role;
grant execute on function public.push_subscription_stats() to authenticated;

/**
 * "Trimite o notificare de test", from the settings screen.
 *
 * It goes through `queue_push` like everything else rather than writing
 * an outbox row directly — a test that takes a different path is a test
 * that passes while the real thing is broken. It ignores quiet hours and
 * the cap, because somebody who just pressed the button is awake and
 * expecting it, and it says so on screen.
 */
create or replace function public.send_test_push()
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.push_subscriptions
    where user_id = v_user and disabled_at is null
  ) then
    raise exception 'Nu ai activat notificările pe niciun dispozitiv'
      using errcode = '22023';
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_user_id, payload, dedupe_key)
  values (
    'push', 'push_test', v_user,
    jsonb_build_object(
      'title', 'Notificare de test',
      'body', 'Dacă vezi asta, notificările funcționează pe acest dispozitiv.',
      'deep_link', '/cont/setari/notificari',
      'tag', 'push_test'
    ),
    'push_test:' || v_user || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.send_test_push() is
  'A test push for the person who asked for it. Ignores quiet hours and the cap — they just pressed the button — and the screen says so.';

grant execute on function public.send_test_push() to authenticated;
-- The producers below run inside triggers, which need no grant. The jobs
-- that drain and retry the queue run as service_role.
grant execute on function public.queue_push(uuid, text, text, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.queue_push_for_company(uuid, text, text, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.push_send_after(uuid, text, timestamptz) to service_role;
grant execute on function public.push_sent_last_hour(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- What the dispatcher calls
--
-- Claiming is a separate statement from sending on purpose: two runs that
-- overlap must not pick up the same rows, and `for update skip locked` is
-- the only way to say that which does not depend on the two runs being
-- polite to each other.
-- ---------------------------------------------------------------------
create or replace function public.claim_push_batch(p_limit integer default 50)
returns table (
  id uuid,
  template text,
  recipient_user_id uuid,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  update public.notification_outbox o
  set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select x.id from public.notification_outbox x
    where x.channel = 'push'
      and x.status = 'queued'
      and x.send_after <= now()
    order by x.send_after
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  returning o.id, o.template, o.recipient_user_id, o.payload, o.attempts;
end;
$fn$;

comment on function public.claim_push_batch(integer) is
  'Claims a batch and marks it sending, with `for update skip locked` so two overlapping runs cannot take the same rows.';

create or replace function public.finish_push(
  p_id uuid,
  p_status text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'Stare necunoscută: %', p_status using errcode = '22023';
  end if;

  update public.notification_outbox
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else sent_at end,
      last_error = left(p_error, 200)
  where id = p_id;
end;
$fn$;

/**
 * Back into the queue, later.
 *
 * `send_after` moves rather than the row being retried immediately: a
 * push service that returned 503 is still returning 503 a millisecond
 * later, and the only thing a tight loop achieves is being rate-limited
 * as well as broken.
 */
create or replace function public.retry_push(
  p_id uuid,
  p_after_seconds integer,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.notification_outbox
  set status = 'queued',
      send_after = now() + make_interval(secs => greatest(1, p_after_seconds)),
      last_error = left(p_error, 200)
  where id = p_id;
end;
$fn$;

grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.finish_push(uuid, text, text) to service_role;
grant execute on function public.retry_push(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------
-- The schedule
--
-- Added to the jobs that already exist rather than given a mechanism of
-- its own. Every two minutes: a notification that arrives two minutes
-- late is still a notification, and a minute-by-minute job that finds
-- nothing 95% of the time is a minute-by-minute job somebody eventually
-- turns off.
--
-- The dispatcher is an HTTP function, so pg_cron cannot call it directly
-- the way it calls the sweep. n8n's `outbox-dispatcher` already polls on a
-- schedule and is where this belongs; this block only registers the
-- database-side cleanup of rows nothing will ever deliver.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_push()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  -- A push nobody collected within a day is a push about something that
  -- has already happened. Delivering it late is worse than not at all.
  update public.notification_outbox
  set status = 'skipped', last_error = 'expired before delivery'
  where channel = 'push'
    and status in ('queued', 'sending')
    and created_at < now() - interval '1 day';

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

grant execute on function public.expire_stale_push() to service_role;

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not enabled - enable it, then run the cron.schedule call in this file.';
    return;
  end if;

  perform cron.schedule('hourly-push-cleanup', '25 * * * *',
                        'select public.expire_stale_push();');
exception when duplicate_object or unique_violation then
  raise notice 'Cron job already scheduled, leaving it as it is.';
end;
$cron$;
