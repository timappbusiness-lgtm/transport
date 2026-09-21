-- =====================================================================
-- Ce a găsit auditul de securitate
--
-- Patru constatări din `docs/12-audit-securitate.md`, reparate aici:
-- C1 (pozele anunțurilor, public și enumerabile), R1 (directorul de
-- firme servit lui anon), R4 (dovezile comenzii care nu se pot șterge
-- niciodată) și M1/M2 (două gărzi care nu rulează niciodată).
--
-- Firul comun al ultimelor trei: `current_user` într-o funcție
-- SECURITY DEFINER este **proprietarul funcției**, niciodată apelantul.
-- Este a treia oară când clasa asta de bug apare în proiect, așa că
-- reparația nu este „altă condiție pe current_user", ci convenția pe
-- care o foloseam deja într-un singur loc — un flag de sesiune pus de
-- cine are voie, citit de gardă.
-- =====================================================================

-- ---------------------------------------------------------------------
-- C1. Pozele anunțurilor nu mai sunt publice, nici enumerabile
--
-- Bucketul era `public = true` și politica de citire era numai
-- `bucket_id = 'listing-photos'`. `select` pe `storage.objects` este
-- API-ul de listare, deci oricine cu cheia anon cerea lista întreagă,
-- iar calea începe cu id-ul celui care a încărcat — pozele se grupau pe
-- om. Cererile private au poze, deci tot ce ține o cerere privată
-- privată se ocolea cerând poza direct din storage.
-- ---------------------------------------------------------------------
update storage.buckets set public = false where id = 'listing-photos';

/**
 * Cine are voie să vadă o poză de anunț.
 *
 * Trei răspunsuri: cine a încărcat-o, echipa, și cine are voie să vadă
 * anunțul pe care stă. Ultimul este scris pe loc, nu prin
 * `can_see_listing()`, ca să nu fie nevoie să dăm funcția aceea și lui
 * `anon` — o poză de pe un anunț public se vede de pe panou, fără cont.
 *
 * `auth.uid()` înăuntrul unei funcții SECURITY DEFINER este tot
 * apelantul: vine din JWT, nu din rolul de execuție. Numai
 * `current_user` este proprietarul.
 */
create or replace function public.can_see_listing_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (storage.foldername(p_path))[1] = auth.uid()::text
    or public.is_platform_admin()
    or exists (
      select 1 from public.cargo_listings c
      where p_path = any(c.photo_paths)
        and c.status = 'active'
        and c.hidden_at is null
        and (
          c.visibility = 'publica'
          or c.posted_by = auth.uid()
          or (c.company_id is not null and public.is_company_member(c.company_id))
          or public.is_invited_to_listing(c.id)
        )
    );
$fn$;

comment on function public.can_see_listing_photo(text) is
  'Poza unui anunț: a ta, a echipei, sau a unui anunț pe care ai voie să îl vezi.';

revoke all on function public.can_see_listing_photo(text) from public;
grant execute on function public.can_see_listing_photo(text) to anon, authenticated;

drop policy if exists "listing_photos_read_all" on storage.objects;
create policy "listing_photos_read_visible" on storage.objects
  for select to authenticated, anon
  using (
    bucket_id = 'listing-photos'
    and public.can_see_listing_photo(name)
  );

-- ---------------------------------------------------------------------
-- R1. Directorul de firme nu se mai dă lui anon
--
-- Comentariul vederii spune „what any **logged-in** user may see", dar
-- grantul o dădea și lui `anon`. Vederea este `security_invoker = off`
-- și filtrează doar după starea de verificare: nu se uită la
-- `public_profile_enabled`, deci servea și firmele care au bifat
-- explicit „nu vreau profil public".
--
-- Două schimbări. Grantul lui `anon` dispare — pagina care o folosește
-- (`/trasee/[id]`) o citește numai pentru vizitatori autentificați, așa
-- cum spune și comentariul ei. Și `trust_score` și `is_suspended` ies
-- din ea: sunt semnale interne de moderare, nu date despre firmă.
-- `v_public_companies` rămâne vederea pentru cine chiar nu are cont.
--
-- `create or replace view` nu poate scoate coloane, deci se lasă și se
-- reface; grantul se pune la loc explicit după.
-- ---------------------------------------------------------------------
drop view if exists public.v_companies_public;

create view public.v_companies_public as
select
  c.id,
  coalesce(c.display_name, c.legal_name) as name,
  c.cui,
  c.county,
  c.city,
  c.country,
  c.company_type,
  c.verification_status,
  c.rating_avg,
  c.rating_count,
  c.created_at as member_since
from public.companies c
where c.verification_status in ('verified', 'suspended');

comment on view public.v_companies_public is
  'Ce vede un utilizator autentificat despre o firmă. NU se dă lui anon: '
  'pentru vizitatori fără cont există v_public_companies, care respectă '
  'public_profile_enabled. Fără trust_score și is_suspended — sunt semnale '
  'interne de moderare.';

revoke all on public.v_companies_public from public, anon;
grant select on public.v_companies_public to authenticated;

-- ---------------------------------------------------------------------
-- R4. Dovezile comenzii se pot șterge, dar numai de un job
--
-- Garda era `if current_user = 'service_role' then return ...`, într-o
-- funcție SECURITY DEFINER. `current_user` este acolo proprietarul
-- funcției, deci portița nu se deschidea niciodată și garda se aplica
-- inclusiv joburilor. Rezultatul: o poză de la predare-primire — mașina,
-- numărul, uneori oameni — nu putea fi ștearsă de nimeni, niciodată,
-- deci ștergerea la cerere nu se putea duce până la capăt.
--
-- Flagul de sesiune este convenția care exista deja, la
-- `purge_audit_log` / `app.audit_retention`. Îl pune numai funcția de
-- mai jos, care este a lui `service_role`.
-- ---------------------------------------------------------------------
create or replace function public.guard_order_evidence_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Nu `current_user`: acolo scrie proprietarul funcției. Flagul îl pune
  -- `purge_order_evidence()`, și numai ea.
  if current_setting('app.evidence_retention', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Dovezile unei comenzi nu se șterg' using errcode = '42501';
  end if;

  if to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
     is distinct from
     to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason' then
    raise exception 'Dovezile unei comenzi nu se modifică' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

/**
 * Șterge dovezile unei comenzi, pentru retenție și pentru ștergerea la
 * cerere.
 *
 * Singurul drum prin gardă. Este a lui `service_role`: niciun cont de
 * om nu o poate chema, oricât de multe drepturi ar avea în aplicație.
 */
create or replace function public.purge_order_evidence(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_paths text[];
  v_deleted integer;
begin
  select array_agg(file_path) into v_paths
  from public.order_evidence where order_id = p_order_id;

  perform set_config('app.evidence_retention', 'on', true);

  delete from public.order_evidence where order_id = p_order_id;
  get diagnostics v_deleted = row_count;

  if v_paths is not null then
    delete from storage.objects
    where bucket_id = 'order-evidence' and name = any(v_paths);
  end if;

  perform set_config('app.evidence_retention', 'off', true);
  return coalesce(v_deleted, 0);
end;
$fn$;

comment on function public.purge_order_evidence(uuid) is
  'Șterge dovezile unei comenzi și fișierele lor. Singurul drum prin '
  'guard_order_evidence_immutable(). Numai service_role.';

revoke all on function public.purge_order_evidence(uuid) from public, anon, authenticated;
grant execute on function public.purge_order_evidence(uuid) to service_role;

-- ---------------------------------------------------------------------
-- M1, M2. Cele două gărzi de pe evaluări, repuse în funcțiune
--
-- Amândouă începeau cu `current_user not in ('authenticated', 'anon')`,
-- care într-o funcție SECURITY DEFINER este întotdeauna adevărat. Se
-- întorceau imediat, deci regula nu exista. RLS refuza oricum scrierea
-- directă — dar a doua plasă care nu există este exact felul în care o
-- migrare viitoare o deschide în tăcere.
--
-- Același flag de sesiune. `edit_rating()` și `post_rating()` îl pun,
-- pentru că ele au deja verificările care contează (autorul, o singură
-- dată, în fereastră); moderarea trece fără flag, pentru că se vede din
-- ce coloane s-au schimbat.
-- ---------------------------------------------------------------------
create or replace function public.guard_rating_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_moderation_only boolean;
begin
  if current_setting('app.rating_write', true) = 'on' then
    return new;
  end if;

  v_moderation_only :=
    to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
    is not distinct from
    to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason';

  if v_moderation_only then
    return new;
  end if;

  raise exception 'Evaluarea se corectează din pagina ei, o singură dată, în primele ore'
    using errcode = '42501';
end;
$fn$;

create or replace function public.guard_rating_reply_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_setting('app.rating_write', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Un răspuns publicat nu se șterge' using errcode = '42501';
  end if;

  if to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
     is distinct from
     to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason' then
    raise exception 'Un răspuns publicat nu se modifică' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

/**
 * Corectarea unei evaluări, cu flagul pus în jurul scrierii.
 *
 * Reprodusă din 20260924100000, identică în afară de cele două linii de
 * `set_config`. Funcția avea deja verificările care contează — autorul,
 * o singură dată, în fereastra de corectare — iar garda le-ar fi
 * refuzat scrierea odată repusă în funcțiune, pentru că ea schimbă nota
 * și comentariul, nu doar câmpurile de moderare.
 */
create or replace function public.edit_rating(
  p_rating_id uuid,
  p_score integer,
  p_punctuality integer default null,
  p_communication integer default null,
  p_vehicle_care integer default null,
  p_info_accuracy integer default null,
  p_handover_availability integer default null,
  p_comment text default null
)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.ratings;
  v_after public.ratings;
  v_hours integer;
begin
  select * into v_before from public.ratings where id = p_rating_id;
  if v_before.id is null then
    raise exception 'Evaluarea nu există' using errcode = 'P0002';
  end if;
  if v_before.rater_user_id <> auth.uid() then
    raise exception 'Doar autorul își poate corecta evaluarea' using errcode = '42501';
  end if;
  if v_before.edited_at is not null then
    raise exception 'Ai corectat deja evaluarea o dată' using errcode = '42501';
  end if;

  select edit_hours into v_hours from public.rating_settings where id;
  if now() > v_before.created_at + make_interval(hours => v_hours) then
    raise exception 'Evaluarea nu se mai poate corecta' using errcode = '42501';
  end if;

  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'Nota generală este între 1 și 5' using errcode = '22023';
  end if;
  if length(coalesce(p_comment, '')) > 500 then
    raise exception 'Comentariul are cel mult 500 de caractere' using errcode = '22023';
  end if;

  perform set_config('app.rating_write', 'on', true);

  update public.ratings
  set score = p_score,
      punctuality = p_punctuality,
      communication = p_communication,
      vehicle_care = case when v_before.vehicle_care is not null or p_vehicle_care is not null
                          then p_vehicle_care end,
      info_accuracy = case when v_before.info_accuracy is not null or p_info_accuracy is not null
                           then p_info_accuracy end,
      handover_availability = case when v_before.handover_availability is not null
                                        or p_handover_availability is not null
                                   then p_handover_availability end,
      comment = nullif(trim(coalesce(p_comment, '')), ''),
      edited_at = now()
  where id = p_rating_id
  returning * into v_after;

  perform set_config('app.rating_write', 'off', true);

  perform public.recompute_company_reputation(v_after.rated_company_id);
  perform public.write_audit('rating.edited', 'ratings', p_rating_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$fn$;

revoke all on function public.edit_rating(uuid, integer, integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.edit_rating(uuid, integer, integer, integer, integer, integer, integer, text) to authenticated;
