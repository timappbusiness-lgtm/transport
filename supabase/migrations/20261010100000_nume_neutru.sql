-- =====================================================================
-- Numele platformei, scos din baza de date
--
-- Numele nu este hotărât. El trăiește într-un singur loc,
-- `src/config/brand.ts`, iar baza nu îl poate citi de acolo — deci nu
-- trebuie să îl conțină deloc. Patru locuri vii îl mai scriau de mână;
-- o verificare din `supabase/tests/smoke_test.sql` le caută pe toate, cu
-- numele citit din `brand.ts` de `scripts/db-test.sh`:
--
--   1. `consume_contact_access`: când adresa de suport nu era setată,
--      eroarea trimitea oamenii la o adresă pe un domeniu ghicit din
--      nume, care nu este al nostru. Acum îi trimite la pagina Contact.
--   2. `assisted_handover_summary`: numele echipei, când omul care a făcut
--      înscrierea nu și-a completat numele. Întoarce șir gol, iar
--      aplicația scrie „echipa" urmat de `BRAND_NAME`.
--   3. Comentariul schemei `public`.
--   4. Paginile de rute din `seo_pages`: titlul se termina cu „| nume",
--      iar layout-ul adaugă numele încă o dată, deci fiecare pagină avea
--      titlul „… | nume — nume". Iar două întrebări din FAQ îl scriau în
--      text. `replace` atinge doar exact aceste fragmente, așa că un text
--      rescris între timp din /admin/pagini rămâne cum este.
--
-- Pe lângă migrările deja aplicate, fișierul acesta este singurul care
-- mai conține numele, tocmai ca să îl poată înlocui.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Deschiderea contactelor: nicio adresă ghicită
--
-- Corpul este cel din 20260922100000_faza2_oferte.sql, neschimbat în
-- afară de mesajul pentru telefonul neconfirmat. `create or replace`
-- păstrează proprietarul și granturile.
-- ---------------------------------------------------------------------
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

  select cm.company_id into v_company
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = p_user
    and c.verification_status = 'verified'
    and not c.is_suspended
  order by cm.created_at
  limit 1;

  -- The two parties to an agreed order, before anything else: no plan,
  -- no allowance, and no requirement that the listing still be active.
  if public.has_agreed_order(p_user, p_cargo_listing_id, p_truck_listing_id) then
    insert into public.contact_reveals
      (user_id, company_id, cargo_listing_id, truck_listing_id, reason)
    select p_user, v_company, p_cargo_listing_id, p_truck_listing_id,
           public.reveal_reason_order()
    where not exists (
      select 1 from public.contact_reveals r
      where r.user_id = p_user
        and r.cargo_listing_id is not distinct from p_cargo_listing_id
        and r.truck_listing_id is not distinct from p_truck_listing_id
        and r.reason = public.reveal_reason_order()
    );
    return v_company;
  end if;

  select exists (select 1 from public.company_members where user_id = p_user) into v_member;

  if v_member then
    if v_company is null then
      raise exception 'Cont suspendat sau neverificat. Actualizează documentele pentru a debloca contactele.'
        using errcode = '42501';
    end if;
  elsif v_profile.account_type = 'individual' then
    if not v_profile.phone_verified then
      raise exception 'Numărul tău de telefon trebuie confirmat înainte să deschizi datele de contact ale unui transportator. Scrie-ne % și îl confirmăm noi — durează câteva minute în timpul programului.',
        coalesce('la ' || nullif(btrim((select s.support_email from public.deletion_settings s where s.id)), ''),
                 'din pagina Contact')
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
    -- A reveal the platform gave away does not spend the allowance.
    select count(*) into v_used
    from public.contact_reveals r
    where r.user_id = p_user
      and r.created_at >= date_trunc('month', now())
      and r.reason is distinct from public.reveal_reason_order();

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
-- 2. Rezumatul predării: fără nume de echipă scris aici
-- ---------------------------------------------------------------------
create or replace function public.assisted_handover_summary(p_company_id uuid)
returns table (
  claimed_at timestamptz,
  staff_name text,
  documents_count integer,
  vehicles_count integer,
  has_coverage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (public.is_company_member(p_company_id) or public.is_platform_admin()) then
    raise exception 'Nu ai acces la firma aceasta' using errcode = '42501';
  end if;

  return query
  select
    a.claimed_at,
    -- Gol când omul din echipă nu are nume: bannerul scrie atunci
    -- „echipa" urmat de numele platformei, din `BRAND_NAME`.
    coalesce(btrim(p.full_name), ''),
    (select count(*)::integer from public.documents d where d.company_id = a.company_id),
    (select count(*)::integer from public.vehicles v where v.company_id = a.company_id),
    (c.coverage_counties <> '{}' or c.services <> '{}' or c.equipment <> '{}')
  from public.assisted_onboardings a
  join public.companies c on c.id = a.company_id
  left join public.profiles p on p.id = a.staff_user_id
  where a.company_id = p_company_id and a.status = 'revendicat';
end;
$fn$;

revoke all on function public.assisted_handover_summary(uuid) from public;
grant execute on function public.assisted_handover_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Comentariul schemei
-- ---------------------------------------------------------------------
comment on schema public is
  'Granturile sunt explicite: anon nu are drept de scriere pe nimic, nici pe tabele, nici pe vederi, iar implicitul nu i-l mai dă.';

-- ---------------------------------------------------------------------
-- 4. Paginile de rute
-- ---------------------------------------------------------------------
update public.seo_pages
set title = regexp_replace(title, '\s*\|\s*Coridor\s*$', '')
where title ~ '\|\s*Coridor\s*$';

update public.seo_pages
set faq = replace(
      replace(faq::text, 'Coridor este locul unde vă găsiți', 'Platforma este locul unde vă găsiți'),
      'Fiecare firmă de pe Coridor are', 'Fiecare firmă de pe platformă are'
    )::jsonb
where faq::text like '%Coridor este locul unde vă găsiți%'
   or faq::text like '%Fiecare firmă de pe Coridor are%';
