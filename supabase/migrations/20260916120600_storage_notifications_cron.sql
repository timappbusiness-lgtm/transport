-- =====================================================================
-- 0007 - Storage buckets, the notification outbox and scheduled jobs
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage
-- 'documents'  - private. Licences, ITP, RCA, conform copies.
-- 'listing-photos' - public. Photos of the cargo or the truck.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('listing-photos', 'listing-photos', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Convention: documents are stored at  <company_id>/<document_id>.<ext>
-- so the first path segment is the tenant key used by these policies.
-- Casting a storage path segment straight to uuid would raise on any object
-- whose first folder is not a uuid, and an error inside an RLS policy blocks
-- every read of the table - not just that row. Postgres happens to evaluate
-- the bucket_id check first today, but that is a planner choice, not a
-- guarantee, so the cast is made total instead of relying on it.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $fn$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$fn$;

create policy "documents_read_own_company" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_platform_admin()
      or public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "documents_insert_own_company" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "documents_update_own_company" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'documents'
    and public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "documents_delete_own_company" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_platform_admin()
      or public.is_company_manager(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Listing photos: world-readable, writable by the uploader's folder (= user id).
create policy "listing_photos_read_all" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'listing-photos');

create policy "listing_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
  );

-- ---------------------------------------------------------------------
-- notification_outbox - n8n polls or is pushed from here.
-- Keeping an outbox table (instead of calling Twilio from Postgres)
-- makes every message retryable and auditable.
-- ---------------------------------------------------------------------
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push', 'inapp')),
  template text not null,
  recipient_user_id uuid references public.profiles (id) on delete cascade,
  recipient_company_id uuid references public.companies (id) on delete cascade,
  to_email text,
  to_phone text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  -- Prevents sending the same reminder twice for the same document/day.
  dedupe_key text
);

create unique index notification_outbox_dedupe on public.notification_outbox (dedupe_key)
  where dedupe_key is not null;
create index notification_outbox_queue_idx on public.notification_outbox (status, send_after)
  where status = 'queued';

create trigger notification_outbox_set_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

alter table public.notification_outbox enable row level security;

create policy "outbox_select_own_or_admin" on public.notification_outbox
  for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or (recipient_company_id is not null and public.is_company_member(recipient_company_id))
    or public.is_platform_admin()
  );
create policy "outbox_insert_admin" on public.notification_outbox
  for insert to authenticated with check (public.is_platform_admin());
create policy "outbox_update_admin" on public.notification_outbox
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "outbox_delete_admin" on public.notification_outbox
  for delete to authenticated using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- Expiry reminders. Queues one message per (document, milestone).
-- ---------------------------------------------------------------------
create or replace function public.queue_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_queued integer;
begin
  with due as (
    select
      d.id as document_id,
      d.company_id,
      d.kind,
      d.valid_until,
      (d.valid_until - current_date) as days_left,
      r.label_ro,
      v.plate_number,
      c.contact_email,
      c.contact_phone,
      c.legal_name
    from public.documents d
    join public.document_requirements r on r.scope = d.scope and r.kind = d.kind
    join public.companies c on c.id = d.company_id
    left join public.vehicles v on v.id = d.vehicle_id
    where d.status = 'approved'
      and d.valid_until is not null
      and (d.valid_until - current_date) = any (r.reminder_days)
  )
  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, to_phone, payload, dedupe_key)
  select
    'email',
    'document_expiry_reminder',
    due.company_id,
    due.contact_email,
    due.contact_phone,
    jsonb_build_object(
      'company_name', due.legal_name,
      'document_kind', due.kind,
      'document_label', due.label_ro,
      'plate_number', due.plate_number,
      'valid_until', due.valid_until,
      'days_left', due.days_left
    ),
    'expiry:' || due.document_id || ':' || due.days_left
  from due
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$fn$;

-- Tell a company the moment it gets suspended.
create or replace function public.notify_on_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.is_suspended and not old.is_suspended then
    insert into public.notification_outbox
      (channel, template, recipient_company_id, to_email, to_phone, payload, dedupe_key)
    values (
      'email', 'account_suspended', new.id, new.contact_email, new.contact_phone,
      jsonb_build_object('company_name', new.legal_name, 'reason', new.suspension_reason),
      'suspended:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD')
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  elsif old.is_suspended and not new.is_suspended then
    insert into public.notification_outbox
      (channel, template, recipient_company_id, to_email, to_phone, payload, dedupe_key)
    values (
      'email', 'account_reactivated', new.id, new.contact_email, new.contact_phone,
      jsonb_build_object('company_name', new.legal_name),
      'reactivated:' || new.id || ':' || to_char(now(), 'YYYY-MM-DD')
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$fn$;

create trigger companies_notify_suspension
  after update of is_suspended on public.companies
  for each row execute function public.notify_on_suspension();

-- ---------------------------------------------------------------------
-- Housekeeping: expire listings that nobody closed.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer := 0;
  v_n integer;
begin
  update public.cargo_listings
  set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.truck_listings
  set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.cargo_listings set is_promoted = false
  where is_promoted and promoted_until is not null and promoted_until < now();
  update public.truck_listings set is_promoted = false
  where is_promoted and promoted_until is not null and promoted_until < now();

  return v_total;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Schedule. Requires the pg_cron extension (Dashboard > Database >
-- Extensions > pg_cron). Times are UTC: 02:00 UTC = 05:00 Europe/Bucharest
-- in summer, 04:00 in winter - early enough that reminders land before
-- the working day either way.
-- ---------------------------------------------------------------------
-- Enable pg_cron first: Dashboard > Database > Extensions > pg_cron.
-- It is not created here because pg_cron must be present in
-- shared_preload_libraries, which is a project-level setting; a CREATE
-- EXTENSION that cannot succeed would abort this whole migration.
--
-- Wrapped so the file can be re-applied: cron.schedule upserts by job name on
-- pg_cron 1.4+, and older versions raise on a duplicate name.
do $cron$
begin
  if to_regproc('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not enabled - enable it in the Dashboard, then run the three cron.schedule calls in this file.';
    return;
  end if;

  perform cron.schedule('nightly-compliance-sweep', '0 2 * * *',
                        'select public.run_compliance_sweep();');
  perform cron.schedule('nightly-expiry-reminders', '15 2 * * *',
                        'select public.queue_expiry_reminders();');
  perform cron.schedule('hourly-listing-cleanup', '5 * * * *',
                        'select public.expire_stale_listings();');
exception when duplicate_object or unique_violation then
  raise notice 'Cron jobs already scheduled, leaving them as they are.';
end;
$cron$;
