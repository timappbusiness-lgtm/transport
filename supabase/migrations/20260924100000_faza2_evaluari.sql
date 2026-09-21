-- =====================================================================
-- Faza 2 — evaluări și reputație calculată
--
-- Fazele 8 din docs/04-roadmap.md. Ce exista deja: o tabelă `ratings`
-- din faza 0, un trigger care refuză o evaluare înainte de livrare, și
-- două coloane pe `companies` care țineau media. Ce lipsea este tot
-- restul: fereastra în care se poate evalua, ce se întâmplă după 48 de
-- ore, răspunsul firmei evaluate, ascunderea de către echipă, și —
-- partea care contează cel mai mult — o reputație pe care nimeni nu o
-- tastează.
--
-- Trei lucruri stau la baza fișierului:
--
--   1. Nimeni nu scrie direct în `ratings`. Politica de INSERT a fost
--      ștearsă; singura ușă este `post_rating()`. Triggerul de gardă
--      rămâne dedesubt, pentru că o ușă se poate deschide greșit mâine
--      și atunci regula trebuie să fie tot acolo.
--   2. Reputația este derivată, niciodată introdusă. Fiecare număr de pe
--      profilul public are o formulă în fișierul ăsta și aceeași formulă
--      în docs/02-data-model.md. Un număr fără formulă nu se afișează.
--   3. Conturile de test și evaluările ascunse nu intră în nimic public.
--      Nu sunt filtrate la afișare, ci la calcul — un agregat corect
--      dintr-un loc greșit se strecoară în al doilea loc care îl citește.
--
-- Conflicte cu schema de dinainte, rezolvate aici și explicate acolo
-- unde sunt rezolvate: sub-scorurile cerute nu sunt cele existente, iar
-- `guard_rating_insert()` accepta stări mai largi decât trebuie.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Butoanele
--
-- Fiecare prag din brief este o setare, nu o constantă în cod: pragul de
-- trei evaluări sub care nu arătăm nicio medie este o decizie de produs,
-- și o decizie de produs care cere un deploy ca să se schimbe este o
-- decizie pe care nimeni nu o mai schimbă.
-- ---------------------------------------------------------------------
create table public.rating_settings (
  id boolean primary key default true check (id),

  /** Câte zile după finalizare se mai poate evalua. */
  window_days integer not null default 14 check (window_days between 1 and 180),
  /** Cât timp după trimitere autorul își mai poate corecta evaluarea, o singură dată. */
  edit_hours integer not null default 48 check (edit_hours between 1 and 720),
  /** Sub câte evaluări nu se arată nicio medie public. */
  min_public_ratings integer not null default 3 check (min_public_ratings between 1 and 50),

  /** Câte zile de întârziere nu se numără ca întârziere. */
  punctuality_grace_days integer not null default 1 check (punctuality_grace_days between 0 and 14),
  /** Sub câte comenzi încheiate nu se arată punctualitatea. */
  min_punctuality_orders integer not null default 3 check (min_punctuality_orders between 1 and 50),

  /** În câte ore un răspuns mai contează ca răspuns. */
  response_window_hours integer not null default 24 check (response_window_hours between 1 and 168),
  /** Pe câte zile în urmă se uită rata de răspuns. */
  response_lookback_days integer not null default 90 check (response_lookback_days between 7 and 730),
  /** Sub câte cereri potrivite nu se arată rata de răspuns. */
  min_response_sample integer not null default 5 check (min_response_sample between 1 and 100),

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.rating_settings is
  'Pragurile reputației. Fiecare este citit de exact o formulă, iar formula este scrisă în docs/02-data-model.md cu același nume.';

insert into public.rating_settings (id) values (true) on conflict (id) do nothing;

alter table public.rating_settings enable row level security;

-- Citibilă de oricine este autentificat: pagina comenzii scrie termenul
-- limită, iar un termen pe care nimeni nu îl poate citi nu este un
-- termen, este o surpriză.
create policy "rating_settings_read" on public.rating_settings
  for select to authenticated using (true);

create or replace function public.set_rating_settings(
  p_window_days integer default null,
  p_edit_hours integer default null,
  p_min_public_ratings integer default null,
  p_punctuality_grace_days integer default null,
  p_min_punctuality_orders integer default null,
  p_response_window_hours integer default null,
  p_response_lookback_days integer default null,
  p_min_response_sample integer default null
)
returns public.rating_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.rating_settings;
  v_after public.rating_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările evaluărilor' using errcode = '42501';
  end if;

  select * into v_before from public.rating_settings where id;
  update public.rating_settings
  set window_days = coalesce(p_window_days, window_days),
      edit_hours = coalesce(p_edit_hours, edit_hours),
      min_public_ratings = coalesce(p_min_public_ratings, min_public_ratings),
      punctuality_grace_days = coalesce(p_punctuality_grace_days, punctuality_grace_days),
      min_punctuality_orders = coalesce(p_min_punctuality_orders, min_punctuality_orders),
      response_window_hours = coalesce(p_response_window_hours, response_window_hours),
      response_lookback_days = coalesce(p_response_lookback_days, response_lookback_days),
      min_response_sample = coalesce(p_min_response_sample, min_response_sample),
      updated_at = now(),
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit('rating_settings.updated', 'rating_settings', null,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$fn$;

grant execute on function public.set_rating_settings(
  integer, integer, integer, integer, integer, integer, integer, integer
) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Ce mai poartă o evaluare
--
-- Conflict cu schema de dinainte, rezolvat prin adăugare: tabela avea
-- `punctuality`, `communication` și `payment`. Primele două sunt exact
-- ce trebuie; a treia nu descrie niciuna dintre cele două părți din
-- brieful ăsta. Nu se redenumește și nu se șterge — CLAUDE.md interzice
-- amândouă, și pe bună dreptate: o coloană ștearsă ia cu ea rândurile
-- care o foloseau. `payment` rămâne citibilă pentru rândurile vechi și
-- nu mai este scrisă de nimeni.
--
-- Cele trei noi sunt pe părți diferite ale aceleiași comenzi:
-- `vehicle_care` este despre transportator, celelalte două despre
-- client. Un singur set de coloane pentru amândouă ar fi însemnat să
-- întrebăm un client cât de bine a avut grijă de vehicul.
-- ---------------------------------------------------------------------
alter table public.ratings
  add column vehicle_care integer check (vehicle_care between 1 and 5),
  add column info_accuracy integer check (info_accuracy between 1 and 5),
  add column handover_availability integer check (handover_availability between 1 and 5),

  /** Adevărat când comanda a trecut printr-o dispută închisă de echipă. */
  add column after_dispute boolean not null default false,

  /** Când a fost corectată, o singură dată, în fereastra de editare. */
  add column edited_at timestamptz,

  /** Adevărat când mask_contacts() a rescris comentariul la intrare. */
  add column was_masked boolean not null default false,

  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  add column hidden_reason text;

comment on column public.ratings.payment is
  'Sub-scor din faza 0, nescris din 20260924100000. Rămâne pentru rândurile care îl au; formularul nu îl mai cere.';
comment on column public.ratings.vehicle_care is
  'Grija față de vehicul. Se cere doar clientului, despre transportator.';
comment on column public.ratings.info_accuracy is
  'Corectitudinea informațiilor din cerere. Se cere doar transportatorului, despre client.';
comment on column public.ratings.handover_availability is
  'Disponibilitatea la predare. Se cere doar transportatorului, despre client.';
comment on column public.ratings.after_dispute is
  'Comanda a trecut printr-o dispută. Se arată pe profil ca „după o dispută", pentru că o notă mică după o dispută spune altceva decât una fără.';
comment on column public.ratings.hidden_reason is
  'De ce a ascuns-o echipa. Obligatoriu, în jurnal, și niciodată arătat părților — ele văd că a fost ascunsă, nu nota despre ele.';

alter table public.ratings drop constraint if exists ratings_comment_length_ck;
alter table public.ratings add constraint ratings_comment_length_ck
  check (comment is null or length(comment) <= 500);

-- Agregatele publice citesc numai rândurile vizibile, deci indexul le
-- cunoaște: un index pe toate rândurile ar fi scanat și pe cele ascunse.
create index if not exists ratings_visible_idx
  on public.ratings (rated_company_id, created_at desc)
  where hidden_at is null;

create index if not exists ratings_rater_idx
  on public.ratings (rater_user_id, created_at desc);

-- „O evaluare per parte" este deja garantată, de indexul unic pe
-- (transport_id, rated_company_id) din 20260916130200 — constrângerea
-- din 20260916120400 este pe rater_user_id, care singură ar fi lăsat doi
-- colegi din aceeași firmă să evalueze amândoi aceeași comandă. Nu se
-- adaugă nimic aici; se scrie ca să nu fie adăugat a doua oară.

-- ---------------------------------------------------------------------
-- 3. Răspunsul firmei evaluate
--
-- Unul singur, și definitiv odată publicat. O firmă care își poate
-- rescrie răspunsul de câte ori vrea poartă o conversație publică
-- împotriva unui client care nu mai poate răspunde — evaluarea lui este
-- deja imuabilă. Un singur răspuns face schimbul simetric.
-- ---------------------------------------------------------------------
create table public.rating_replies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating_id uuid not null unique references public.ratings (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(body) between 1 and 500),
  was_masked boolean not null default false,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_reason text
);

comment on table public.rating_replies is
  'Un răspuns public per evaluare, scris de firma evaluată. Imuabil după publicare: evaluarea la care răspunde este deja imuabilă, iar un răspuns care se poate rescrie ar face schimbul nesimetric.';

create index rating_replies_company_idx on public.rating_replies (company_id, created_at desc);

alter table public.rating_replies enable row level security;

-- ---------------------------------------------------------------------
-- 4. Cine vede ce
--
-- Politicile de dinainte erau trei și fiecare era prea largă:
--
--   * `ratings_select_all` spunea `using (true)`, deci o evaluare
--     ascunsă de echipă rămânea citibilă de oricine avea cont.
--   * `ratings_insert_party` accepta `disputed` — adică exact cazul în
--     care brieful cere să se aștepte decizia echipei — și întreba
--     `is_transport_party()`, care spune „da" oricărui membru al firmei,
--     inclusiv unui șofer.
--   * `ratings_update_own` nu avea nici fereastră, nici limită de câte
--     ori.
--
-- Toate trei se înlocuiesc. Scrierea trece prin RPC-uri; tabela nu mai
-- primește INSERT sau UPDATE de la `authenticated` deloc.
-- ---------------------------------------------------------------------
drop policy if exists "ratings_select_all" on public.ratings;
drop policy if exists "ratings_insert_party" on public.ratings;
drop policy if exists "ratings_update_own" on public.ratings;

/** Evaluarea se vede dacă nu e ascunsă — sau dacă ești autorul ei, ori echipa. */
create policy "ratings_select_visible" on public.ratings
  for select to authenticated
  using (
    hidden_at is null
    or rater_user_id = auth.uid()
    or public.is_platform_admin()
  );

create policy "rating_replies_select_visible" on public.rating_replies
  for select to authenticated
  using (
    hidden_at is null
    or author_user_id = auth.uid()
    or public.is_platform_admin()
  );

-- `ratings_delete_admin` din faza 0 rămâne: ștergerea de către echipă
-- este ultima ieșire dintr-un rând scris greșit de noi. Ascunderea este
-- unealta de moderare, și ea nu șterge nimic.

-- ---------------------------------------------------------------------
-- 5. Masca, la intrare
--
-- Aceeași regulă ca la mesaje și din același motiv: un comentariu public
-- este un loc excelent în care să lași un număr de telefon. Se rescrie
-- rândul, nu afișarea.
-- ---------------------------------------------------------------------
create or replace function public.mask_rating_comment()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_masked text;
begin
  if new.comment is null then
    return new;
  end if;
  v_masked := public.mask_contacts(new.comment);
  new.was_masked := v_masked is distinct from new.comment;
  new.comment := v_masked;
  return new;
end;
$fn$;

create trigger ratings_mask_comment
  before insert or update of comment on public.ratings
  for each row execute function public.mask_rating_comment();

create or replace function public.mask_reply_body()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_masked text;
begin
  v_masked := public.mask_contacts(new.body);
  new.was_masked := v_masked is distinct from new.body;
  new.body := v_masked;
  return new;
end;
$fn$;

create trigger rating_replies_mask_body
  before insert on public.rating_replies
  for each row execute function public.mask_reply_body();

-- ---------------------------------------------------------------------
-- 6. Ce se mai poate schimba, și când
--
-- Ca la dovezile comenzii: nu o ușă pe care cineva trebuie să-și
-- amintească să o închidă, ci o comparație de coloane. Trei coloane de
-- moderare se pot schimba oricând, de echipă. Conținutul se poate
-- schimba o singură dată, în fereastra de editare, de autor. După
-- fereastră, nimic.
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
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  v_moderation_only :=
    to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
    is not distinct from
    to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason';

  if v_moderation_only then
    return new;
  end if;

  raise exception 'Evaluarea se corectează din pagina ei, o singură dată, în primele ore' using errcode = '42501';
end;
$fn$;

create trigger ratings_guard_update
  before update on public.ratings
  for each row execute function public.guard_rating_update();

create or replace function public.guard_rating_reply_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un răspuns publicat nu se șterge' using errcode = '42501';
  end if;
  if to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
     is distinct from
     to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason' then
    raise exception 'Un răspuns publicat nu se mai modifică' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger rating_replies_guard_write
  before update or delete on public.rating_replies
  for each row execute function public.guard_rating_reply_write();

-- ---------------------------------------------------------------------
-- 7. Garda, îngustată
--
-- Reprodusă din 20260923100100 cu trei schimbări, fiecare cerută de
-- brief. Restul — partea care decide cine pe cine evaluează din
-- transport, nu din ce a scris cel care evaluează — este neatinsă.
--
--   1. `vehicle_delivered` iese din listă. Un client care încă nu a
--      confirmat livrarea nu evaluează: dacă i s-ar cere nota înainte
--      să spună dacă a primit mașina, nota ar fi despre altceva.
--   2. `delivered` iese odată cu el; este aceeași stare, scrisă cu
--      ortografia fazei 0. `invoiced` și `closed` rămân — alea chiar
--      înseamnă încheiat.
--   3. Fereastra. După `window_days` de la închidere nu se mai poate
--      evalua, pentru că o notă dată peste trei luni descrie o amintire.
--
-- Triggerul nu este singura apărare, ci ultima. Ușa obișnuită este
-- `post_rating()`, care refuză mai devreme și cu propoziții mai utile.
-- ---------------------------------------------------------------------
create or replace function public.guard_rating_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_t public.transports;
  v_window integer;
begin
  select * into v_t from public.transports where id = new.transport_id;
  if v_t.id is null then
    raise exception 'Transport inexistent' using errcode = 'P0002';
  end if;
  if v_t.status not in ('order_completed', 'invoiced', 'closed') then
    raise exception 'Evaluarea se face după ce comanda este finalizată' using errcode = '42501';
  end if;

  select window_days into v_window from public.rating_settings where id;
  if v_t.closed_at is not null
     and now() > v_t.closed_at + make_interval(days => coalesce(v_window, 14)) then
    raise exception 'Perioada în care se putea evalua comanda asta a trecut' using errcode = '42501';
  end if;

  if exists (select 1 from public.company_members m
             where m.company_id = v_t.carrier_company_id and m.user_id = new.rater_user_id) then
    if v_t.shipper_company_id is null then
      raise exception 'Evaluarea persoanelor fizice nu este disponibilă' using errcode = '42501';
    end if;
    new.rater_company_id := v_t.carrier_company_id;
    new.rated_company_id := v_t.shipper_company_id;
  elsif v_t.shipper_user_id = new.rater_user_id
        or (v_t.shipper_company_id is not null and exists (
              select 1 from public.company_members m
              where m.company_id = v_t.shipper_company_id and m.user_id = new.rater_user_id)) then
    new.rater_company_id := v_t.shipper_company_id;
    new.rated_company_id := v_t.carrier_company_id;
  else
    raise exception 'Doar părțile transportului pot evalua' using errcode = '42501';
  end if;

  -- Scris aici, nu de apelant: o comandă care a trecut printr-o dispută
  -- este un fapt al comenzii, iar semnul de pe profil trebuie să fie
  -- același indiferent pe ce ușă a intrat evaluarea.
  new.after_dispute := v_t.dispute_resolved_at is not null;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 8. Ușa
--
-- Un singur loc din care o evaluare ajunge în tabelă. Verifică ce poate
-- verifica mai devreme decât triggerul, ca omul să primească propoziția
-- utilă și nu pe cea generică, și alege sub-scorurile potrivite părții
-- pe care se află — un client nu este întrebat cât de bine a avut grijă
-- de vehicul, iar un transportator nu este întrebat despre punctualitate
-- pe care tot el a hotărât-o.
-- ---------------------------------------------------------------------
create or replace function public.order_rating_side(p_order public.transports, p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when p_order.shipper_user_id = p_user then 'client'
    when p_order.shipper_company_id is not null and exists (
      select 1 from public.company_members m
      where m.company_id = p_order.shipper_company_id and m.user_id = p_user
    ) then 'client'
    when exists (
      select 1 from public.company_members m
      where m.company_id = p_order.carrier_company_id and m.user_id = p_user
    ) then 'carrier'
    else null
  end;
$fn$;

revoke all on function public.order_rating_side(public.transports, uuid)
  from public, anon, authenticated;

create or replace function public.post_rating(
  p_order_id uuid,
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
  v_order public.transports;
  v_side text;
  v_row public.ratings;
  v_window integer;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii autentificat' using errcode = '42501';
  end if;
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'Nota generală este între 1 și 5' using errcode = '22023';
  end if;
  if length(coalesce(p_comment, '')) > 500 then
    raise exception 'Comentariul are cel mult 500 de caractere' using errcode = '22023';
  end if;

  select * into v_order from public.transports t where t.id = p_order_id;
  if v_order.id is null then
    raise exception 'Comanda nu există' using errcode = 'P0002';
  end if;

  v_side := public.order_rating_side(v_order, auth.uid());
  if v_side is null then
    raise exception 'Doar părțile transportului pot evalua' using errcode = '42501';
  end if;

  if v_order.status = 'disputed' then
    raise exception 'Comanda este în dispută. Poți evalua după ce echipa o închide.' using errcode = '42501';
  end if;
  if v_order.status not in ('order_completed', 'invoiced', 'closed') then
    raise exception 'Poți evalua după ce comanda este finalizată' using errcode = '42501';
  end if;

  select window_days into v_window from public.rating_settings where id;
  if v_order.closed_at is not null
     and now() > v_order.closed_at + make_interval(days => v_window) then
    raise exception 'Perioada în care se putea evalua comanda asta a trecut' using errcode = '42501';
  end if;

  if v_side = 'carrier' and v_order.shipper_company_id is null then
    raise exception 'Clienții persoane fizice nu se evaluează' using errcode = '42501';
  end if;

  if exists (select 1 from public.ratings r
             where r.transport_id = p_order_id and r.rater_user_id = auth.uid()) then
    raise exception 'Ai evaluat deja comanda asta' using errcode = '23505';
  end if;

  -- Fiecare parte primește doar sub-scorurile ei. Ce vine de pe partea
  -- greșită se ignoră în tăcere: formularul nu îl arată, iar o eroare
  -- despre un câmp pe care omul nu l-a văzut nu ajută pe nimeni.
  insert into public.ratings
    (transport_id, rater_user_id, rated_company_id, score,
     punctuality, communication, vehicle_care,
     info_accuracy, handover_availability, comment)
  values
    (p_order_id, auth.uid(), v_order.carrier_company_id, p_score,
     p_punctuality, p_communication,
     case when v_side = 'client' then p_vehicle_care end,
     case when v_side = 'carrier' then p_info_accuracy end,
     case when v_side = 'carrier' then p_handover_availability end,
     nullif(trim(coalesce(p_comment, '')), ''))
  returning * into v_row;

  perform public.recompute_company_reputation(v_row.rated_company_id);
  perform public.queue_rating_notification(v_row, 'rating_received');
  perform public.flag_suspicious_rating(v_row);
  perform public.write_audit('rating.posted', 'ratings', v_row.id, null, to_jsonb(v_row));

  return v_row;
end;
$fn$;

grant execute on function public.post_rating(
  uuid, integer, integer, integer, integer, integer, integer, text
) to authenticated;

comment on function public.post_rating(uuid, integer, integer, integer, integer, integer, integer, text) is
  'Singura ușă prin care o evaluare ajunge în tabelă. `rated_company_id` se trimite ca substituent pentru NOT NULL; guard_rating_insert() îl rescrie din transport, așa că partea evaluată nu depinde de ce a trimis apelantul.';

-- ---------------------------------------------------------------------
-- 9. O singură corectură
--
-- În fereastra de editare, o dată. Nu de trei ori, pentru că o notă care
-- se poate rescrie oricând este o negociere, nu o evaluare — iar firma
-- evaluată ar negocia cu cine tocmai a evaluat-o.
-- ---------------------------------------------------------------------
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

  perform public.recompute_company_reputation(v_after.rated_company_id);
  perform public.write_audit('rating.edited', 'ratings', p_rating_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$fn$;

grant execute on function public.edit_rating(
  uuid, integer, integer, integer, integer, integer, integer, text
) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Răspunsul, o dată
-- ---------------------------------------------------------------------
create or replace function public.reply_to_rating(p_rating_id uuid, p_body text)
returns public.rating_replies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rating public.ratings;
  v_row public.rating_replies;
begin
  select * into v_rating from public.ratings where id = p_rating_id;
  if v_rating.id is null then
    raise exception 'Evaluarea nu există' using errcode = 'P0002';
  end if;
  if v_rating.hidden_at is not null then
    raise exception 'Evaluarea a fost ascunsă de echipa platformei' using errcode = '42501';
  end if;
  if not public.is_company_operator(v_rating.rated_company_id) then
    raise exception 'Doar firma evaluată poate răspunde' using errcode = '42501';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Scrie un răspuns' using errcode = '22023';
  end if;
  if length(trim(p_body)) > 500 then
    raise exception 'Răspunsul are cel mult 500 de caractere' using errcode = '22023';
  end if;
  if exists (select 1 from public.rating_replies where rating_id = p_rating_id) then
    raise exception 'Ai răspuns deja la evaluarea asta' using errcode = '23505';
  end if;

  insert into public.rating_replies (rating_id, company_id, author_user_id, body)
  values (p_rating_id, v_rating.rated_company_id, auth.uid(), trim(p_body))
  returning * into v_row;

  perform public.queue_rating_notification(v_rating, 'rating_reply');
  perform public.write_audit('rating.replied', 'rating_replies', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$fn$;

grant execute on function public.reply_to_rating(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Moderarea
--
-- Echipa ascunde, cu motiv, și poate să dea înapoi. Nu editează
-- niciodată: o notă rescrisă de platformă este o notă pe care nimeni nu
-- o mai poate crede, nici cea rescrisă, nici celelalte.
-- ---------------------------------------------------------------------
create or replace function public.staff_hide_rating(p_rating_id uuid, p_reason text)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.ratings;
  v_after public.ratings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde o evaluare' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce ascunzi evaluarea. Motivul rămâne în jurnal.' using errcode = '22023';
  end if;

  select * into v_before from public.ratings where id = p_rating_id;
  if v_before.id is null then
    raise exception 'Evaluarea nu există' using errcode = 'P0002';
  end if;

  update public.ratings
  set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
  where id = p_rating_id
  returning * into v_after;

  perform public.recompute_company_reputation(v_after.rated_company_id);
  perform public.write_audit('rating.hidden', 'ratings', p_rating_id,
                             to_jsonb(v_before), to_jsonb(v_after), trim(p_reason));
  return v_after;
end;
$fn$;

create or replace function public.staff_unhide_rating(p_rating_id uuid, p_reason text)
returns public.ratings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.ratings;
  v_after public.ratings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate repune o evaluare' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce o repui. Motivul rămâne în jurnal.' using errcode = '22023';
  end if;

  select * into v_before from public.ratings where id = p_rating_id;
  if v_before.id is null then
    raise exception 'Evaluarea nu există' using errcode = 'P0002';
  end if;

  update public.ratings
  set hidden_at = null, hidden_by = null, hidden_reason = null
  where id = p_rating_id
  returning * into v_after;

  perform public.recompute_company_reputation(v_after.rated_company_id);
  perform public.write_audit('rating.unhidden', 'ratings', p_rating_id,
                             to_jsonb(v_before), to_jsonb(v_after), trim(p_reason));
  return v_after;
end;
$fn$;

create or replace function public.staff_hide_rating_reply(p_reply_id uuid, p_reason text)
returns public.rating_replies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.rating_replies;
  v_after public.rating_replies;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde un răspuns' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce îl ascunzi. Motivul rămâne în jurnal.' using errcode = '22023';
  end if;

  select * into v_before from public.rating_replies where id = p_reply_id;
  if v_before.id is null then
    raise exception 'Răspunsul nu există' using errcode = 'P0002';
  end if;

  update public.rating_replies
  set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
  where id = p_reply_id
  returning * into v_after;

  perform public.write_audit('rating_reply.hidden', 'rating_replies', p_reply_id,
                             to_jsonb(v_before), to_jsonb(v_after), trim(p_reason));
  return v_after;
end;
$fn$;

grant execute on function public.staff_hide_rating(uuid, text) to authenticated;
grant execute on function public.staff_unhide_rating(uuid, text) to authenticated;
grant execute on function public.staff_hide_rating_reply(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Reputația, calculată
--
-- Niciun număr de mai jos nu se tastează nicăieri. Fiecare are o
-- formulă, formula este scrisă în docs/02-data-model.md sub același
-- nume, iar pagina publică poartă o notă „Cum calculăm" cu aceleași
-- cuvinte. Trei texte care trebuie să spună același lucru sunt trei
-- șanse să nu-l spună, așa că numele coloanei este liantul.
--
-- Două reguli se aplică peste tot:
--
--   * conturile de test nu intră nicăieri — nici ca evaluator, nici ca
--     transport numărat;
--   * o evaluare ascunsă nu există pentru niciun agregat.
--
-- Amândouă se aplică la calcul, nu la afișare. Un agregat corect filtrat
-- într-un singur loc se strecoară nefiltrat în al doilea loc care îl
-- citește, iar al doilea loc apare întotdeauna.
-- ---------------------------------------------------------------------
alter table public.companies
  /** Comenzi duse până la capăt, ca transportator și, separat, ca a client. */
  add column completed_as_carrier integer not null default 0,
  add column completed_as_client integer not null default 0,

  /** Mediile sub-scorurilor, pe aceleași rânduri vizibile ca rating_avg. */
  add column rating_punctuality numeric(3,2),
  add column rating_communication numeric(3,2),
  add column rating_vehicle_care numeric(3,2),
  add column rating_info_accuracy numeric(3,2),
  add column rating_handover numeric(3,2),

  /** Procent 0–100, sau NULL când sunt prea puține comenzi ca să însemne ceva. */
  add column punctuality_pct integer check (punctuality_pct between 0 and 100),
  add column punctuality_sample integer not null default 0,

  add column response_pct integer check (response_pct between 0 and 100),
  add column response_sample integer not null default 0,

  add column disputes_opened_12m integer not null default 0,
  add column disputes_resolved_12m integer not null default 0,

  add column reputation_computed_at timestamptz;

comment on column public.companies.completed_as_carrier is
  'Comenzi în order_completed/invoiced/closed unde firma a fost transportator, fără conturile de test. Recalculat, niciodată scris de cont.';
comment on column public.companies.punctuality_pct is
  'Procentul comenzilor încheiate în care ridicarea și livrarea s-au făcut până la datele estimate din oferta acceptată, cu rating_settings.punctuality_grace_days toleranță. NULL sub min_punctuality_orders comenzi cu date estimate.';
comment on column public.companies.response_pct is
  'Procentul cererilor potrivite din ultimele response_lookback_days la care firma a răspuns cu o ofertă sau o lămurire în response_window_hours. NULL sub min_response_sample cereri.';
comment on column public.companies.reputation_computed_at is
  'Când a rulat ultima dată recompute_company_reputation. Gol înseamnă „niciodată", nu „zero".';

/**
 * Toate numerele unei firme, dintr-o trecere.
 *
 * Una singură și nu șase, pentru că șase funcții ar însemna șase
 * definiții ale lui „comandă încheiată" și, în timp, șase definiții
 * diferite. Rulează la fiecare evaluare și în fiecare noapte.
 */
create or replace function public.recompute_company_reputation(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.rating_settings;
  v_avg numeric(3,2);
  v_count integer;
  v_punct numeric(3,2);
  v_comm numeric(3,2);
  v_care numeric(3,2);
  v_info numeric(3,2);
  v_hand numeric(3,2);
  v_carrier integer;
  v_client integer;
  v_on_time integer;
  v_punct_sample integer;
  v_answered integer;
  v_resp_sample integer;
  v_disputes_opened integer;
  v_disputes_resolved integer;
begin
  if p_company_id is null then
    return;
  end if;
  select * into s from public.rating_settings where id;

  -- Evaluările vizibile, de la evaluatori care nu sunt ai noștri.
  select round(avg(r.score)::numeric, 2), count(*),
         round(avg(r.punctuality)::numeric, 2),
         round(avg(r.communication)::numeric, 2),
         round(avg(r.vehicle_care)::numeric, 2),
         round(avg(r.info_accuracy)::numeric, 2),
         round(avg(r.handover_availability)::numeric, 2)
    into v_avg, v_count, v_punct, v_comm, v_care, v_info, v_hand
  from public.ratings r
  join public.profiles p on p.id = r.rater_user_id
  where r.rated_company_id = p_company_id
    and r.hidden_at is null
    and not p.is_test;

  -- Comenzi încheiate, pe fiecare parte. `invoiced` și `closed` sunt
  -- ortografia fazei 0 a aceluiași lucru.
  select count(*) into v_carrier
  from public.transports t
  where t.carrier_company_id = p_company_id
    and t.status in ('order_completed', 'invoiced', 'closed');

  select count(*) into v_client
  from public.transports t
  where t.shipper_company_id = p_company_id
    and t.status in ('order_completed', 'invoiced', 'closed');

  -- Punctualitate: ridicarea și livrarea, amândouă până la datele din
  -- oferta acceptată, cu toleranța din setări. Se numără doar comenzile
  -- care au și ofertă cu date estimate — o comandă fără promisiune nu
  -- poate fi nici ținută, nici ratată.
  select
    count(*) filter (
      where t.picked_up_at::date <= o.estimated_pickup_date + s.punctuality_grace_days
        and t.delivered_at::date <= o.estimated_delivery_date + s.punctuality_grace_days
    ),
    count(*)
    into v_on_time, v_punct_sample
  from public.transports t
  join public.offers o on o.id = t.offer_id
  where t.carrier_company_id = p_company_id
    and t.status in ('order_completed', 'invoiced', 'closed')
    and t.picked_up_at is not null
    and t.delivered_at is not null
    and o.estimated_pickup_date is not null
    and o.estimated_delivery_date is not null;

  -- Rata de răspuns: din cererile potrivite publicate în fereastra de
  -- retrospectivă, la câte a răspuns firma — cu o ofertă sau cu o
  -- lămurire — în response_window_hours de la publicare. O lămurire
  -- contează: întrebarea „ce fel de mașină este" este un răspuns, chiar
  -- dacă oferta vine a doua zi.
  select
    count(*) filter (where answered.at is not null),
    count(*)
    into v_answered, v_resp_sample
  from public.cargo_listings l
  join public.profiles poster on poster.id = l.posted_by
  left join lateral (
    select min(x.at) as at from (
      select o.created_at as at
      from public.offers o
      where o.cargo_listing_id = l.id and o.from_company_id = p_company_id
      union all
      select m.created_at
      from public.messages m
      join public.conversations cv on cv.id = m.conversation_id
      join public.offers o2 on o2.id = cv.offer_id
      where o2.cargo_listing_id = l.id
        and o2.from_company_id = p_company_id
    ) x
    where x.at <= l.created_at + make_interval(hours => s.response_window_hours)
  ) answered on true
  where l.created_at >= now() - make_interval(days => s.response_lookback_days)
    and not poster.is_test
    and public.company_matches_request(p_company_id, l.id);

  select
    count(*) filter (where t.disputed_at is not null),
    count(*) filter (where t.dispute_resolved_at is not null)
    into v_disputes_opened, v_disputes_resolved
  from public.transports t
  where (t.carrier_company_id = p_company_id or t.shipper_company_id = p_company_id)
    and t.disputed_at >= now() - interval '12 months';

  update public.companies
  set rating_avg = v_avg,
      rating_count = coalesce(v_count, 0),
      rating_punctuality = v_punct,
      rating_communication = v_comm,
      rating_vehicle_care = v_care,
      rating_info_accuracy = v_info,
      rating_handover = v_hand,
      completed_as_carrier = coalesce(v_carrier, 0),
      completed_as_client = coalesce(v_client, 0),
      punctuality_sample = coalesce(v_punct_sample, 0),
      punctuality_pct = case
        when coalesce(v_punct_sample, 0) >= s.min_punctuality_orders
        then round(100.0 * v_on_time / v_punct_sample)::integer
      end,
      response_sample = coalesce(v_resp_sample, 0),
      response_pct = case
        when coalesce(v_resp_sample, 0) >= s.min_response_sample
        then round(100.0 * v_answered / v_resp_sample)::integer
      end,
      disputes_opened_12m = coalesce(v_disputes_opened, 0),
      disputes_resolved_12m = coalesce(v_disputes_resolved, 0),
      reputation_computed_at = now()
  where id = p_company_id;
end;
$fn$;

revoke all on function public.recompute_company_reputation(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_company_reputation(uuid) to service_role;

-- Triggerul din faza 0 scria media numărând tot: rânduri ascunse,
-- conturi de test, ambele direcții. Rămâne ca trigger, dar delegă — așa
-- orice drum care inserează direct (o funcție `service_role`, o
-- reparație manuală) ajunge tot la formulele de mai sus.
create or replace function public.refresh_company_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.recompute_company_reputation(coalesce(new.rated_company_id, old.rated_company_id));
  return coalesce(new, old);
end;
$fn$;

/**
 * Toate firmele, o dată pe noapte.
 *
 * Recalcularea la fiecare evaluare acoperă mediile, dar nu și ce se
 * schimbă fără ca cineva să evalueze: o comandă care se încheie, o
 * fereastră de 90 de zile care alunecă, o dispută care iese din
 * ultimele douăsprezece luni. Fără jobul ăsta, rata de răspuns a unei
 * firme rămâne înghețată în ziua ultimei ei evaluări.
 */
create or replace function public.recompute_all_reputations()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_count integer := 0;
begin
  for r in select id from public.companies where not is_test order by id loop
    perform public.recompute_company_reputation(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

revoke all on function public.recompute_all_reputations() from public, anon, authenticated;
grant execute on function public.recompute_all_reputations() to service_role;

-- ---------------------------------------------------------------------
-- 13. Coloanele noi nu se scriu din cont
--
-- `guard_company_write` reprodus din 20260918180000 cu cele
-- treisprezece coloane noi adăugate la lista lui. O politică de UPDATE
-- nu poate limita coloanele, deci fără rândurile astea un membru al
-- firmei ar putea scrie `completed_as_carrier = 999` direct prin API.
-- Reputația calculată din care se poate tasta un număr nu este
-- reputație calculată.
-- ---------------------------------------------------------------------
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
     or new.profile_updated_at is distinct from old.profile_updated_at
     -- Adăugate de 20260924100000: reputația calculată.
     or new.completed_as_carrier is distinct from old.completed_as_carrier
     or new.completed_as_client is distinct from old.completed_as_client
     or new.rating_punctuality is distinct from old.rating_punctuality
     or new.rating_communication is distinct from old.rating_communication
     or new.rating_vehicle_care is distinct from old.rating_vehicle_care
     or new.rating_info_accuracy is distinct from old.rating_info_accuracy
     or new.rating_handover is distinct from old.rating_handover
     or new.punctuality_pct is distinct from old.punctuality_pct
     or new.punctuality_sample is distinct from old.punctuality_sample
     or new.response_pct is distinct from old.response_pct
     or new.response_sample is distinct from old.response_sample
     or new.disputes_opened_12m is distinct from old.disputes_opened_12m
     or new.disputes_resolved_12m is distinct from old.disputes_resolved_12m
     or new.reputation_computed_at is distinct from old.reputation_computed_at then
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
-- 14. Ce se anunță
--
-- Trei lucruri: ai primit o evaluare, cineva a răspuns la a ta, și —
-- singura care chiar schimbă comportament — mai ai două zile în care
-- poți evalua.
-- ---------------------------------------------------------------------
create or replace function public.queue_rating_notification(
  p_rating public.ratings,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rated public.companies;
  v_email text;
  v_user uuid;
  v_payload jsonb;
  v_order public.transports;
begin
  select * into v_order from public.transports where id = p_rating.transport_id;
  select * into v_rated from public.companies where id = p_rating.rated_company_id;

  if p_kind = 'rating_received' then
    -- Firma evaluată află. Adresa firmei întâi, a proprietarului doar
    -- dacă firma nu a dat niciuna.
    v_email := coalesce(v_rated.alerts_email, v_rated.contact_email);
    if v_email is null then
      select p.email into v_email
      from public.company_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.company_id = v_rated.id
      order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end
      limit 1;
    end if;
  elsif p_kind = 'rating_reply' then
    -- Autorul evaluării află că i s-a răspuns.
    v_user := p_rating.rater_user_id;
    select p.email into v_email from public.profiles p where p.id = v_user;
  else
    return;
  end if;

  if v_email is null then
    return;
  end if;

  v_payload := jsonb_build_object(
    'rating_id', p_rating.id,
    'order_id', p_rating.transport_id,
    'company_name', coalesce(v_rated.display_name, v_rated.legal_name),
    'company_slug', v_rated.slug,
    'score', p_rating.score
  );

  insert into public.notification_outbox
    (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
  values ('email', p_kind, v_user,
          case when p_kind = 'rating_received' then p_rating.rated_company_id end,
          v_email, v_payload, p_kind || ':' || p_rating.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$fn$;

revoke all on function public.queue_rating_notification(public.ratings, text)
  from public, anon, authenticated;

/**
 * „Mai ai două zile ca să evaluezi."
 *
 * Trimis o singură dată pe comandă pe parte, și numai dacă partea chiar
 * nu a evaluat încă — un memento pentru ceva deja făcut este exact felul
 * de mesaj după care oamenii opresc toate mesajele. Conturile de test
 * nu primesc nimic, ca peste tot.
 */
create or replace function public.remind_pending_ratings(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.rating_settings;
  r record;
  v_sent integer := 0;
  v_deadline timestamptz;
begin
  select * into s from public.rating_settings where id;

  for r in
    select t.id as order_id, t.closed_at, t.carrier_company_id, t.shipper_company_id,
           t.shipper_user_id, l.loading_city, l.unloading_city,
           c.display_name, c.legal_name
    from public.transports t
    left join public.cargo_listings l on l.id = t.cargo_listing_id
    left join public.companies c on c.id = t.carrier_company_id
    where t.status in ('order_completed', 'invoiced', 'closed')
      and t.closed_at is not null
      -- Fereastra se închide peste două zile: destul cât să mai poată
      -- fi făcut, destul de aproape cât să conteze.
      and t.closed_at + make_interval(days => s.window_days - 2) <= p_now
      and t.closed_at + make_interval(days => s.window_days) > p_now
  loop
    v_deadline := r.closed_at + make_interval(days => s.window_days);

    -- Clientul, dacă nu a evaluat.
    if not exists (
      select 1 from public.ratings rt
      where rt.transport_id = r.order_id and rt.rated_company_id = r.carrier_company_id
    ) then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
      select 'email', 'rating_reminder', p.id, r.shipper_company_id, p.email,
             jsonb_build_object(
               'order_id', r.order_id,
               'company_name', coalesce(r.display_name, r.legal_name),
               'from_city', r.loading_city,
               'to_city', r.unloading_city,
               'deadline', v_deadline
             ),
             'rating_reminder:' || r.order_id || ':client'
      from public.profiles p
      where p.id = r.shipper_user_id and p.email is not null and not p.is_test
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      v_sent := v_sent + 1;
    end if;

    -- Transportatorul, dacă are pe cine evalua și nu a evaluat.
    if r.shipper_company_id is not null and not exists (
      select 1 from public.ratings rt
      where rt.transport_id = r.order_id and rt.rated_company_id = r.shipper_company_id
    ) then
      insert into public.notification_outbox
        (channel, template, recipient_company_id, to_email, payload, dedupe_key)
      select 'email', 'rating_reminder', r.carrier_company_id,
             coalesce(cc.alerts_email, cc.contact_email),
             jsonb_build_object(
               'order_id', r.order_id,
               'from_city', r.loading_city,
               'to_city', r.unloading_city,
               'deadline', v_deadline
             ),
             'rating_reminder:' || r.order_id || ':carrier'
      from public.companies cc
      where cc.id = r.carrier_company_id
        and coalesce(cc.alerts_email, cc.contact_email) is not null
        and not cc.is_test
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$fn$;

revoke all on function public.remind_pending_ratings(timestamptz) from public, anon, authenticated;
grant execute on function public.remind_pending_ratings(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 15. Ce miroase a răzbunare
--
-- Nu ascundem nimic automat — o notă mică este de multe ori doar o notă
-- mică, iar o platformă care își șterge singură recenziile proaste nu
-- mai are recenzii. Ce se face este o sesizare către echipă, pe
-- combinația pe care brieful o numește: o stea, foarte repede după
-- finalizare, pe o comandă care a avut o dispută.
--
-- Nu se trimite niciun e-mail: sesizarea apare în /admin/sesizari, unde
-- echipa se uită oricum.
-- ---------------------------------------------------------------------
-- `kind` primește o a cincea valoare. Constrângerea a fost numită
-- explicit în 20260921100000, deci se înlocuiește pe nume.
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check
  check (kind in ('firma', 'anunt', 'mesaj', 'evaluare', 'altul'));

alter table public.reports
  add column rating_id uuid references public.ratings (id) on delete set null;

comment on column public.reports.rating_id is
  'Evaluarea sesizată. Nullabil: cele mai multe sesizări nu sunt despre o evaluare.';

create or replace function public.flag_suspicious_rating(p_rating public.ratings)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
begin
  if p_rating.score > 1 then
    return;
  end if;
  select * into v_order from public.transports where id = p_rating.transport_id;
  if v_order.disputed_at is null then
    return;
  end if;
  if v_order.closed_at is null or p_rating.created_at > v_order.closed_at + interval '1 hour' then
    return;
  end if;

  insert into public.reports
    (reporter_user_id, reported_company_id, transport_id, rating_id, kind, reason, details)
  values
    (p_rating.rater_user_id, p_rating.rated_company_id, p_rating.transport_id, p_rating.id,
     'evaluare', 'Evaluare de verificat',
     'Semnalată automat: o stea, la mai puțin de o oră după finalizare, pe o comandă care a avut dispută. Nu este o acuzație — este combinația pe care o verificăm manual.')
  on conflict do nothing;
end;
$fn$;

revoke all on function public.flag_suspicious_rating(public.ratings)
  from public, anon, authenticated;

/**
 * Sesizarea unei evaluări de către cineva care o citește.
 *
 * Trece prin fluxul de sesizări care există deja, cu `kind = 'evaluare'`
 * și cu evaluarea legată, ca să nu fie nevoie de un al doilea ecran de
 * moderare pentru același fel de decizie.
 */
create or replace function public.report_rating(p_rating_id uuid, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rating public.ratings;
  v_row public.reports;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii autentificat' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce sesizezi evaluarea' using errcode = '22023';
  end if;

  select * into v_rating from public.ratings where id = p_rating_id and hidden_at is null;
  if v_rating.id is null then
    raise exception 'Evaluarea nu există' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.reports rp
    where rp.rating_id = p_rating_id and rp.reporter_user_id = auth.uid()
      and rp.status in ('open', 'investigating')
  ) then
    raise exception 'Ai sesizat deja evaluarea asta. Ne uităm peste ea.' using errcode = '23505';
  end if;

  insert into public.reports
    (reporter_user_id, reported_company_id, transport_id, rating_id, kind, reason, details)
  values (auth.uid(), v_rating.rated_company_id, v_rating.transport_id, p_rating_id,
          'evaluare', 'Evaluare sesizată', trim(p_reason))
  returning * into v_row;

  perform public.write_audit('report.created', 'reports', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$fn$;

grant execute on function public.report_rating(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 16. Ce citesc ecranele
--
-- Profilul public este citit cu cheia anonimă, deci evaluările lui nu
-- pot veni dintr-o politică pe `authenticated`. Vin dintr-o funcție,
-- care în plus poate face ce o politică nu poate: să scoată conturile de
-- test și să lege răspunsul de evaluarea lui într-un singur rând.
-- ---------------------------------------------------------------------
create or replace function public.company_ratings(
  p_slug text,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  score integer,
  punctuality integer,
  communication integer,
  vehicle_care integer,
  info_accuracy integer,
  handover_availability integer,
  comment text,
  after_dispute boolean,
  edited boolean,
  rater_name text,
  reply_body text,
  reply_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $fn$
  with company as (
    select c.id from public.companies c
    where c.slug = p_slug and c.public_profile_enabled and not c.is_test
  ),
  visible as (
    select r.*
    from public.ratings r
    join company on company.id = r.rated_company_id
    join public.profiles p on p.id = r.rater_user_id
    where r.hidden_at is null and not p.is_test
  )
  select
    v.id,
    v.created_at,
    v.score,
    v.punctuality,
    v.communication,
    v.vehicle_care,
    v.info_accuracy,
    v.handover_availability,
    v.comment,
    v.after_dispute,
    v.edited_at is not null,
    -- Numele firmei care a evaluat, sau „Client" pentru o persoană
    -- fizică: numele unei persoane fizice nu se publică pe profilul
    -- altcuiva.
    coalesce(rc.display_name, rc.legal_name, 'Client'),
    case when rp.hidden_at is null then rp.body end,
    case when rp.hidden_at is null then rp.created_at end,
    count(*) over ()
  from visible v
  left join public.companies rc on rc.id = v.rater_company_id
  left join public.rating_replies rp on rp.rating_id = v.id
  order by v.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50))
  offset greatest(0, coalesce(p_offset, 0));
$fn$;

grant execute on function public.company_ratings(text, integer, integer) to anon, authenticated;

/**
 * Ce știe pagina comenzii despre evaluarea ei.
 *
 * Un singur rând cu tot ce trebuie ca să deseneze cardul: dacă persoana
 * asta mai poate evalua, până când, ce a scris deja dacă a scris, și
 * dacă mai poate corecta. Pagina nu recalculează niciuna dintre ele.
 */
create or replace function public.order_rating_state(p_order_id uuid)
returns table (
  side text,
  can_rate boolean,
  blocked_reason text,
  deadline timestamptz,
  rating_id uuid,
  score integer,
  punctuality integer,
  communication integer,
  vehicle_care integer,
  info_accuracy integer,
  handover_availability integer,
  comment text,
  can_edit boolean,
  edit_deadline timestamptz,
  rated_company_name text,
  rated_company_slug text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  s public.rating_settings;
  v_side text;
  v_mine public.ratings;
  v_rated public.companies;
  v_deadline timestamptz;
  v_blocked text;
begin
  select * into v_order from public.transports t where t.id = p_order_id;
  if v_order.id is null or not public.can_see_order(p_order_id) then
    return;
  end if;

  select * into s from public.rating_settings where id;
  v_side := public.order_rating_side(v_order, auth.uid());
  if v_side is null then
    return;
  end if;

  select * into v_mine from public.ratings r
  where r.transport_id = p_order_id and r.rater_user_id = auth.uid();

  select * into v_rated from public.companies c
  where c.id = case when v_side = 'client' then v_order.carrier_company_id
                    else v_order.shipper_company_id end;

  v_deadline := v_order.closed_at + make_interval(days => s.window_days);

  v_blocked := case
    when v_order.status = 'disputed' then 'disputed'
    when v_order.status not in ('order_completed', 'invoiced', 'closed') then 'not_completed'
    when v_side = 'carrier' and v_order.shipper_company_id is null then 'individual'
    when v_mine.id is not null then 'done'
    when v_order.closed_at is not null and now() > v_deadline then 'window_closed'
    else null
  end;

  return query select
    v_side,
    v_blocked is null,
    v_blocked,
    v_deadline,
    v_mine.id,
    v_mine.score,
    v_mine.punctuality,
    v_mine.communication,
    v_mine.vehicle_care,
    v_mine.info_accuracy,
    v_mine.handover_availability,
    v_mine.comment,
    v_mine.id is not null
      and v_mine.edited_at is null
      and now() <= v_mine.created_at + make_interval(hours => s.edit_hours),
    v_mine.created_at + make_interval(hours => s.edit_hours),
    coalesce(v_rated.display_name, v_rated.legal_name),
    v_rated.slug;
end;
$fn$;

grant execute on function public.order_rating_state(uuid) to authenticated;

/**
 * Cele trei file din /cont/evaluari.
 *
 * „De dat" este calculată, nu stocată: o listă de evaluări în așteptare
 * ținută într-o tabelă ar trebui golită din patru locuri și ar rămâne
 * plină din al cincilea.
 */
create or replace function public.my_ratings(p_box text default 'de-dat')
returns table (
  order_id uuid,
  rating_id uuid,
  created_at timestamptz,
  deadline timestamptz,
  score integer,
  comment text,
  after_dispute boolean,
  hidden boolean,
  from_city text,
  to_city text,
  counterparty_name text,
  counterparty_slug text,
  rater_name text,
  reply_body text,
  can_reply boolean,
  can_edit boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  s public.rating_settings;
begin
  if auth.uid() is null then
    return;
  end if;
  select * into s from public.rating_settings where id;

  if p_box = 'date' then
    return query
    select r.transport_id, r.id, r.created_at,
           t.closed_at + make_interval(days => s.window_days),
           r.score, r.comment, r.after_dispute, r.hidden_at is not null,
           l.loading_city, l.unloading_city,
           coalesce(rc.display_name, rc.legal_name), rc.slug,
           null::text, rp.body, false,
           r.edited_at is null and now() <= r.created_at + make_interval(hours => s.edit_hours)
    from public.ratings r
    join public.transports t on t.id = r.transport_id
    left join public.cargo_listings l on l.id = t.cargo_listing_id
    left join public.companies rc on rc.id = r.rated_company_id
    left join public.rating_replies rp on rp.rating_id = r.id and rp.hidden_at is null
    where r.rater_user_id = auth.uid()
    order by r.created_at desc;

  elsif p_box = 'primite' then
    return query
    select r.transport_id, r.id, r.created_at,
           null::timestamptz,
           r.score, r.comment, r.after_dispute, r.hidden_at is not null,
           l.loading_city, l.unloading_city,
           coalesce(rc.display_name, rc.legal_name), rc.slug,
           coalesce(rater.display_name, rater.legal_name, 'Client'),
           rp.body,
           rp.id is null and r.hidden_at is null and public.is_company_operator(r.rated_company_id),
           false
    from public.ratings r
    join public.transports t on t.id = r.transport_id
    left join public.cargo_listings l on l.id = t.cargo_listing_id
    left join public.companies rc on rc.id = r.rated_company_id
    left join public.companies rater on rater.id = r.rater_company_id
    left join public.rating_replies rp on rp.rating_id = r.id
    where public.is_company_member(r.rated_company_id)
      and (r.hidden_at is null or public.is_platform_admin())
    order by r.created_at desc;

  else
    -- „De dat": comenzi încheiate, în fereastră, pe care persoana asta
    -- este parte și încă nu a evaluat.
    return query
    select t.id, null::uuid, t.closed_at,
           t.closed_at + make_interval(days => s.window_days),
           null::integer, null::text, t.dispute_resolved_at is not null, false,
           l.loading_city, l.unloading_city,
           coalesce(other.display_name, other.legal_name), other.slug,
           null::text, null::text, false, false
    from public.transports t
    left join public.cargo_listings l on l.id = t.cargo_listing_id
    left join public.companies other on other.id = case
      when public.order_rating_side(t, auth.uid()) = 'client' then t.carrier_company_id
      else t.shipper_company_id
    end
    where t.status in ('order_completed', 'invoiced', 'closed')
      and t.closed_at is not null
      and now() <= t.closed_at + make_interval(days => s.window_days)
      and public.order_rating_side(t, auth.uid()) is not null
      -- Un transportator nu evaluează o persoană fizică.
      and not (public.order_rating_side(t, auth.uid()) = 'carrier'
               and t.shipper_company_id is null)
      and not exists (
        select 1 from public.ratings r
        where r.transport_id = t.id and r.rater_user_id = auth.uid()
      )
    order by t.closed_at + make_interval(days => s.window_days) asc;
  end if;
end;
$fn$;

grant execute on function public.my_ratings(text) to authenticated;

/** Câte evaluări așteaptă de la persoana asta. Pentru insigna de pe tabloul de bord. */
create or replace function public.pending_rating_count()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer from public.my_ratings('de-dat');
$fn$;

grant execute on function public.pending_rating_count() to authenticated;

/**
 * Lista echipei.
 *
 * Aceleași filtre ca în brief, plus numărătoarea totală într-o coloană,
 * ca paginarea să nu ceară o a doua interogare care ar putea vedea alt
 * set de rânduri decât prima.
 */
create or replace function public.admin_ratings(
  p_score integer default null,
  p_company_id uuid default null,
  p_hidden boolean default null,
  p_after_dispute boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  order_id uuid,
  score integer,
  comment text,
  after_dispute boolean,
  hidden_at timestamptz,
  hidden_reason text,
  was_masked boolean,
  edited_at timestamptz,
  rater_name text,
  rated_name text,
  rated_slug text,
  reply_body text,
  reply_id uuid,
  reply_hidden_at timestamptz,
  report_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea evaluările' using errcode = '42501';
  end if;

  return query
  select
    r.id, r.created_at, r.transport_id, r.score, r.comment, r.after_dispute,
    r.hidden_at, r.hidden_reason, r.was_masked, r.edited_at,
    coalesce(rater.display_name, rater.legal_name, p.full_name, 'Client'),
    coalesce(rated.display_name, rated.legal_name),
    rated.slug,
    rp.body, rp.id, rp.hidden_at,
    (select count(*) from public.reports rep where rep.rating_id = r.id),
    count(*) over ()
  from public.ratings r
  left join public.companies rater on rater.id = r.rater_company_id
  left join public.profiles p on p.id = r.rater_user_id
  left join public.companies rated on rated.id = r.rated_company_id
  left join public.rating_replies rp on rp.rating_id = r.id
  where (p_score is null or r.score = p_score)
    and (p_company_id is null or r.rated_company_id = p_company_id)
    and (p_hidden is null or (r.hidden_at is not null) = p_hidden)
    and (p_after_dispute is null or r.after_dispute = p_after_dispute)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

grant execute on function public.admin_ratings(integer, uuid, boolean, boolean, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- 17. Catalogul de notificări, adus la zi
--
-- `notification_types` nu a mai fost atins din 20260918120000, iar între
-- timp au apărut două fluxuri întregi. Consecința nu este că nu pleacă
-- e-mailurile — acelea se scriu direct în `notification_outbox`, care nu
-- consultă catalogul — ci că:
--
--   * `queue_push()` returnează null pentru orice cod care nu e aici,
--     deci niciun push de comandă nu era posibil;
--   * /cont/setari/notificari nu le listează, deci nimeni nu le putea
--     opri. O notificare pe care nu o poți opri este o notificare pe
--     care oamenii o opresc pe toate.
--
-- Rândurile vechi pentru oferte și comenzi rămăseseră `is_available =
-- false` și duceau la /cont/cereri. Acum există ecranele, deci se
-- deschid și arată spre ele.
-- ---------------------------------------------------------------------
update public.notification_types
set is_available = true, deep_link = '/cont/oferte', default_push = true
where code in ('offer_received', 'offer_accepted', 'offer_rejected');

update public.notification_types
set is_available = true, deep_link = '/cont/transporturi/{id}', default_push = true
where code = 'order_status_changed';

insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('order_pickup_scheduled', 'Ridicare programată',
   'Transportatorul a stabilit intervalul în care ridică vehiculul.',
   'client', true, false, false, '/cont/transporturi/{id}', true, 200),
  ('order_picked_up', 'Vehicul ridicat',
   'Vehiculul a fost preluat, cu fotografii și fișa de stare.',
   'client', true, false, false, '/cont/transporturi/{id}', true, 210),
  ('order_in_transit', 'Pe drum', null,
   'client', false, false, false, '/cont/transporturi/{id}', true, 220),
  ('order_delivery_scheduled', 'Livrare programată', null,
   'client', true, false, false, '/cont/transporturi/{id}', true, 230),
  ('order_delivered', 'Vehicul livrat',
   'Vehiculul a ajuns. Ai un termen în care poți confirma sau semnala o problemă.',
   'client', true, true, false, '/cont/transporturi/{id}', true, 240),
  ('order_completed', 'Comandă finalizată', null,
   'both', false, false, false, '/cont/transporturi/{id}', true, 250),
  ('order_auto_completed', 'Comandă închisă automat',
   'S-a închis singură, fără răspuns în termenul de confirmare.',
   'both', false, true, false, '/cont/transporturi/{id}', true, 260),
  ('order_cancelled', 'Comandă anulată',
   'Cealaltă parte a anulat comanda. Nu poate fi oprită.',
   'both', true, true, true, '/cont/transporturi/{id}', true, 270),
  ('order_dispute_opened', 'Dispută deschisă',
   'Comanda este blocată până când ne uităm peste ea. Nu poate fi oprită.',
   'both', true, true, true, '/cont/transporturi/{id}', true, 280),
  ('order_dispute_resolved', 'Dispută închisă',
   'Decizia echipei asupra unei comenzi în dispută. Nu poate fi oprită.',
   'both', true, true, true, '/cont/transporturi/{id}', true, 290),
  ('order_driver_assigned', 'Alocat pe o comandă',
   'Dispecerul te-a pus pe o cursă.',
   'carrier', true, false, false, '/cont/transporturi/{id}', true, 300),
  ('order_vehicle_noncompliant', 'Vehicul fără acte în termen',
   'Vehiculul alocat pe o comandă neridicată a rămas fără ITP, RCA sau copie conformă.',
   'carrier', true, true, true, '/cont/transporturi/{id}', true, 310),

  ('rating_received', 'Evaluare primită',
   'Cineva a evaluat firma ta după un transport încheiat.',
   'both', true, false, false, '/cont/evaluari?cutie=primite', true, 400),
  ('rating_reply', 'Răspuns la evaluarea ta',
   'Firma pe care ai evaluat-o a răspuns public.',
   'both', false, false, false, '/cont/evaluari?cutie=date', true, 410),
  ('rating_reminder', 'Mai poți evalua câteva zile',
   'Fereastra în care poți evalua un transport încheiat se apropie de final.',
   'both', false, false, false, '/cont/evaluari', true, 420)
on conflict (code) do update
set label_ro = excluded.label_ro,
    description_ro = excluded.description_ro,
    audience = excluded.audience,
    default_push = excluded.default_push,
    is_mandatory = excluded.is_mandatory,
    bypasses_quiet_hours = excluded.bypasses_quiet_hours,
    deep_link = excluded.deep_link,
    is_available = excluded.is_available,
    sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 18. Joburile
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci reputația și mementourile de evaluare nu sunt programate. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-reputation', '10 3 * * *',
                        'select public.recompute_all_reputations();');
  perform cron.schedule('nightly-rating-reminders', '20 8 * * *',
                        'select public.remind_pending_ratings();');
end;
$cron$;

-- ---------------------------------------------------------------------
-- 19. Sănătatea joburilor
--
-- Reprodusă din 20260923100100 cu cele două joburi noi adăugate în
-- ambele liste pe care le poartă funcția — una pentru drumul normal,
-- una pentru cazul în care pg_cron lipsește. Sunt două liste pentru că
-- a doua rulează într-un handler de excepție care nu poate vedea
-- schema `cron`, și un job trecut doar în una este un job care pare
-- sănătos exact în situația în care nu este.
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-rating-reminders', 36.0),
      ('nightly-reputation', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0),
      ('nightly-saved-search-digest', 36.0),
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-rating-reminders', 36.0), ('nightly-reputation', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0), ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 20. Profilul public arată reputația
--
-- `v_public_companies` reprodusă din 20260918090000 cu cele paisprezece
-- coloane noi adăugate la coadă. `create or replace view` nu poate
-- șterge sau reordona coloane, deci corpul vine în întregime, neatins,
-- iar noutățile stau la final.
-- ---------------------------------------------------------------------
create or replace view public.v_public_companies as
select
  c.slug,
  coalesce(c.display_name, c.legal_name) as name,
  c.legal_name,
  c.cui,
  case when c.base_address_hidden then null else c.city end as city,
  c.county,
  c.company_type,
  c.logo_path,
  c.public_description,
  c.verified_at as verified_since,
  c.rating_avg,
  c.rating_count,

  (
    select count(*)::integer from public.vehicles v
    where v.company_id = c.id and v.is_active and v.is_compliant
  ) as compliant_vehicles,

  exists (
    select 1 from public.truck_listings t
    where t.company_id = c.id and t.status = 'active'
      and t.from_country = t.to_country
  ) as serves_national,
  exists (
    select 1 from public.truck_listings t
    where t.company_id = c.id and t.status = 'active'
      and t.from_country <> t.to_country
  ) as serves_international,

  greatest(
    (select max(d.reviewed_at) from public.documents d
     where d.company_id = c.id and d.status = 'approved'),
    (select max(v.compliance_checked_at) from public.vehicles v where v.company_id = c.id)
  ) as last_checked_at,

  -- Appended by migration 20260918090000.
  c.coverage_scope,
  c.coverage_counties,
  c.coverage_countries,
  c.vehicle_types_accepted,
  c.equipment,
  c.services,
  c.indicative_rate_ron_per_km,
  c.indicative_rate_note,
  c.website,

  -- Derived from the fleet, never typed. A firm cannot claim eleven
  -- platforms and register two.
  (
    select count(*)::integer from public.vehicles v
    where v.company_id = c.id and v.is_active
  ) as vehicles_total,

  -- Adăugate de 20260924100000: reputația calculată. Fiecare are o
  -- formulă în recompute_company_reputation() și aceeași formulă scrisă
  -- în docs/02-data-model.md.
  c.rating_punctuality,
  c.rating_communication,
  c.rating_vehicle_care,
  c.rating_info_accuracy,
  c.rating_handover,
  c.completed_as_carrier,
  c.completed_as_client,
  c.punctuality_pct,
  c.punctuality_sample,
  c.response_pct,
  c.response_sample,
  c.disputes_opened_12m,
  c.disputes_resolved_12m,
  c.reputation_computed_at
from public.companies c
where c.public_profile_enabled
  and c.verification_status = 'verified'
  and not c.is_suspended
  and c.slug is not null;

-- ---------------------------------------------------------------------
-- 21. Reputația pe cardul de ofertă
--
-- Patru coloane în plus pe `offers_for_request`. Se șterge întâi și se
-- creează din nou, pentru că `create or replace function` nu poate
-- schimba forma unui `returns table` — restul corpului este identic cu
-- cel din 20260922100000.
--
-- De ce pe card și nu doar pe profil: clientul compară patru oferte
-- într-un ecran și deschide, în cel mai bun caz, un profil. Numărul
-- trebuie să fie acolo unde se ia decizia. „Evaluări insuficiente" se
-- scrie tot acolo, ca lipsa lui să nu se citească drept zero.
-- ---------------------------------------------------------------------
drop function if exists public.offers_for_request(uuid);

create or replace function public.offers_for_request(p_listing_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  estimated_pickup_date date,
  estimated_delivery_date date,
  conditions text,
  payment_term_days integer,
  message text,
  valid_until timestamptz,
  company_id uuid,
  company_name text,
  company_slug text,
  company_verified boolean,
  company_verified_at timestamptz,
  vehicle_type public.vehicle_type,
  vehicle_plate text,
  conversation_id uuid,
  unread_messages integer,
  company_rating_avg numeric,
  company_rating_count integer,
  company_completed integer,
  company_punctuality integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.can_edit_cargo_listing(p_listing_id) and not public.is_platform_admin() then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    o.id, o.created_at, o.status, o.price_amount, o.currency,
    o.estimated_pickup_date, o.estimated_delivery_date, o.conditions,
    o.payment_term_days, o.message, o.valid_until,
    c.id,
    coalesce(c.display_name, c.legal_name, p.full_name),
    c.slug,
    c.verification_status = 'verified',
    c.verified_at,
    v.vehicle_type,
    v.plate_number,
    cv.id,
    (select count(*)::integer from public.messages m
     where m.conversation_id = cv.id
       and m.sender_user_id <> auth.uid()
       and m.read_at is null
       and m.hidden_at is null),
    c.rating_avg,
    c.rating_count,
    c.completed_as_carrier,
    c.punctuality_pct
  from public.offers o
  join public.profiles p on p.id = o.from_user_id
  left join public.companies c on c.id = o.from_company_id
  left join public.vehicles v on v.id = o.vehicle_id
  left join public.conversations cv on cv.offer_id = o.id
  where o.cargo_listing_id = p_listing_id
  order by
    case o.status when 'pending' then 0 when 'accepted' then 1 else 2 end,
    o.price_amount;
end;
$fn$;

grant execute on function public.offers_for_request(uuid) to authenticated;
