-- =====================================================================
-- 0030 - Which version of the terms somebody agreed to, and when
--
-- The documents live in the repository, under `src/content/legal/`, with
-- a version and a date on each. That is deliberate: a legal text is
-- content under review, it belongs in git next to the diff that changed
-- it, and the previous version has to stay readable — „what did I agree
-- to in September" is the whole question a consent record exists to
-- answer.
--
-- What the database holds is the other half: who accepted which version
-- and when. Two places, on purpose.
--
--   * `profiles.terms_version_accepted` is the current state. The account
--     area compares it with the version in the repository and, when they
--     differ, asks again before anything else happens.
--   * `terms_acceptances` is the history. A single column would be
--     overwritten by the next acceptance, and „they accepted v2" is not
--     evidence that they ever saw v1.
--
-- Neither is writable from a browser. Consent that the person consenting
-- can forge is not evidence of anything.
-- =====================================================================

alter table public.profiles add column terms_version_accepted text;

comment on column public.profiles.terms_version_accepted is
  'The version of the terms this account last accepted. Compared with the version in src/content/legal; a mismatch asks again.';

create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 'termeni' today. Kept general because a data-processing agreement
  -- for firms is the obvious next document to need its own acceptance.
  document text not null default 'termeni'
    check (document in ('termeni', 'confidentialitate', 'cookies', 'dpa')),
  version text not null check (version ~ '^[0-9]+\.[0-9]+$'),
  accepted_at timestamptz not null default now()
);

comment on table public.terms_acceptances is
  'One row per person per document per version. The history, not the state: a single column would be overwritten, and „they accepted v2" is not evidence they ever saw v1.';

-- Accepting the same version twice is the same fact, not a second one.
create unique index terms_acceptances_once
  on public.terms_acceptances (user_id, document, version);
create index terms_acceptances_user_idx
  on public.terms_acceptances (user_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

create policy "terms_acceptances_select_own_or_staff" on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

/**
 * The profile columns are not the account's to set.
 *
 * `terms_accepted_at` has been writable from the browser since
 * 20260916120000 — a person could have backdated their own consent, or
 * set it without ever seeing the document. It joins the protected list
 * here along with the new version column, and `accept_terms` below
 * becomes the only way either of them changes.
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

/**
 * Recording an acceptance.
 *
 * The version comes from the caller because the document it names lives
 * in the application, not here — but it is checked against a shape, so a
 * blank or a sentence cannot be stored as a version. What the database
 * refuses to do is invent one: there is no default, and no path that
 * writes „accepted" without a version to point at.
 */
create or replace function public.accept_terms(
  p_version text,
  p_document text default 'termeni'
)
returns public.terms_acceptances
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.terms_acceptances;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[0-9]+\.[0-9]+$' then
    raise exception 'Versiune de document invalidă' using errcode = '22023';
  end if;

  insert into public.terms_acceptances (user_id, document, version)
  values (auth.uid(), coalesce(p_document, 'termeni'), p_version)
  on conflict (user_id, document, version) do update
    set accepted_at = public.terms_acceptances.accepted_at
  returning * into v_row;

  if v_row.document = 'termeni' then
    update public.profiles
    set terms_version_accepted = p_version,
        terms_accepted_at = coalesce(terms_accepted_at, now())
    where id = auth.uid();
  end if;

  perform public.write_audit('account.terms_accepted', 'profile', auth.uid(), null,
    jsonb_build_object('document', v_row.document, 'version', p_version));

  return v_row;
end;
$fn$;

comment on function public.accept_terms(text, text) is
  'The only way an acceptance is recorded. Re-accepting the same version keeps the first timestamp: that is when they agreed.';

grant execute on function public.accept_terms(text, text) to authenticated;

/**
 * Sign-up carries the version it showed.
 *
 * The version travels in `raw_user_meta_data` because the profile does
 * not exist until this trigger runs. It is set by the server action that
 * rendered the checkbox, never by the form — a browser that could choose
 * the version could accept a document nobody has published.
 *
 * A signup without one is not refused: the account area asks on the next
 * page load, which is the same path an existing account takes when the
 * terms change.
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
  insert into public.profiles (id, email, full_name, phone, account_type,
                               terms_version_accepted, terms_accepted_at)
  values (
    new.id,
    new.email,
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
