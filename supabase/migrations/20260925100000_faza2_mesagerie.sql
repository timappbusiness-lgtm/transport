-- =====================================================================
-- Faza 2 — mesageria generală și moderarea anunțurilor
--
-- Ultima bucată de cod a Fazei 2. Ce exista: o tabelă `conversations`
-- legată de un anunț, un fir pe o ofertă adăugat în 20260922100000, și
-- masca de contacte care rescrie mesajul la intrare. Ce lipsea este tot
-- restul: o a treia formă de conversație — cea pe o comandă — un loc
-- unde se văd toate, atașamente, blocare, retenție, și ecranele echipei.
--
-- Patru decizii stau la baza fișierului:
--
--   1. **Aceleași două tabele.** O conversație pe anunț, una pe ofertă și
--      una pe comandă sunt același lucru cu contexte diferite, nu trei
--      lucruri. Trei tabele ar fi însemnat trei politici, trei numărători
--      de necitite și trei feluri de a greși.
--   2. **Istoricul nu se demască niciodată.** Masca se aplică la
--      inserare, deci un mesaj scris înainte de comandă rămâne mascat
--      pentru totdeauna. Asta nu e o limitare, e regula: altfel un
--      client ar putea deschide o comandă de un leu ca să citească
--      numerele din discuțiile vechi.
--   3. **Echipa nu citește conversații private.** Politica de dinainte
--      spunea „sau este admin", ceea ce însemna toate. Acum înseamnă
--      cele sesizate și cele de pe o comandă în dispută — restul rămân
--      între cei doi, și pagina de confidențialitate o spune.
--   4. **Un șofer vede doar comenzile lui.** Aceeași regulă ca la
--      `can_see_order()`, din același motiv: un membru al firmei nu este
--      automat parte a fiecărei discuții a firmei.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Butoanele
-- ---------------------------------------------------------------------
create table public.messaging_settings (
  id boolean primary key default true check (id),

  /** Câte mesaje poate trimite un om într-o oră, peste tot. */
  max_messages_per_hour integer not null default 60
    check (max_messages_per_hour between 1 and 1000),
  /** Câte într-o singură conversație, într-o oră. */
  max_per_conversation_per_hour integer not null default 30
    check (max_per_conversation_per_hour between 1 and 500),

  /** Cât de des pleacă un e-mail despre aceeași conversație. */
  digest_minutes integer not null default 15 check (digest_minutes between 1 and 1440),

  /** Câte luni trăiește o conversație fără comandă. */
  retention_months integer not null default 24 check (retention_months between 1 and 120),

  /** Câte imagini pe mesaj. */
  max_attachments integer not null default 5 check (max_attachments between 1 and 10),

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.messaging_settings is
  'Pragurile mesageriei. Retenția se aplică doar conversațiilor fără comandă — cele cu comandă urmează retenția transportului.';

insert into public.messaging_settings (id) values (true) on conflict (id) do nothing;

alter table public.messaging_settings enable row level security;

create policy "messaging_settings_read" on public.messaging_settings
  for select to authenticated using (true);

create or replace function public.set_messaging_settings(
  p_max_messages_per_hour integer default null,
  p_max_per_conversation_per_hour integer default null,
  p_digest_minutes integer default null,
  p_retention_months integer default null,
  p_max_attachments integer default null
)
returns public.messaging_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.messaging_settings;
  v_after public.messaging_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările mesageriei' using errcode = '42501';
  end if;

  select * into v_before from public.messaging_settings where id;
  update public.messaging_settings
  set max_messages_per_hour = coalesce(p_max_messages_per_hour, max_messages_per_hour),
      max_per_conversation_per_hour =
        coalesce(p_max_per_conversation_per_hour, max_per_conversation_per_hour),
      digest_minutes = coalesce(p_digest_minutes, digest_minutes),
      retention_months = coalesce(p_retention_months, retention_months),
      max_attachments = coalesce(p_max_attachments, max_attachments),
      updated_at = now(),
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit('messaging_settings.updated', 'messaging_settings', null,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$fn$;

grant execute on function public.set_messaging_settings(integer, integer, integer, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- 2. A treia formă de conversație
--
-- `conversations_one_listing_ck` cerea exact un anunț. O conversație pe
-- o comandă nu are niciunul — are o comandă — deci constrângerea se
-- înlocuiește cu una care numără toate cele trei contexte și cere exact
-- unul. La fel indexul unic: era pe `coalesce(cargo, truck)`, care
-- pentru două conversații de comandă ar fi fost `coalesce(null, null)`
-- de două ori, adică o coliziune.
-- ---------------------------------------------------------------------
alter table public.conversations
  add column transport_id uuid references public.transports (id) on delete cascade,
  /** Firul de anunț sau de ofertă dinaintea comenzii, ca istoricul să fie la un click. */
  add column linked_conversation_id uuid references public.conversations (id) on delete set null;

comment on column public.conversations.transport_id is
  'Comanda despre care este firul. Se creează automat la crearea comenzii, este gratuit și nu se maschează — contactele sunt deja schimbate.';
comment on column public.conversations.linked_conversation_id is
  'Firul de dinainte dintre aceleași părți. Mesajele nu se mută: ar însemna două adevăruri despre când s-a spus ceva. Se leagă, și pagina comenzii arată amândouă.';

-- Trei forme, trei reguli. Un fir de ofertă poate purta și anunțul ofertei
-- sau nu: `open_offer_thread()` îl scrie, iar `guard_message_contacts()`
-- îl citește oricum din `offers` când lipsește. Un fir de comandă nu
-- poartă nimic altceva. Un fir de anunț poartă exact un anunț.
alter table public.conversations drop constraint if exists conversations_one_listing_ck;
alter table public.conversations add constraint conversations_one_context_ck
  check (
    case
      when transport_id is not null then
        offer_id is null and cargo_listing_id is null and truck_listing_id is null
      when offer_id is not null then
        (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int <= 1
      else
        (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int = 1
    end
  );

drop index if exists conversations_unique_pair;
create unique index conversations_unique_listing_pair
  on public.conversations (coalesce(cargo_listing_id, truck_listing_id), initiator_user_id)
  where offer_id is null and transport_id is null;

create unique index conversations_one_per_order
  on public.conversations (transport_id)
  where transport_id is not null;

create index conversations_participant_idx
  on public.conversations (initiator_user_id, last_message_at desc);
create index conversations_owner_idx
  on public.conversations (owner_user_id, last_message_at desc);

/**
 * Ce fel de conversație este asta.
 *
 * Derivat, nu stocat: o coloană `kind` ar trebui ținută în pas cu cele
 * trei chei străine, iar prima dată când nu ar fi, ecranul ar minți
 * despre ce citește.
 */
create or replace function public.conversation_kind(c public.conversations)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case
    when c.transport_id is not null then 'comanda'
    when c.offer_id is not null then 'oferta'
    when c.cargo_listing_id is not null then 'cerere'
    else 'traseu'
  end;
$fn$;

grant execute on function public.conversation_kind(public.conversations) to authenticated;

-- Sesizarea unui mesaj are nevoie de mesajul ei. `kind = 'mesaj'` era
-- deja în constrângere din 20260921100000, cu un comentariu care spunea
-- că nimic nu îl scrie încă; de aici începe să îl scrie.
alter table public.reports
  add column message_id uuid references public.messages (id) on delete set null;

comment on column public.reports.message_id is
  'Mesajul sesizat. Nullabil: cele mai multe sesizări nu sunt despre un mesaj.';

create index reports_message_idx on public.reports (message_id) where message_id is not null;

-- ---------------------------------------------------------------------
-- 3. Cine este parte
--
-- Reprodusă din 20260916120400 cu latura de comandă adăugată. Cele două
-- coloane de utilizator rămân ce erau — pentru firele de anunț și de
-- ofertă sunt tot ce trebuie. Pentru un fir de comandă, părțile sunt
-- clientul, firma transportatoare, și **numai** șoferul alocat.
--
-- Ultima parte este aceeași regulă ca `can_see_order()` și din același
-- motiv: `is_company_member` spune „da" oricărui membru, iar un șofer
-- este membru. Fără linia asta, un șofer ar citi toate discuțiile firmei.
-- ---------------------------------------------------------------------
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (
        c.initiator_user_id = auth.uid()
        or c.owner_user_id = auth.uid()
        or (c.transport_id is not null and public.can_see_order(c.transport_id))
      )
  );
$fn$;

/**
 * Conversațiile pe care echipa are voie să le deschidă.
 *
 * Nu toate. Cele sesizate, și cele de pe o comandă în dispută — adică
 * exact cazurile în care cineva ne-a cerut să ne uităm. Restul rămân
 * între cei doi, iar pagina de confidențialitate spune asta cu aceleași
 * cuvinte.
 */
create or replace function public.staff_may_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_platform_admin() and exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (
        exists (
          select 1 from public.reports r
          join public.messages m on m.id = r.message_id
          where m.conversation_id = c.id
        )
        or exists (
          select 1 from public.transports t
          where t.id = c.transport_id and t.disputed_at is not null
        )
      )
  );
$fn$;

grant execute on function public.staff_may_read_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Politicile, îngustate
--
-- Cea de dinainte spunea „participant **sau** admin", ceea ce însemna că
-- echipa citea orice discuție privată de pe platformă. Se înlocuiește cu
-- „participant sau o conversație pe care echipa are voie să o deschidă".
-- ---------------------------------------------------------------------
-- Firul unei comenzi se creează odată cu comanda, de `create_order()`.
-- Un cont nu îl poate insera: politica refuză orice rând cu
-- `transport_id`, iar `create_order()` este SECURITY DEFINER și nu trece
-- prin politică.
drop policy if exists "conversations_insert_initiator" on public.conversations;
create policy "conversations_insert_initiator" on public.conversations
  for insert to authenticated
  with check (initiator_user_id = auth.uid() and transport_id is null);

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant" on public.conversations
  for select to authenticated
  using (
    initiator_user_id = auth.uid()
    or owner_user_id = auth.uid()
    or (transport_id is not null and public.can_see_order(transport_id))
    or public.staff_may_read_conversation(id)
  );

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant" on public.messages
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    or public.staff_may_read_conversation(conversation_id)
  );

-- ---------------------------------------------------------------------
-- 5. Blocarea
--
-- Una singură: cine blochează pe cine, pentru conversații **noi** de
-- anunț. Un fir de comandă rămâne deschis oricum — transportul tot
-- trebuie făcut, iar o platformă care lasă pe cineva să tacă în mijlocul
-- unei curse nu a rezolvat nimic, a mutat problema pe telefon.
-- ---------------------------------------------------------------------
create table public.message_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  /** Cine a blocat. */
  blocker_user_id uuid not null references public.profiles (id) on delete cascade,
  /** Pe cine — o persoană sau o firmă întreagă. */
  blocked_user_id uuid references public.profiles (id) on delete cascade,
  blocked_company_id uuid references public.companies (id) on delete cascade,
  reason text,

  constraint message_blocks_one_target_ck check (
    (blocked_user_id is not null)::int + (blocked_company_id is not null)::int = 1
  )
);

comment on table public.message_blocks is
  'Cine nu mai poate deschide o conversație nouă de anunț cu cine. Firele de comandă rămân deschise: transportul tot trebuie făcut.';

create unique index message_blocks_user_unique
  on public.message_blocks (blocker_user_id, blocked_user_id)
  where blocked_user_id is not null;
create unique index message_blocks_company_unique
  on public.message_blocks (blocker_user_id, blocked_company_id)
  where blocked_company_id is not null;

alter table public.message_blocks enable row level security;

create policy "message_blocks_select_own" on public.message_blocks
  for select to authenticated
  using (blocker_user_id = auth.uid() or public.is_platform_admin());

/** Adevărat când `p_initiator` nu mai poate scrie lui `p_owner`. */
create or replace function public.is_blocked(p_initiator uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.message_blocks b
    where b.blocker_user_id = p_owner
      and (
        b.blocked_user_id = p_initiator
        or (b.blocked_company_id is not null and exists (
              select 1 from public.company_members m
              where m.company_id = b.blocked_company_id and m.user_id = p_initiator))
      )
  );
$fn$;

create or replace function public.block_sender(
  p_user_id uuid default null,
  p_company_id uuid default null,
  p_reason text default null
)
returns public.message_blocks
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.message_blocks;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii autentificat' using errcode = '42501';
  end if;
  if (p_user_id is not null)::int + (p_company_id is not null)::int <> 1 then
    raise exception 'Alege o persoană sau o firmă, nu amândouă' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Nu te poți bloca pe tine' using errcode = '22023';
  end if;

  insert into public.message_blocks
    (blocker_user_id, blocked_user_id, blocked_company_id, reason)
  values (auth.uid(), p_user_id, p_company_id, nullif(trim(coalesce(p_reason, '')), ''))
  on conflict do nothing
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Este deja blocat' using errcode = '23505';
  end if;

  perform public.write_audit('message.blocked', 'message_blocks', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$fn$;

create or replace function public.unblock_sender(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.message_blocks;
begin
  select * into v_row from public.message_blocks
  where id = p_block_id and blocker_user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Blocarea nu există' using errcode = 'P0002';
  end if;

  delete from public.message_blocks where id = p_block_id;
  perform public.write_audit('message.unblocked', 'message_blocks', p_block_id,
                             to_jsonb(v_row), null);
end;
$fn$;

grant execute on function public.block_sender(uuid, uuid, text) to authenticated;
grant execute on function public.unblock_sender(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Garda conversației, cu blocarea și comanda
--
-- Reprodusă din 20260922100000 (care o reprodusese din 20260916130200)
-- cu două ramuri noi. Nu se scurtează: partea care derivă proprietarul
-- din anunț și cea care consumă poarta de contact sunt exact regulile pe
-- care nimeni nu trebuie să le poată ocoli, și au fost scrise o dată.
-- ---------------------------------------------------------------------
create or replace function public.guard_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_company uuid;
  v_offer public.offers;
begin
  -- Un fir de comandă nu trece pe aici din contul nimănui. Regula stă în
  -- politica de INSERT, nu aici: funcția asta este SECURITY DEFINER, deci
  -- `current_user` este proprietarul ei și nu spune nimic despre cine a
  -- cerut. RLS spune, și tot RLS este ce `create_order()` ocolește
  -- legitim, fiind la rândul ei SECURITY DEFINER.
  if new.transport_id is not null then
    return new;
  end if;

  -- Firul unei oferte: părțile vin cu oferta, iar poarta de contact nu
  -- se atinge — o lămurire înainte de acceptare este gratis.
  if new.offer_id is not null then
    select * into v_offer from public.offers where id = new.offer_id;
    if v_offer.id is null then
      raise exception 'Oferta nu există' using errcode = 'P0002';
    end if;
    new.last_message_at := null;
    return new;
  end if;

  if new.cargo_listing_id is not null then
    select posted_by, company_id into v_owner, v_company
    from public.cargo_listings where id = new.cargo_listing_id;
  else
    select posted_by, company_id into v_owner, v_company
    from public.truck_listings where id = new.truck_listing_id;
  end if;
  if v_owner is null then
    raise exception 'Anunț inexistent' using errcode = 'P0002';
  end if;

  -- The owner is whoever posted the listing, not what the client sends.
  new.owner_user_id := v_owner;
  new.last_message_at := null;

  if new.initiator_user_id = v_owner
     or (v_company is not null and exists (
           select 1 from public.company_members m
           where m.company_id = v_company and m.user_id = new.initiator_user_id)) then
    raise exception 'Nu poți deschide o conversație pe propriul anunț' using errcode = '42501';
  end if;

  -- Blocat de proprietarul anunțului: nu se deschide un fir nou. Cele
  -- vechi și cele de comandă rămân.
  if public.is_blocked(new.initiator_user_id, v_owner) then
    raise exception 'Nu poți trimite mesaje acestui cont' using errcode = '42501';
  end if;

  -- Same gate and quota as reveal_contact(): a conversation is a contact.
  perform public.consume_contact_access(new.initiator_user_id, new.cargo_listing_id, new.truck_listing_id);
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 7. Cât de repede, și de câte ori același lucru
--
-- Limita este pe om și pe conversație, amândouă pe oră. Garda de
-- duplicat se uită la ultimul mesaj din firul ăsta: două mesaje identice
-- la rând sunt aproape întotdeauna un buton apăsat de două ori.
-- ---------------------------------------------------------------------
-- Invoker, nu definer. O funcție SECURITY DEFINER vede în `current_user`
-- proprietarul ei, nu pe cel care a cerut, deci ramura „sari peste
-- verificare pentru joburi" ar sări întotdeauna. Aceeași greșeală a
-- lăsat firul de comandă deschis oricui, până a spus-o suita de teste.
create or replace function public.guard_message_rate()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  s public.messaging_settings;
  v_total integer;
  v_here integer;
  v_last text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  select * into s from public.messaging_settings where id;

  select count(*) into v_total
  from public.messages m
  where m.sender_user_id = new.sender_user_id
    and m.created_at > now() - interval '1 hour';
  if v_total >= s.max_messages_per_hour then
    raise exception 'Ai trimis prea multe mesaje în ultima oră. Încearcă din nou mai târziu.'
      using errcode = '42501';
  end if;

  select count(*) into v_here
  from public.messages m
  where m.sender_user_id = new.sender_user_id
    and m.conversation_id = new.conversation_id
    and m.created_at > now() - interval '1 hour';
  if v_here >= s.max_per_conversation_per_hour then
    raise exception 'Prea multe mesaje în conversația asta într-o oră.' using errcode = '42501';
  end if;

  select m.body into v_last
  from public.messages m
  where m.conversation_id = new.conversation_id
    and m.sender_user_id = new.sender_user_id
  order by m.created_at desc
  limit 1;
  if v_last is not null and v_last = new.body then
    raise exception 'Ai trimis deja mesajul acesta' using errcode = '23505';
  end if;

  return new;
end;
$fn$;

create trigger messages_guard_rate
  before insert on public.messages
  for each row execute function public.guard_message_rate();

-- ---------------------------------------------------------------------
-- 8. Atașamente
--
-- O tabelă, nu o coloană: `messages.attachment_path` ține una singură,
-- iar brieful cere cinci. Coloana rămâne pentru rândurile vechi și nu
-- mai este scrisă.
--
-- Numai imagini. Un PDF într-o conversație privată este un vector de
-- livrare, iar mesageria nu are nevoie de el — actele merg pe fluxul de
-- documente, unde sunt și verificate.
-- ---------------------------------------------------------------------
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  file_path text not null,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  width integer,
  height integer,
  bytes integer
);

comment on table public.message_attachments is
  'Până la cinci imagini pe mesaj. Doar imagini: un PDF într-o conversație privată este un vector de livrare, iar actele au deja fluxul lor, unde sunt și verificate.';

create index message_attachments_message_idx on public.message_attachments (message_id);
create index message_attachments_conversation_idx on public.message_attachments (conversation_id);

alter table public.message_attachments enable row level security;

create policy "message_attachments_select_participant" on public.message_attachments
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    or public.staff_may_read_conversation(conversation_id)
  );

create policy "message_attachments_insert_sender" on public.message_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_user_id = auth.uid()
    )
  );

/** Cinci, nu șase. Numărătoarea este aici, nu în formular. */
create or replace function public.guard_attachment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_max integer;
  v_have integer;
begin
  select max_attachments into v_max from public.messaging_settings where id;
  select count(*) into v_have from public.message_attachments where message_id = new.message_id;
  if v_have >= v_max then
    raise exception 'Cel mult % imagini pe mesaj', v_max using errcode = '22023';
  end if;
  return new;
end;
$fn$;

create trigger message_attachments_guard_count
  before insert on public.message_attachments
  for each row execute function public.guard_attachment_count();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('message-attachments', 'message-attachments', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Prima parte a căii este conversația, ca la `order-evidence`.
-- `safe_uuid()` întoarce null pentru o cale care nu începe cu un uuid, în
-- loc să ridice o eroare din interiorul unei politici și să doboare
-- fiecare citire a tabelei.
create policy "message_attachments_read_parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_conversation_participant(public.safe_uuid((storage.foldername(name))[1]))
      or public.staff_may_read_conversation(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy "message_attachments_insert_parties" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(public.safe_uuid((storage.foldername(name))[1]))
  );

-- Fără update și fără delete: un atașament este parte din mesaj, iar un
-- mesaj nu se editează. Jobul de retenție rulează ca `service_role`.

-- ---------------------------------------------------------------------
-- 9. Comanda își face firul
--
-- Un trigger, nu o linie în `create_order()`. Prima variantă a fost
-- acolo, cu argumentul că un trigger ascunde exact lucrul pe care cineva
-- îl caută când se întreabă de unde a apărut firul. Argumentul e
-- adevărat și insuficient: `create_order()` nu este singurul drum prin
-- care apare un rând în `transports` — suita de teste inserează direct,
-- și mâine o reparație manuală o va face la fel. „Fiecare comandă are un
-- fir" este o regulă a tabelei, deci stă pe tabelă.
--
-- Legarea de firul dinainte nu mută mesajele. Două adevăruri despre când
-- s-a spus ceva sunt mai rele decât un click în plus.
-- ---------------------------------------------------------------------
create or replace function public.create_order_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_carrier_user uuid;
  v_previous uuid;
begin
  -- `owner_user_id` este cineva care conduce firma transportatoare, ca să
  -- existe o persoană în coloană; cine chiar poate citi firul decide
  -- `can_see_order()`, deci un dispecer care pleacă mâine nu rupe nimic.
  -- Șoferul alocat intră prin aceeași funcție, nu prin coloane.
  select cm.user_id into v_carrier_user
  from public.company_members cm
  where cm.company_id = new.carrier_company_id
  order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end, cm.created_at
  limit 1;

  if v_carrier_user is null and new.shipper_user_id is null then
    return new;
  end if;

  select c.id into v_previous
  from public.conversations c
  where (new.offer_id is not null and c.offer_id = new.offer_id)
     or (c.offer_id is null and c.transport_id is null
         and c.cargo_listing_id is not distinct from new.cargo_listing_id
         and c.truck_listing_id is not distinct from new.truck_listing_id
         and c.initiator_user_id in (
           coalesce(new.shipper_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
           coalesce(v_carrier_user, '00000000-0000-0000-0000-000000000000'::uuid)))
  order by c.created_at
  limit 1;

  insert into public.conversations
    (transport_id, initiator_user_id, owner_user_id, linked_conversation_id)
  values
    (new.id,
     coalesce(new.shipper_user_id, v_carrier_user),
     coalesce(v_carrier_user, new.shipper_user_id),
     v_previous)
  on conflict do nothing;

  return new;
end;
$fn$;

create trigger transports_create_conversation
  after insert on public.transports
  for each row execute function public.create_order_conversation();

-- ---------------------------------------------------------------------
-- 10. Un e-mail pe conversație, nu pe mesaj
--
-- Cel de dinainte trimitea unul pentru fiecare mesaj și numai pe firele
-- de ofertă. Acum acoperă toate trei formele și se grupează: cheia de
-- dedupe poartă fereastra de digest, deci al doilea mesaj în aceleași
-- cincisprezece minute cade pe `on conflict do nothing` în loc să
-- plece. Cine scrie zece rânduri la rând nu trimite zece e-mailuri.
-- ---------------------------------------------------------------------
create or replace function public.queue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c public.conversations;
  s public.messaging_settings;
  v_others uuid[];
  v_other uuid;
  v_to text;
  v_company uuid;
  v_context text;
  v_window bigint;
  v_label text;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    return null;
  end if;
  select * into s from public.messaging_settings where id;

  v_context := public.conversation_kind(c);

  -- Cine trebuie anunțat. Pe un fir de comandă sunt amândouă părțile și
  -- șoferul alocat, minus cel care tocmai a scris.
  if c.transport_id is not null then
    select array_agg(distinct u) into v_others from (
      select t.shipper_user_id as u from public.transports t where t.id = c.transport_id
      union
      select cm.user_id from public.transports t
        join public.company_members cm on cm.company_id = t.carrier_company_id
        where t.id = c.transport_id and cm.role <> 'driver'
      union
      select d.profile_id from public.transports t
        join public.drivers d on d.id = t.driver_id
        where t.id = c.transport_id and d.profile_id is not null
    ) x where u is not null and u <> new.sender_user_id;
  else
    v_others := array_remove(
      array[c.initiator_user_id, c.owner_user_id],
      new.sender_user_id
    );
  end if;

  if v_others is null then
    return null;
  end if;

  -- Fereastra de grupare, ca număr întreg: două mesaje din aceeași
  -- fereastră dau aceeași cheie, iar al doilea nu mai pleacă.
  v_window := floor(extract(epoch from now()) / (s.digest_minutes * 60))::bigint;

  v_label := case v_context
    when 'comanda' then 'comanda'
    when 'oferta' then 'ofertă'
    when 'cerere' then 'cerere'
    else 'traseu'
  end;

  foreach v_other in array v_others loop
    if v_other is null or v_other = new.sender_user_id then
      continue;
    end if;

    select cm.company_id into v_company
    from public.company_members cm where cm.user_id = v_other
    order by cm.created_at limit 1;

    select coalesce(co.contact_email, p.email) into v_to
    from public.profiles p
    left join public.companies co on co.id = v_company
    where p.id = v_other
      and p.email_undeliverable_at is null
      and not p.is_test;

    if v_to is null then
      continue;
    end if;

    -- Firul unei oferte păstrează șablonul lui: „cineva a întrebat ceva
    -- despre oferta ta" spune mai mult decât „ai un mesaj nou", iar
    -- textul exista deja. Ce se schimbă este doar gruparea.
    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email,
       payload, dedupe_key)
    values (
      'email',
      case when c.offer_id is not null then 'offer_question' else 'message_received' end,
      v_other, v_company, v_to,
      jsonb_build_object(
        'conversation_id', c.id,
        'context', v_label,
        'order_id', c.transport_id,
        'offer_id', c.offer_id,
        'request_id', (select o.cargo_listing_id from public.offers o where o.id = c.offer_id),
        'title', coalesce(
          (select l.title from public.offers o
           join public.cargo_listings l on l.id = o.cargo_listing_id
           where o.id = c.offer_id),
          'cererea ta')
      ),
      case when c.offer_id is not null then 'offer_question:' else 'message_received:' end
        || c.id || ':' || v_other || ':' || v_window
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 11. Sesizarea unui mesaj
-- ---------------------------------------------------------------------
create or replace function public.report_message(p_message_id uuid, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_message public.messages;
  v_row public.reports;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii autentificat' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce sesizezi mesajul' using errcode = '22023';
  end if;

  select * into v_message from public.messages where id = p_message_id;
  if v_message.id is null or not public.is_conversation_participant(v_message.conversation_id) then
    raise exception 'Mesajul nu există' using errcode = 'P0002';
  end if;
  if v_message.sender_user_id = auth.uid() then
    raise exception 'Nu îți poți sesiza propriul mesaj' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.reports r
    where r.message_id = p_message_id and r.reporter_user_id = auth.uid()
      and r.status in ('open', 'investigating')
  ) then
    raise exception 'Ai sesizat deja mesajul acesta. Ne uităm peste el.' using errcode = '23505';
  end if;

  insert into public.reports (reporter_user_id, message_id, kind, reason, details)
  values (auth.uid(), p_message_id, 'mesaj', 'Mesaj sesizat', trim(p_reason))
  returning * into v_row;

  perform public.write_audit('report.created', 'reports', v_row.id, null, to_jsonb(v_row));
  return v_row;
end;
$fn$;

grant execute on function public.report_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Retenția
--
-- Conversațiile **fără comandă** se șterg după `retention_months`. Cele
-- cu comandă urmează retenția transportului și nu sunt atinse aici: un
-- transport are obligații contabile în spate, iar discuția despre el
-- face parte din ce s-a stabilit.
--
-- Atașamentele pleacă odată cu mesajele, prin `on delete cascade`.
-- Fișierele din bucket se șterg separat, de aceeași funcție.
-- ---------------------------------------------------------------------
create or replace function public.purge_old_conversations(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.messaging_settings;
  v_cutoff timestamptz;
  v_deleted integer;
begin
  select * into s from public.messaging_settings where id;
  v_cutoff := p_now - make_interval(months => s.retention_months);

  -- Întâi fișierele, cât timp rândurile încă spun unde sunt.
  delete from storage.objects
  where bucket_id = 'message-attachments'
    and public.safe_uuid((storage.foldername(name))[1]) in (
      select c.id from public.conversations c
      where c.transport_id is null
        and coalesce(c.last_message_at, c.created_at) < v_cutoff
    );

  delete from public.conversations c
  where c.transport_id is null
    and coalesce(c.last_message_at, c.created_at) < v_cutoff;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$fn$;

revoke all on function public.purge_old_conversations(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_old_conversations(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 13. Moderarea anunțurilor
--
-- Ascunderea nu este o stare a anunțului, ci două coloane alături de
-- ea. Dacă ar fi fost o valoare în `listing_status`, ascunderea ar fi
-- șters starea reală — „activ", „are oferte", „transportator ales" — și
-- la repunere n-am fi știut unde să ne întoarcem.
--
-- Anunțul rămâne vizibil proprietarului, **cu motivul**. Un anunț care
-- dispare fără explicație este un client care sună să întrebe de ce, iar
-- răspunsul „l-am ascuns" spus la telefon nu ajută pe nimeni.
-- ---------------------------------------------------------------------
alter table public.cargo_listings
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  add column hidden_reason text;

alter table public.truck_listings
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  add column hidden_reason text;

comment on column public.cargo_listings.hidden_reason is
  'De ce a fost scos de pe panou. Arătat proprietarului, nu doar nouă: un anunț care dispare fără explicație este un telefon la care nu avem un răspuns bun.';

create index cargo_listings_hidden_idx on public.cargo_listings (hidden_at) where hidden_at is not null;
create index truck_listings_hidden_idx on public.truck_listings (hidden_at) where hidden_at is not null;

create or replace function public.staff_hide_listing(
  p_cargo_listing_id uuid,
  p_truck_listing_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
  v_after jsonb;
  v_owner uuid;
  v_title text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde un anunț' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce ascunzi anunțul. Motivul îl vede și proprietarul.'
      using errcode = '22023';
  end if;
  if (p_cargo_listing_id is not null)::int + (p_truck_listing_id is not null)::int <> 1 then
    raise exception 'Trimite exact un id de anunț' using errcode = '22023';
  end if;

  if p_cargo_listing_id is not null then
    select to_jsonb(l), l.posted_by, l.title into v_before, v_owner, v_title
    from public.cargo_listings l where l.id = p_cargo_listing_id;
    update public.cargo_listings
    set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
    where id = p_cargo_listing_id
    returning to_jsonb(cargo_listings.*) into v_after;
  else
    select to_jsonb(l), l.posted_by, null into v_before, v_owner, v_title
    from public.truck_listings l where l.id = p_truck_listing_id;
    update public.truck_listings
    set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
    where id = p_truck_listing_id
    returning to_jsonb(truck_listings.*) into v_after;
  end if;

  if v_before is null then
    raise exception 'Anunțul nu există' using errcode = 'P0002';
  end if;

  perform public.write_audit('listing.hidden', 'listings',
                             coalesce(p_cargo_listing_id, p_truck_listing_id),
                             v_before, v_after, trim(p_reason));
  perform public.queue_listing_moderation_notification(v_owner, v_title, trim(p_reason), true);
end;
$fn$;

create or replace function public.staff_restore_listing(
  p_cargo_listing_id uuid,
  p_truck_listing_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
  v_after jsonb;
  v_owner uuid;
  v_title text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate repune un anunț' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce îl repui. Motivul rămâne în jurnal.' using errcode = '22023';
  end if;

  if p_cargo_listing_id is not null then
    select to_jsonb(l), l.posted_by, l.title into v_before, v_owner, v_title
    from public.cargo_listings l where l.id = p_cargo_listing_id;
    update public.cargo_listings
    set hidden_at = null, hidden_by = null, hidden_reason = null
    where id = p_cargo_listing_id
    returning to_jsonb(cargo_listings.*) into v_after;
  else
    select to_jsonb(l), l.posted_by, null into v_before, v_owner, v_title
    from public.truck_listings l where l.id = p_truck_listing_id;
    update public.truck_listings
    set hidden_at = null, hidden_by = null, hidden_reason = null
    where id = p_truck_listing_id
    returning to_jsonb(truck_listings.*) into v_after;
  end if;

  if v_before is null then
    raise exception 'Anunțul nu există' using errcode = 'P0002';
  end if;

  perform public.write_audit('listing.restored', 'listings',
                             coalesce(p_cargo_listing_id, p_truck_listing_id),
                             v_before, v_after, trim(p_reason));
  perform public.queue_listing_moderation_notification(v_owner, v_title, trim(p_reason), false);
end;
$fn$;

grant execute on function public.staff_hide_listing(uuid, uuid, text) to authenticated;
grant execute on function public.staff_restore_listing(uuid, uuid, text) to authenticated;

/**
 * Anunțul ascuns, spus proprietarului.
 *
 * Textul este neutru și poartă motivul exact. Un e-mail care spune „am
 * găsit o problemă" fără să spună care este un e-mail care generează un
 * telefon, iar la telefon spunem oricum motivul.
 */
create or replace function public.queue_listing_moderation_notification(
  p_owner uuid,
  p_title text,
  p_reason text,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_to text;
  v_company uuid;
begin
  if p_owner is null then
    return;
  end if;

  select cm.company_id into v_company
  from public.company_members cm where cm.user_id = p_owner
  order by cm.created_at limit 1;

  select coalesce(co.contact_email, p.email) into v_to
  from public.profiles p
  left join public.companies co on co.id = v_company
  where p.id = p_owner
    and p.email_undeliverable_at is null
    and not p.is_test;

  if v_to is null then
    return;
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
  values (
    'email',
    case when p_hidden then 'listing_hidden' else 'listing_restored' end,
    p_owner, v_company, v_to,
    jsonb_build_object('title', coalesce(p_title, 'anunțul tău'), 'reason', p_reason),
    null
  );
end;
$fn$;

revoke all on function public.queue_listing_moderation_notification(uuid, text, text, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 14. Un anunț ascuns nu mai este pe panou
--
-- Cele două vederi publice, reproduse din 20260921100000 și
-- 20260920100000 cu un singur rând în plus fiecare. `create or replace
-- view` nu poate șterge sau reordona coloane, deci corpul vine în
-- întregime și filtrul se adaugă la `where`.
--
-- Proprietarul își vede în continuare anunțul, în contul lui, cu
-- motivul alături — vederile astea sunt panoul public, nu contul.
-- ---------------------------------------------------------------------
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
  c.loading_county as from_county,
  c.unloading_county as to_county,
  c.expires_at,

  -- Appended by 20260921100000.
  c.loading_lat as from_lat,
  c.loading_lng as from_lng,
  c.unloading_lat as to_lat,
  c.unloading_lng as to_lng
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
join public.profiles p on p.id = c.posted_by
left join public.companies co on co.id = c.company_id
where c.status = 'active'
  and c.hidden_at is null
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  and coalesce(c.loading_to, c.loading_from) >= current_date
  and not p.is_test
  and not coalesce(co.is_test, false);

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
  and t.hidden_at is null
  and coalesce(t.available_to, t.available_from) >= current_date
  and not c.is_test;

-- ---------------------------------------------------------------------
-- 15. Ce citesc ecranele
--
-- Un rând pe conversație, cu tot ce desenează un rând din inbox: cu
-- cine, despre ce, ultimul mesaj, câte necitite. Calculat aici și nu în
-- pagină, pentru că altfel fiecare rând ar fi trei interogări și lista
-- ar fi treizeci.
-- ---------------------------------------------------------------------
create or replace function public.my_conversations(
  p_box text default 'toate',
  p_search text default null
)
returns table (
  id uuid,
  kind text,
  counterparty_name text,
  counterparty_company_id uuid,
  counterparty_user_id uuid,
  from_city text,
  to_city text,
  context_id uuid,
  order_id uuid,
  offer_id uuid,
  request_id uuid,
  route_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  last_message_mine boolean,
  unread integer,
  linked_conversation_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_search text;
begin
  if auth.uid() is null then
    return;
  end if;
  v_search := nullif(trim(coalesce(p_search, '')), '');

  return query
  with mine as (
    select c.*
    from public.conversations c
    where c.initiator_user_id = auth.uid()
       or c.owner_user_id = auth.uid()
       or (c.transport_id is not null and public.can_see_order(c.transport_id))
  ),
  shaped as (
    select
      m.id,
      public.conversation_kind(m) as kind,
      -- Cealaltă parte: firma dacă există, altfel numele persoanei.
      case
        when m.transport_id is not null then (
          select case
            when t.shipper_user_id = auth.uid() or public.is_company_member(t.shipper_company_id)
              then coalesce(cc.display_name, cc.legal_name)
            else coalesce(sc.display_name, sc.legal_name, sp.full_name, 'Client')
          end
          from public.transports t
          left join public.companies cc on cc.id = t.carrier_company_id
          left join public.companies sc on sc.id = t.shipper_company_id
          left join public.profiles sp on sp.id = t.shipper_user_id
          where t.id = m.transport_id
        )
        when m.initiator_user_id = auth.uid() then (
          select coalesce(oc.display_name, oc.legal_name, op.full_name, 'Utilizator')
          from public.profiles op
          left join public.company_members ocm on ocm.user_id = op.id
          left join public.companies oc on oc.id = ocm.company_id
          where op.id = m.owner_user_id
          limit 1
        )
        else (
          select coalesce(ic.display_name, ic.legal_name, ip.full_name, 'Utilizator')
          from public.profiles ip
          left join public.company_members icm on icm.user_id = ip.id
          left join public.companies ic on ic.id = icm.company_id
          where ip.id = m.initiator_user_id
          limit 1
        )
      end as counterparty_name,
      null::uuid as counterparty_company_id,
      case when m.initiator_user_id = auth.uid() then m.owner_user_id
           else m.initiator_user_id end as counterparty_user_id,
      coalesce(cl.loading_city, tl.from_city,
               (select l2.loading_city from public.transports t2
                left join public.cargo_listings l2 on l2.id = t2.cargo_listing_id
                where t2.id = m.transport_id)) as from_city,
      coalesce(cl.unloading_city, tl.to_city,
               (select l3.unloading_city from public.transports t3
                left join public.cargo_listings l3 on l3.id = t3.cargo_listing_id
                where t3.id = m.transport_id)) as to_city,
      coalesce(m.transport_id, m.offer_id, m.cargo_listing_id, m.truck_listing_id) as context_id,
      m.transport_id as order_id,
      m.offer_id as offer_id,
      m.cargo_listing_id as request_id,
      m.truck_listing_id as route_id,
      m.last_message_at,
      (select msg.body from public.messages msg
       where msg.conversation_id = m.id and msg.hidden_at is null
       order by msg.created_at desc limit 1) as last_message_body,
      (select msg.sender_user_id = auth.uid() from public.messages msg
       where msg.conversation_id = m.id and msg.hidden_at is null
       order by msg.created_at desc limit 1) as last_message_mine,
      (select count(*)::integer from public.messages msg
       where msg.conversation_id = m.id
         and msg.sender_user_id <> auth.uid()
         and msg.read_at is null
         and msg.hidden_at is null) as unread,
      m.linked_conversation_id
    from mine m
    left join public.cargo_listings cl on cl.id = m.cargo_listing_id
    left join public.truck_listings tl on tl.id = m.truck_listing_id
  )
  select * from shaped s
  where (p_box = 'toate'
         or (p_box = 'necitite' and s.unread > 0)
         or (p_box = 'comenzi' and s.kind = 'comanda')
         or (p_box = 'oferte' and s.kind = 'oferta'))
    and (v_search is null
         or s.counterparty_name ilike '%' || v_search || '%'
         or s.from_city ilike '%' || v_search || '%'
         or s.to_city ilike '%' || v_search || '%')
  order by s.last_message_at desc nulls last, s.id;
end;
$fn$;

grant execute on function public.my_conversations(text, text) to authenticated;

/** Câte mesaje necitite are persoana asta, peste tot. Pentru insigna din meniu. */
create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(unread), 0)::integer from public.my_conversations('toate');
$fn$;

grant execute on function public.unread_message_count() to authenticated;

/** Mesajele unui fir, cu atașamentele numărate. */
create or replace function public.conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  sender_user_id uuid,
  sender_name text,
  mine boolean,
  body text,
  was_masked boolean,
  hidden_at timestamptz,
  read_at timestamptz,
  attachments text[]
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_conversation_participant(p_conversation_id)
     and not public.staff_may_read_conversation(p_conversation_id) then
    raise exception 'Conversația nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    m.id, m.created_at, m.sender_user_id,
    coalesce(co.display_name, co.legal_name, p.full_name, 'Utilizator'),
    m.sender_user_id = auth.uid(),
    case when m.hidden_at is null then m.body else null end,
    m.was_masked,
    m.hidden_at,
    m.read_at,
    coalesce(
      (select array_agg(a.file_path order by a.created_at)
       from public.message_attachments a where a.message_id = m.id),
      array[]::text[]
    )
  from public.messages m
  join public.profiles p on p.id = m.sender_user_id
  left join public.company_members cm on cm.user_id = p.id
  left join public.companies co on co.id = cm.company_id
  where m.conversation_id = p_conversation_id
  order by m.created_at;
end;
$fn$;

grant execute on function public.conversation_messages(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 16. Ce citește echipa
-- ---------------------------------------------------------------------
create or replace function public.admin_listings(
  p_kind text default 'cereri',
  p_status text default null,
  p_company_id uuid default null,
  p_hidden boolean default null,
  p_reported boolean default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  title text,
  status text,
  from_city text,
  to_city text,
  owner_name text,
  company_id uuid,
  company_name text,
  hidden_at timestamptz,
  hidden_reason text,
  photo_count integer,
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
    raise exception 'Doar echipa platformei poate vedea anunțurile' using errcode = '42501';
  end if;

  if p_kind = 'trasee' then
    return query
    select
      t.id, t.created_at,
      (t.from_city || ' → ' || t.to_city)::text,
      t.status::text, t.from_city, t.to_city,
      coalesce(p.full_name, 'Utilizator'),
      t.company_id,
      coalesce(co.display_name, co.legal_name),
      t.hidden_at, t.hidden_reason,
      0,
      (select count(*) from public.reports r where r.cargo_listing_id = t.id),
      count(*) over ()
    from public.truck_listings t
    join public.profiles p on p.id = t.posted_by
    left join public.companies co on co.id = t.company_id
    where (p_status is null or t.status::text = p_status)
      and (p_company_id is null or t.company_id = p_company_id)
      and (p_hidden is null or (t.hidden_at is not null) = p_hidden)
      and (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at < (p_to + 1))
      and (p_reported is not true or exists (
            select 1 from public.reports r where r.cargo_listing_id = t.id))
    order by t.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
  else
    return query
    select
      c.id, c.created_at,
      coalesce(c.title, c.loading_city || ' → ' || c.unloading_city)::text,
      c.status::text, c.loading_city, c.unloading_city,
      coalesce(p.full_name, 'Utilizator'),
      c.company_id,
      coalesce(co.display_name, co.legal_name),
      c.hidden_at, c.hidden_reason,
      coalesce(array_length(c.photo_paths, 1), 0),
      (select count(*) from public.reports r where r.cargo_listing_id = c.id),
      count(*) over ()
    from public.cargo_listings c
    join public.profiles p on p.id = c.posted_by
    left join public.companies co on co.id = c.company_id
    where (p_status is null or c.status::text = p_status)
      and (p_company_id is null or c.company_id = p_company_id)
      and (p_hidden is null or (c.hidden_at is not null) = p_hidden)
      and (p_from is null or c.created_at >= p_from)
      and (p_to is null or c.created_at < (p_to + 1))
      and (p_reported is not true or exists (
            select 1 from public.reports r where r.cargo_listing_id = c.id))
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
  end if;
end;
$fn$;

grant execute on function public.admin_listings(
  text, text, uuid, boolean, boolean, date, date, integer, integer
) to authenticated;

/**
 * Conversațiile pe care echipa le poate deschide, și numai ele.
 *
 * Lista nu este „toate conversațiile filtrate": este chiar mulțimea pe
 * care `staff_may_read_conversation()` o permite. Dacă cineva ar lărgi
 * într-o zi funcția aia, se lărgește și lista — un singur loc de
 * schimbat, nu două care se pot depărta.
 */
create or replace function public.admin_conversations(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  last_message_at timestamptz,
  order_id uuid,
  report_count bigint,
  disputed boolean,
  participants text,
  message_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea conversațiile sesizate' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    public.conversation_kind(c),
    c.created_at,
    c.last_message_at,
    c.transport_id,
    (select count(*) from public.reports r
     join public.messages m on m.id = r.message_id
     where m.conversation_id = c.id),
    exists (select 1 from public.transports t
            where t.id = c.transport_id and t.disputed_at is not null),
    (coalesce(ip.full_name, '—') || ' ↔ ' || coalesce(op.full_name, '—'))::text,
    (select count(*) from public.messages m where m.conversation_id = c.id),
    count(*) over ()
  from public.conversations c
  left join public.profiles ip on ip.id = c.initiator_user_id
  left join public.profiles op on op.id = c.owner_user_id
  where public.staff_may_read_conversation(c.id)
  order by c.last_message_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

grant execute on function public.admin_conversations(integer, integer) to authenticated;

/**
 * Sesizările și deciziile de moderare, pe un interval, ca CSV.
 *
 * Un singur rând per decizie, cu ce s-a făcut și de ce. Se generează
 * aici și nu în pagină pentru că jurnalul este în bază și o a doua
 * definiție a lui „decizie de moderare" ar diverge de prima.
 */
create or replace function public.export_moderation_csv(p_from date, p_to date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate exporta' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Alege un interval valid' using errcode = '22023';
  end if;

  select string_agg(line, E'\n' order by at)
  into v_out
  from (
    select
      r.created_at as at,
      format('%s,%s,%s,%s,%s,%s',
        to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'sesizare',
        r.kind,
        r.status,
        coalesce(replace(r.reason, ',', ' '), ''),
        coalesce(replace(r.resolution, ',', ' '), '')
      ) as line
    from public.reports r
    where r.created_at >= p_from and r.created_at < (p_to + 1)
    union all
    select
      a.created_at,
      format('%s,%s,%s,%s,%s,%s',
        to_char(a.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF'),
        'moderare',
        a.action,
        a.actor_role,
        coalesce(replace(a.reason, ',', ' '), ''),
        coalesce(a.entity, '')
      )
    from public.audit_log a
    where a.created_at >= p_from and a.created_at < (p_to + 1)
      and a.action in ('listing.hidden', 'listing.restored', 'message.hidden',
                       'rating.hidden', 'rating.unhidden', 'order_evidence.hidden')
  ) rows;

  return 'data,tip,ce,stare,motiv,detalii' || E'\n' || coalesce(v_out, '');
end;
$fn$;

grant execute on function public.export_moderation_csv(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 17. Catalogul de notificări
-- ---------------------------------------------------------------------
update public.notification_types
set is_available = true,
    deep_link = '/cont/mesaje',
    default_push = true,
    description_ro = 'Cineva ți-a scris. E-mailurile se grupează: cel mult unul la 15 minute pe conversație.'
where code = 'message_received';

insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('listing_hidden', 'Anunț scos de pe panou',
   'Un anunț al tău a fost scos de pe panou. Mesajul poartă motivul.',
   'both', true, true, false, '/cont/cereri', true, 500),
  ('listing_restored', 'Anunț repus pe panou', null,
   'both', false, false, false, '/cont/cereri', true, 510)
on conflict (code) do update
set label_ro = excluded.label_ro,
    description_ro = excluded.description_ro,
    audience = excluded.audience,
    default_push = excluded.default_push,
    is_mandatory = excluded.is_mandatory,
    deep_link = excluded.deep_link,
    is_available = excluded.is_available,
    sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 18. Jobul de retenție
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci retenția conversațiilor nu este programată. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-conversation-retention', '50 3 * * *',
                        'select public.purge_old_conversations();');
end;
$cron$;

-- ---------------------------------------------------------------------
-- 19. Sănătatea joburilor
--
-- Reprodusă din 20260924100000 cu jobul nou în ambele liste pe care le
-- poartă funcția — una pentru drumul normal, una pentru handlerul de
-- excepție care rulează când schema `cron` lipsește. Un job trecut doar
-- în prima pare sănătos exact în situația în care nu este.
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
      ('nightly-conversation-retention', 36.0),
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
      ('nightly-conversation-retention', 36.0),
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
-- 20. Firul comenzii nu se maschează
--
-- `guard_message_contacts()` reprodusă din 20260922100000 cu un caz în
-- plus. Citea anunțul din conversație sau din oferta ei ca să întrebe
-- `has_agreed_order()`; un fir de comandă nu are niciunul, deci
-- răspunsul era „nu" și masca se aplica peste numerele pe care cele două
-- părți tocmai și le dăduseră legal.
-- ---------------------------------------------------------------------
create or replace function public.guard_message_contacts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c public.conversations;
  v_masked text;
  v_cargo uuid;
  v_truck uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    raise exception 'Conversația nu există' using errcode = 'P0002';
  end if;

  if coalesce(trim(new.body), '') = '' then
    raise exception 'Scrie un mesaj' using errcode = '22023';
  end if;
  if length(new.body) > 1000 then
    raise exception 'Mesajul poate avea cel mult 1000 de caractere' using errcode = '22023';
  end if;

  -- Firul unei comenzi nu se maschează niciodată: contactele sunt deja
  -- schimbate, `order_contacts()` le-a dat. Adăugat de 20260925100000,
  -- când forma a treia de conversație a apărut și n-avea nici anunț,
  -- nici ofertă din care să se citească starea.
  if c.transport_id is not null then
    return new;
  end if;

  v_cargo := c.cargo_listing_id;
  v_truck := c.truck_listing_id;
  if c.offer_id is not null then
    select o.cargo_listing_id, o.truck_listing_id into v_cargo, v_truck
    from public.offers o where o.id = c.offer_id;
  end if;

  -- Once there is an order between these two, the contacts are theirs
  -- to exchange: `consume_contact_access` already gives them away free.
  if not public.has_agreed_order(new.sender_user_id, v_cargo, v_truck) then
    v_masked := public.mask_contacts(new.body);
    if v_masked is distinct from new.body then
      new.body := v_masked;
      new.was_masked := true;
    end if;
  end if;

  return new;
end;
$fn$;


-- ---------------------------------------------------------------------
-- 21. Realtime
-- ---------------------------------------------------------------------
--
-- `messages` intră în publicația realtime ca să nu aștepte nimeni
-- cincisprezece secunde pentru un mesaj.
--
-- Evenimentul este numai un semnal — „uită-te din nou". Ecranul nu
-- desenează nimic din payload; recitește prin `conversation_messages()`,
-- care verifică încă o dată cine întreabă și aplică aceleași reguli ca
-- la prima încărcare. Deci chiar dacă publicația ar trimite un rând mai
-- mult decât trebuie, nu ajunge pe niciun ecran. Cine primește
-- evenimentul rămâne oricum treaba lui `messages_select_participant`,
-- pe care Realtime îl evaluează cu rolul celui abonat.
--
-- Blocul condiționat este pentru baza de probă din `pnpm db:test`, unde
-- publicația `supabase_realtime` nu există: acolo pasul ăsta nu face
-- nimic, iar restul migrării trece mai departe.
do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$realtime$;
