-- =====================================================================
-- Ciorne de formular, pe server
--
-- A form that is half filled in has to be there again after a refresh, a
-- trip through sign-in, a closed tab — and, once there is an account, on
-- the other device. The browser keeps a copy (`localStorage`, three days);
-- this table keeps the one that follows the person, and whichever copy was
-- saved last is the one the form resumes from.
--
-- A draft is not a state transition. Nothing reads it except the form that
-- wrote it, for the person who wrote it: no status, no approval, no
-- ownership changes hands. So the owner writes it directly, under RLS, and
-- the database's part is to make sure that is all anybody can do with it:
--
--   * only one's own rows, in every direction;
--   * only the forms that keep drafts (`form_key`), only a short scope,
--     only a step name — never free text in a key;
--   * a payload that is an object and at most 32 KB, so the table cannot
--     be used as free storage;
--   * a month, after which a draft is invisible to its owner and deleted
--     by the nightly retention job.
--
-- A draft can hold contact details, so it is personal data and follows the
-- rules for it: removed with the account (the foreign key cascades from
-- `profiles`, which cascades from `auth.users`), included in the data
-- export, and not kept past its month.
-- =====================================================================

create table public.form_drafts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  form_key text not null,
  -- Separates two drafts of the same form: an offer on one request and an
  -- offer on another. Empty for forms there is only ever one of.
  scope text not null default '',
  step text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, form_key, scope),
  constraint form_drafts_form_key check (
    form_key in ('cerere', 'traseu', 'oferta', 'vehicul', 'firma', 'inscriere-asistata')
  ),
  constraint form_drafts_scope check (scope ~ '^[a-z0-9-]{0,64}$'),
  constraint form_drafts_step check (step is null or step ~ '^[a-z0-9-]{1,32}$'),
  constraint form_drafts_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint form_drafts_payload_size check (pg_column_size(payload) <= 32768)
);

comment on table public.form_drafts is
  'A half-filled form, kept for the person who filled it so a refresh, a sign-in or another device does not make them start again. Owner-only under RLS; a month at most.';

create trigger form_drafts_set_updated_at
  before update on public.form_drafts
  for each row execute function public.set_updated_at();

alter table public.form_drafts enable row level security;

-- One's own drafts, and only those still in their month. An older one is
-- not shown even before the nightly job removes it: a draft from last
-- season is not something to resume.
create policy form_drafts_select_own on public.form_drafts
  for select to authenticated
  using (user_id = auth.uid() and updated_at > now() - interval '30 days');

create policy form_drafts_insert_own on public.form_drafts
  for insert to authenticated
  with check (user_id = auth.uid());

create policy form_drafts_update_own on public.form_drafts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy form_drafts_delete_own on public.form_drafts
  for delete to authenticated
  using (user_id = auth.uid());

-- Two things have to go wrong, not one: no grant at all for `anon`, and
-- for `authenticated` exactly the four verbs the policies above govern.
revoke all on public.form_drafts from anon, authenticated;
grant select, insert, update, delete on public.form_drafts to authenticated;

-- ---------------------------------------------------------------------
-- Retention: the nightly job removes drafts past their month
--
-- The job already exists (`nightly-retention`, 02:40) and already logs one
-- line a night; drafts join it rather than adding a job that would have to
-- be scheduled, watched by `job_health()` and pinned in the JOB block of
-- the RLS suite. Same function, same signature, same return value: the
-- count of contact reveals, as before. The drafts it removes go in the
-- log line's detail.
-- ---------------------------------------------------------------------
create or replace function public.purge_contact_reveals(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_months integer;
  v_deleted integer;
  v_drafts integer;
begin
  select contact_reveal_months into v_months from public.deletion_settings where id;
  v_months := coalesce(v_months, 24);

  delete from public.contact_reveals
  where created_at < p_now - (v_months || ' months')::interval;
  get diagnostics v_deleted = row_count;

  delete from public.form_drafts
  where updated_at < p_now - interval '30 days';
  get diagnostics v_drafts = row_count;

  -- Logged even when it deletes nothing. A retention job that only
  -- reports on the days it finds something looks identical, on every
  -- other day, to a retention job that stopped running.
  perform public.log_job_run('nightly-retention', v_deleted + v_drafts, 0,
    jsonb_build_object('contact_reveals_deleted', v_deleted, 'months', v_months,
                       'form_drafts_deleted', v_drafts));

  return v_deleted;
end;
$fn$;

comment on function public.purge_contact_reveals(timestamptz) is
  'Nightly retention: deletes contact-reveal rows past the period in deletion_settings, and form drafts older than 30 days. Returns the number of contact reveals deleted.';

revoke all on function public.purge_contact_reveals(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_contact_reveals(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- The data export includes the drafts
--
-- Everything we hold about a person, as the function has always promised.
-- The body is the one from 20260918180000 with one key added at the end.
-- ---------------------------------------------------------------------
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
         or i.invited_email = lower((select email from public.profiles where id = v_uid))),
    'ciorne', (select coalesce(jsonb_agg(jsonb_build_object(
        'formular', d.form_key, 'pas', d.step, 'continut', d.payload,
        'salvata_la', d.updated_at) order by d.updated_at desc), '[]'::jsonb)
      from public.form_drafts d where d.user_id = v_uid)
  );
end;
$fn$;

comment on function public.my_data_export() is
  'Everything we hold about the caller, as one JSON object — form drafts included. Reads by auth.uid(), so there is no version of it that exports somebody else.';

revoke all on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated;
