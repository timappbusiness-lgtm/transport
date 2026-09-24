-- =====================================================================
-- Faza 3 — contractul de transport
--
-- Din comanda care există după o ofertă acceptată, oricare dintre părți
-- generează un contract de transport completat din datele pe care le
-- avem deja și pe care le-am verificat: firmele, actele transportatorului
-- cu datele lor, vehiculul, ruta, prețul. Contractul se acceptă electronic
-- din cont, de fiecare parte, iar acceptarea se înregistrează.
--
-- Ce ține baza de date, și de ce aici:
--
--   * Instantaneul (`snapshot`). La generare se copiază fiecare valoare
--     folosită în document, iar documentul se desenează numai din el. O
--     firmă care își schimbă adresa mâine, un ITP reînnoit, o comandă
--     reprogramată nu schimbă un contract deja generat: se generează o
--     versiune nouă, iar cea veche rămâne cum a fost.
--   * Instantaneul se construiește AICI, din tabele, nu primit de la
--     aplicație. Frontendul nu este graniță de securitate: un instantaneu
--     trimis de client ar fi un contract în care fiecare își scrie ce preț
--     vrea. Singurul lucru primit din afară este blocul operatorului
--     platformei (vezi `generate_order_contract`).
--   * Acceptarea: cine (`auth.uid()`, pus de bază), când (`now()`, pus de
--     bază), ce versiune (amprenta instantaneului), plus IP-ul și
--     browserul raportate de serverul aplicației. Imuabilă, auditată, una
--     pe parte pe versiune.
--   * PDF-ul nu stă aici. Îl desenează funcția `contract-pdf` din
--     instantaneu și îl păstrează în bucketul privat `order-contracts`,
--     în care numai ea scrie (rolul de serviciu). Nimeni altcineva nu are
--     drept de scriere acolo, deci un fișier pus în cache nu poate fi
--     înlocuit de o parte cu altul.
--
-- Nu este semnătură electronică calificată și nu se prezintă ca atare:
-- se numește „acceptare electronică în platformă" și spune ce
-- înregistrează.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reprezentantul legal al unei firme
--
-- Contractul numește cine reprezintă fiecare firmă, iar până acum nu
-- aveam unde ține asta: ANAF nu îl dă. Îl completează firma, în profil;
-- nu este dată de identificare blocată după verificare (garda
-- `guard_company_write` nu îl privește), pentru că administratorul unei
-- firme se schimbă fără ca firma să devină alta.
-- ---------------------------------------------------------------------
alter table public.companies
  add column legal_representative text
    check (legal_representative is null
           or (length(btrim(legal_representative)) between 3 and 120));

comment on column public.companies.legal_representative is
  'Numele și calitatea reprezentantului legal („Ion Popescu, administrator"), completate de firmă. Apare pe contractul de transport.';

-- ---------------------------------------------------------------------
-- 2. Tabelele
-- ---------------------------------------------------------------------
create table public.order_contracts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.transports (id) on delete restrict,
  version integer not null check (version >= 1),
  -- Același pentru toate versiunile aceleiași comenzi.
  contract_number text not null check (contract_number ~ '^CT-[0-9]{4}-[0-9A-F]{8}$'),
  -- Versiunea textului contractului (`contract-pdf/templates/`), nu a
  -- instantaneului. Versiunile vechi ale textului rămân în repo.
  template_version text not null check (template_version ~ '^[0-9]+\.[0-9]+$'),
  snapshot jsonb not null,
  -- sha256 al instantaneului, așa cum a fost generat. Acceptarea îl
  -- copiază: arată exact ce s-a acceptat, chiar dacă instantaneul este
  -- anonimizat mai târziu, la ștergerea la cerere.
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz not null default now(),
  -- Fără cheie străină, ca în `audit_log`: rândul supraviețuiește
  -- ștergerii contului care l-a generat.
  generated_by uuid,
  generated_by_side text not null check (generated_by_side in ('carrier', 'client', 'staff')),
  redacted_at timestamptz,
  constraint order_contracts_version_unique unique (order_id, version),
  constraint order_contracts_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

create index order_contracts_order_idx on public.order_contracts (order_id, version desc);

comment on table public.order_contracts is
  'Versiunile contractului de transport al unei comenzi. Instantaneul nu se modifică; o versiune nouă se generează separat.';

create table public.order_contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.order_contracts (id) on delete restrict,
  order_id uuid not null references public.transports (id) on delete restrict,
  side text not null check (side in ('carrier', 'client')),
  -- Fără cheie străină: acceptarea rămâne după ștergerea contului.
  user_id uuid,
  accepted_by_name text,
  company_id uuid,
  company_name text,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint order_contract_acceptances_one_per_side unique (contract_id, side)
);

create index order_contract_acceptances_order_idx
  on public.order_contract_acceptances (order_id);

comment on table public.order_contract_acceptances is
  'Acceptarea electronică în platformă a unei versiuni de contract: cine, când, de pe ce IP și din ce browser. Una pe parte pe versiune. Nu este semnătură electronică calificată.';

-- ---------------------------------------------------------------------
-- 3. Imuabile
--
-- Nici o parte, nici echipa, nici un job nu modifică sau șterge un
-- contract generat. Singura portiță este flagul de sesiune
-- `app.contract_retention`, pe care îl pune numai
-- `redact_order_contracts()` — nu `current_user`, care într-o funcție
-- SECURITY DEFINER este proprietarul ei (CLAUDE.md, Securitate 1).
-- ---------------------------------------------------------------------
create or replace function public.guard_order_contract_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_setting('app.contract_retention', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  raise exception 'Un contract generat nu se modifică și nu se șterge. Generează o versiune nouă.'
    using errcode = '42501';
end;
$fn$;

revoke all on function public.guard_order_contract_immutable() from public, anon, authenticated;

create trigger order_contracts_immutable
  before update or delete on public.order_contracts
  for each row execute function public.guard_order_contract_immutable();

create trigger order_contract_acceptances_immutable
  before update or delete on public.order_contract_acceptances
  for each row execute function public.guard_order_contract_immutable();

-- ---------------------------------------------------------------------
-- 4. Cine este parte
--
-- Clientul (persoana fizică sau firma care a publicat cererea) și
-- transportatorul, fără șoferii lor: contractul are prețul și datele de
-- identificare ale firmelor, iar un șofer vede comanda lui, nu
-- contractul ei. Echipa vede tot, dar nu acceptă în numele nimănui.
-- ---------------------------------------------------------------------
create or replace function public.order_contract_side(p_order public.transports)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when auth.uid() is null then null
    when public.is_platform_admin() then 'staff'
    when public.is_company_operator(p_order.carrier_company_id) then 'carrier'
    when p_order.shipper_user_id = auth.uid() then 'client'
    when p_order.shipper_company_id is not null
         and public.is_company_operator(p_order.shipper_company_id) then 'client'
    else null
  end;
$fn$;

revoke all on function public.order_contract_side(public.transports) from public, anon, authenticated;

create or replace function public.can_see_order_contract(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select public.order_contract_side(t) is not null
     from public.transports t where t.id = p_order_id),
    false);
$fn$;

comment on function public.can_see_order_contract(uuid) is
  'Părțile unei comenzi (fără șoferi) și echipa. Folosită de politicile pe contracte și pe bucketul order-contracts.';

revoke all on function public.can_see_order_contract(uuid) from public, anon;
grant execute on function public.can_see_order_contract(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Acces
--
-- Citire directă numai pentru părți și echipă. Scriere: nimeni, prin
-- nicio cale în afara RPC-urilor de mai jos. IP-ul și browserul
-- acceptării nu se citesc direct nici de părți: le vede echipa, prin
-- `admin_order_contracts()`.
-- ---------------------------------------------------------------------
alter table public.order_contracts enable row level security;
alter table public.order_contract_acceptances enable row level security;

create policy order_contracts_select_parties on public.order_contracts
  for select to authenticated
  using (public.can_see_order_contract(order_id));

create policy order_contract_acceptances_select_parties on public.order_contract_acceptances
  for select to authenticated
  using (public.can_see_order_contract(order_id));

revoke all on public.order_contracts from anon, authenticated;
revoke all on public.order_contract_acceptances from anon, authenticated;
grant select on public.order_contracts to authenticated;
grant select (id, contract_id, order_id, side, user_id, accepted_by_name, company_id,
              company_name, accepted_at, snapshot_hash)
  on public.order_contract_acceptances to authenticated;

-- ---------------------------------------------------------------------
-- 6. Versiunea textului și numărul contractului
--
-- Textul contractului stă în `supabase/functions/contract-pdf/templates/`,
-- câte un fișier pe versiune, iar cele vechi rămân. O versiune nouă a
-- textului este un fișier nou acolo și o migrare nouă care schimbă
-- constanta de mai jos: un contract deja generat se desenează mereu cu
-- textul versiunii lui.
-- ---------------------------------------------------------------------
create or replace function public.contract_template_version()
returns text
language sql
immutable
set search_path = public
as $fn$
  select '1.0'::text;
$fn$;

revoke all on function public.contract_template_version() from public, anon, authenticated;

create or replace function public.contract_number_for(p_order public.transports)
returns text
language sql
stable
set search_path = public
as $fn$
  select 'CT-' || to_char(p_order.created_at at time zone 'Europe/Bucharest', 'YYYY')
         || '-' || upper(left(replace(p_order.id::text, '-', ''), 8));
$fn$;

revoke all on function public.contract_number_for(public.transports) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Instantaneul
--
-- Totul, într-un singur jsonb, din tabele: comanda, oferta acceptată,
-- cererea cu vehiculul transportat, cele două părți, actele aprobate ale
-- transportatorului cu datele lor și vehiculul — cel alocat comenzii sau,
-- până la alocare, cel propus în ofertă. Nimic calculat pentru afișare:
-- formatarea în română este treaba documentului.
--
-- Fără CNP și fără adresă pentru o persoană fizică: nu le avem și nu le
-- cerem. Numele și datele de contact din cont ajung.
-- ---------------------------------------------------------------------
create or replace function public.contract_party_company(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'kind', 'company',
    'id', c.id,
    'legal_name', c.legal_name,
    'display_name', c.display_name,
    'cui', c.cui,
    'reg_com', c.reg_com,
    'vat_payer', c.vat_payer,
    'address', c.address,
    'city', c.city,
    'county', c.county,
    'country', c.country,
    'legal_representative', c.legal_representative,
    'contact_email', coalesce(c.contact_email, c.alerts_email),
    'contact_phone', c.contact_phone,
    'verification_status', c.verification_status,
    'verified_at', c.verified_at
  )
  from public.companies c
  where c.id = p_company_id;
$fn$;

revoke all on function public.contract_party_company(uuid) from public, anon, authenticated;

/** The approved document of a kind, the one valid longest first. */
create or replace function public.contract_document(
  p_scope public.document_scope,
  p_owner uuid,
  p_kind public.document_kind
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'kind', d.kind,
    'label', coalesce(r.label_ro, d.kind::text),
    'number', d.document_number,
    'issued_at', d.issued_at,
    'valid_from', d.valid_from,
    'valid_until', d.valid_until,
    'reviewed_at', d.reviewed_at
  )
  from public.documents d
  left join public.document_requirements r on r.scope = d.scope and r.kind = d.kind
  where d.scope = p_scope
    and d.kind = p_kind
    and d.status = 'approved'
    and (case when p_scope = 'company' then d.company_id else d.vehicle_id end) = p_owner
  order by d.valid_until desc nulls last, d.reviewed_at desc nulls last
  limit 1;
$fn$;

revoke all on function public.contract_document(public.document_scope, uuid, public.document_kind)
  from public, anon, authenticated;

create or replace function public.order_contract_snapshot(
  p_order public.transports,
  p_version integer,
  p_side text,
  p_operator jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_offer public.offers;
  v_listing public.cargo_listings;
  v_cargo public.cargo_vehicle_details;
  v_client jsonb;
  v_vehicle public.vehicles;
  v_vehicle_source text;
  v_cc_required boolean;
  v_company_docs jsonb;
  v_vehicle_docs jsonb;
  v_generator text;
begin
  if p_order.offer_id is not null then
    select * into v_offer from public.offers where id = p_order.offer_id;
  end if;
  if p_order.cargo_listing_id is not null then
    select * into v_listing from public.cargo_listings where id = p_order.cargo_listing_id;
    select * into v_cargo from public.cargo_vehicle_details where cargo_listing_id = p_order.cargo_listing_id;
  end if;

  if p_order.shipper_company_id is not null then
    v_client := public.contract_party_company(p_order.shipper_company_id);
  else
    select jsonb_build_object(
      'kind', 'individual',
      'full_name', p.full_name,
      'email', p.email,
      'phone', p.phone
    ) into v_client
    from public.profiles p
    where p.id = coalesce(p_order.shipper_user_id, v_listing.posted_by);
  end if;

  -- The vehicle on the order once it is assigned; until then the one the
  -- carrier offered, which is what the client accepted.
  if p_order.vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = p_order.vehicle_id;
    v_vehicle_source := 'order';
  elsif v_offer.vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id = v_offer.vehicle_id;
    v_vehicle_source := 'offered';
  end if;

  select coalesce(jsonb_agg(doc order by ord), '[]'::jsonb) into v_company_docs
  from (
    select public.contract_document('company', p_order.carrier_company_id, k.kind) as doc, k.ord
    from (values ('licenta_comunitara'::public.document_kind, 1),
                 ('licenta_transport_national'::public.document_kind, 2),
                 ('asigurare_cmr'::public.document_kind, 3)) as k(kind, ord)
  ) s
  where doc is not null;

  if v_vehicle.id is not null then
    select coalesce(jsonb_agg(doc order by ord), '[]'::jsonb) into v_vehicle_docs
    from (
      select public.contract_document('vehicle', v_vehicle.id, k.kind) as doc, k.ord
      from (values ('itp'::public.document_kind, 1),
                   ('rca'::public.document_kind, 2),
                   ('copie_conforma'::public.document_kind, 3)) as k(kind, ord)
    ) s
    where doc is not null;

    -- The same rule the compliance views apply: required unless the
    -- vehicle's type is excluded, or not listed where a list is kept.
    select coalesce(
      (select (r.for_vehicle_types is null or v_vehicle.vehicle_type = any (r.for_vehicle_types))
              and not (v_vehicle.vehicle_type = any (coalesce(r.excluded_vehicle_types, '{}')))
       from public.document_requirements r
       where r.scope = 'vehicle' and r.kind = 'copie_conforma' and r.is_active),
      false)
    into v_cc_required;
  end if;

  select p.full_name into v_generator from public.profiles p where p.id = auth.uid();

  return jsonb_build_object(
    'schema', 1,
    'template', public.contract_template_version(),
    'contract_number', public.contract_number_for(p_order),
    'version', p_version,
    'generated_at', now(),
    'generated_by', jsonb_build_object('name', v_generator, 'side', p_side),
    'operator', p_operator,
    'order', jsonb_build_object(
      'id', p_order.id,
      'created_at', p_order.created_at,
      'status', p_order.status,
      'agreed_price', p_order.agreed_price,
      'currency', p_order.currency,
      'payment_term_days', p_order.payment_term_days,
      'pickup_from', p_order.pickup_from,
      'pickup_to', p_order.pickup_to,
      'delivery_from', p_order.delivery_from,
      'delivery_to', p_order.delivery_to,
      'cmr_number', p_order.cmr_number
    ),
    'offer', case when v_offer.id is null then null else jsonb_build_object(
      'id', v_offer.id,
      'price_amount', v_offer.price_amount,
      'currency', v_offer.currency,
      'payment_term_days', v_offer.payment_term_days,
      'conditions', v_offer.conditions,
      'estimated_pickup_date', v_offer.estimated_pickup_date,
      'estimated_delivery_date', v_offer.estimated_delivery_date,
      'accepted_at', v_offer.responded_at
    ) end,
    'request', case when v_listing.id is null then null else jsonb_build_object(
      'id', v_listing.id,
      'title', v_listing.title,
      'description', v_listing.description,
      'service_type', v_listing.service_type,
      'loading', jsonb_build_object('city', v_listing.loading_city, 'county', v_listing.loading_county,
                                    'country', v_listing.loading_country),
      'unloading', jsonb_build_object('city', v_listing.unloading_city, 'county', v_listing.unloading_county,
                                      'country', v_listing.unloading_country),
      'loading_from', v_listing.loading_from,
      'loading_to', v_listing.loading_to,
      'unloading_from', v_listing.unloading_from,
      'unloading_to', v_listing.unloading_to
    ) end,
    'cargo', case when v_cargo.cargo_listing_id is null then null else jsonb_build_object(
      'category', v_cargo.category,
      'make', v_cargo.make,
      'model', v_cargo.model,
      'year', v_cargo.year,
      'vin', v_cargo.vin,
      'plate_number', v_cargo.plate_number,
      'is_running', v_cargo.is_running,
      'wheels_turn', v_cargo.wheels_turn,
      'steering_works', v_cargo.steering_works,
      'brakes_work', v_cargo.brakes_work,
      'has_keys', v_cargo.has_keys,
      'needs_winch', v_cargo.needs_winch,
      'is_damaged', v_cargo.is_damaged,
      'damage_notes', v_cargo.damage_notes,
      'weight_kg', v_cargo.weight_kg
    ) end,
    'carrier', public.contract_party_company(p_order.carrier_company_id),
    'client', v_client,
    'credentials', jsonb_build_object(
      'company_documents', v_company_docs,
      'vehicle', case when v_vehicle.id is null then null else jsonb_build_object(
        'source', v_vehicle_source,
        'plate_number', v_vehicle.plate_number,
        'make', v_vehicle.make,
        'model', v_vehicle.model,
        'year', v_vehicle.year,
        'vehicle_type', v_vehicle.vehicle_type,
        'copie_conforma_required', v_cc_required,
        'documents', coalesce(v_vehicle_docs, '[]'::jsonb)
      ) end
    )
  );
end;
$fn$;

revoke all on function public.order_contract_snapshot(public.transports, integer, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Operatorul platformei
--
-- Singura valoare din instantaneu care nu vine din tabele: datele
-- operatorului stau în `src/config/company.ts`, nu în bază. Aplicația le
-- trimite; aici se păstrează numai cheile știute, ca text scurt. Cine ar
-- chema funcția direct cu alt bloc ar scrie numele operatorului greșit pe
-- un contract generat de el însuși, cu numele lui în jurnal — nu prețul,
-- nu părțile, nu actele, care vin toate din tabele.
-- ---------------------------------------------------------------------
create or replace function public.contract_operator_block(p_operator jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v_key text;
  v_out jsonb := '{}'::jsonb;
  v_value jsonb;
begin
  if p_operator is null or jsonb_typeof(p_operator) <> 'object' then
    return v_out;
  end if;
  foreach v_key in array array['brand', 'legal_name', 'cui', 'reg_com', 'address', 'email', 'phone'] loop
    v_value := p_operator -> v_key;
    if v_value is not null and jsonb_typeof(v_value) = 'string' then
      v_out := v_out || jsonb_build_object(v_key, left(btrim(v_value #>> '{}'), 200));
    end if;
  end loop;
  return v_out;
end;
$fn$;

revoke all on function public.contract_operator_block(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Notificările: contract generat, contract acceptat
--
-- Către cealaltă parte: cine generează sau acceptă știe deja. Când
-- generează echipa, află amândouă. E-mailul are legătura spre contract
-- în pagina comenzii; push-ul trece prin `queue_push`, cu preferințele
-- și orele de liniște ale fiecăruia.
-- ---------------------------------------------------------------------
create or replace function public.queue_contract_notification(
  p_order public.transports,
  p_contract public.order_contracts,
  p_kind text,
  p_actor_side text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing public.cargo_listings;
  v_carrier public.companies;
  v_client_name text;
  v_carrier_email text;
  v_client_email text;
  v_client_user uuid;
  v_payload jsonb;
  v_actor_name text;
  v_title text;
  v_body text;
begin
  select * into v_listing from public.cargo_listings where id = p_order.cargo_listing_id;
  select * into v_carrier from public.companies where id = p_order.carrier_company_id;
  v_client_user := coalesce(p_order.shipper_user_id, v_listing.posted_by);

  if p_order.shipper_company_id is not null then
    select coalesce(sc.display_name, sc.legal_name), coalesce(sc.alerts_email, sc.contact_email)
      into v_client_name, v_client_email
    from public.companies sc where sc.id = p_order.shipper_company_id;
  end if;
  if v_client_email is null or v_client_name is null then
    select coalesce(v_client_name, p.full_name), coalesce(v_client_email, p.email)
      into v_client_name, v_client_email
    from public.profiles p where p.id = v_client_user;
  end if;

  v_carrier_email := coalesce(v_carrier.alerts_email, v_carrier.contact_email);
  if v_carrier_email is null then
    select p.email into v_carrier_email
    from public.company_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.company_id = p_order.carrier_company_id
    order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end
    limit 1;
  end if;

  v_actor_name := case p_actor_side
    when 'carrier' then coalesce(v_carrier.display_name, v_carrier.legal_name)
    when 'client' then v_client_name
    else 'Echipa platformei'
  end;

  v_payload := jsonb_build_object(
    'order_id', p_order.id,
    'contract_id', p_contract.id,
    'contract_number', p_contract.contract_number,
    'contract_version', p_contract.version,
    'from_city', v_listing.loading_city,
    'to_city', v_listing.unloading_city,
    'party_name', v_actor_name
  );

  v_title := case p_kind when 'contract_generated' then 'Contract de transport generat'
                         else 'Contract acceptat' end;
  v_body := case p_kind
    when 'contract_generated' then v_actor_name || ' a generat contractul ' || p_contract.contract_number
    else v_actor_name || ' a acceptat contractul ' || p_contract.contract_number
  end;

  -- To the client, unless the client is who acted.
  if p_actor_side <> 'client' then
    if v_client_email is not null then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
      values ('email', p_kind, v_client_user, p_order.shipper_company_id, v_client_email,
              v_payload, p_kind || ':' || p_contract.id || ':client')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
    if p_order.shipper_company_id is not null then
      perform public.queue_push_for_company(p_order.shipper_company_id, p_kind, v_title, v_body,
        jsonb_build_object('id', p_order.id), p_kind || '_push:' || p_contract.id || ':client');
    else
      perform public.queue_push(v_client_user, p_kind, v_title, v_body,
        jsonb_build_object('id', p_order.id), p_kind || '_push:' || p_contract.id || ':client');
    end if;
  end if;

  -- To the carrier, unless the carrier is who acted.
  if p_actor_side <> 'carrier' then
    if v_carrier_email is not null then
      insert into public.notification_outbox
        (channel, template, recipient_company_id, to_email, payload, dedupe_key)
      values ('email', p_kind, p_order.carrier_company_id, v_carrier_email,
              v_payload, p_kind || ':' || p_contract.id || ':carrier')
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
    perform public.queue_push_for_company(p_order.carrier_company_id, p_kind, v_title, v_body,
      jsonb_build_object('id', p_order.id), p_kind || '_push:' || p_contract.id || ':carrier');
  end if;
end;
$fn$;

revoke all on function public.queue_contract_notification(public.transports, public.order_contracts, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. generate_order_contract() — o versiune nouă
--
-- Numai o parte sau echipa. Pentru cine nu vede comanda, răspunsul este
-- „nu există" (CLAUDE.md, Securitate 7). Blocare `for update` pe comandă:
-- două generări simultane primesc versiuni diferite, nu o eroare de
-- unicitate.
-- ---------------------------------------------------------------------
create or replace function public.generate_order_contract(
  p_order_id uuid,
  p_operator jsonb default '{}'::jsonb
)
returns table (contract_id uuid, version integer, contract_number text, snapshot_hash text)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_order public.transports;
  v_side text;
  v_version integer;
  v_snapshot jsonb;
  v_hash text;
  v_row public.order_contracts;
begin
  if auth.uid() is null then
    raise exception 'Intră în cont ca să generezi contractul' using errcode = '42501';
  end if;

  select * into v_order from public.transports t where t.id = p_order_id for update;
  if not found then
    raise exception 'Comanda nu există' using errcode = 'P0002';
  end if;

  v_side := public.order_contract_side(v_order);
  if v_side is null then
    raise exception 'Comanda nu există' using errcode = 'P0002';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Comanda a fost anulată; nu se mai generează contract pentru ea'
      using errcode = '22023';
  end if;

  select coalesce(max(c.version), 0) + 1 into v_version
  from public.order_contracts c where c.order_id = p_order_id;

  -- Enough for every honest correction; a loop is not honest.
  if v_version > 30 then
    raise exception 'Comanda are deja 30 de versiuni de contract. Scrie-ne dacă trebuie alta.'
      using errcode = '22023';
  end if;

  v_snapshot := public.order_contract_snapshot(v_order, v_version, v_side,
                                               public.contract_operator_block(p_operator));
  v_hash := encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex');

  insert into public.order_contracts
    (order_id, version, contract_number, template_version, snapshot, snapshot_hash,
     generated_by, generated_by_side)
  values
    (p_order_id, v_version, v_snapshot ->> 'contract_number', v_snapshot ->> 'template',
     v_snapshot, v_hash, auth.uid(), v_side)
  returning * into v_row;

  -- Only identifiers and the fingerprint in the audit: the snapshot has
  -- names and phone numbers, and `audit_log` keeps rows for years.
  perform public.write_audit('contract.generated', 'order_contracts', v_row.id, null,
    jsonb_build_object('order_id', p_order_id, 'version', v_version,
                       'snapshot_hash', v_hash, 'side', v_side));

  perform public.queue_contract_notification(v_order, v_row, 'contract_generated', v_side);

  return query select v_row.id, v_row.version, v_row.contract_number, v_row.snapshot_hash;
end;
$fn$;

comment on function public.generate_order_contract(uuid, jsonb) is
  'Generează o versiune nouă a contractului unei comenzi, din instantaneul datelor din bază. Numai o parte sau echipa; auditat; anunță cealaltă parte.';

revoke all on function public.generate_order_contract(uuid, jsonb) from public, anon;
grant execute on function public.generate_order_contract(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 11. accept_order_contract() — acceptarea electronică în platformă
--
-- Cine: `auth.uid()`. Când: `now()`. Ce: versiunea și amprenta ei. Plus
-- IP-ul și browserul pe care serverul aplicației le-a văzut la cerere —
-- singurele două valori primite din afară, păstrate ca atare și numite
-- așa în document.
--
-- Numai ultima versiune se mai poate accepta: o versiune înlocuită nu
-- mai descrie ce s-a convenit. O dată pe parte pe versiune.
-- ---------------------------------------------------------------------
create or replace function public.accept_order_contract(
  p_contract_id uuid,
  p_ip text default null,
  p_user_agent text default null
)
returns table (acceptance_id uuid, accepted_at timestamptz, side text)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_contract public.order_contracts;
  v_order public.transports;
  v_side text;
  v_ip inet;
  v_name text;
  v_company uuid;
  v_company_name text;
  v_row public.order_contract_acceptances;
begin
  if auth.uid() is null then
    raise exception 'Intră în cont ca să accepți contractul' using errcode = '42501';
  end if;

  select * into v_contract from public.order_contracts c where c.id = p_contract_id;
  if not found then
    raise exception 'Contractul nu există' using errcode = 'P0002';
  end if;

  select * into v_order from public.transports t where t.id = v_contract.order_id for update;
  v_side := public.order_contract_side(v_order);
  if v_side is null then
    raise exception 'Contractul nu există' using errcode = 'P0002';
  end if;
  if v_side = 'staff' then
    raise exception 'Echipa platformei nu acceptă contracte în numele părților'
      using errcode = '42501';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Comanda a fost anulată; contractul nu se mai acceptă' using errcode = '22023';
  end if;

  if exists (select 1 from public.order_contracts c
             where c.order_id = v_contract.order_id and c.version > v_contract.version) then
    raise exception 'Există o versiune mai nouă a contractului. Deschide-o și acceptă versiunea curentă.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.order_contract_acceptances a
             where a.contract_id = p_contract_id and a.side = v_side) then
    raise exception 'Partea ta a acceptat deja această versiune a contractului' using errcode = '23505';
  end if;

  -- What the server reported, kept only when it is an address.
  begin
    v_ip := nullif(btrim(coalesce(p_ip, '')), '')::inet;
  exception when others then
    v_ip := null;
  end;

  select p.full_name into v_name from public.profiles p where p.id = auth.uid();
  if v_side = 'carrier' then
    v_company := v_order.carrier_company_id;
  else
    v_company := v_order.shipper_company_id;
  end if;
  if v_company is not null then
    select coalesce(c.legal_name, c.display_name) into v_company_name
    from public.companies c where c.id = v_company;
  end if;

  insert into public.order_contract_acceptances
    (contract_id, order_id, side, user_id, accepted_by_name, company_id, company_name,
     ip, user_agent, snapshot_hash)
  values
    (p_contract_id, v_contract.order_id, v_side, auth.uid(), v_name, v_company, v_company_name,
     v_ip, left(nullif(btrim(coalesce(p_user_agent, '')), ''), 400), v_contract.snapshot_hash)
  returning * into v_row;

  perform public.write_audit('contract.accepted', 'order_contracts', p_contract_id, null,
    jsonb_build_object('order_id', v_contract.order_id, 'version', v_contract.version,
                       'side', v_side, 'snapshot_hash', v_contract.snapshot_hash));

  perform public.queue_contract_notification(v_order, v_contract, 'contract_accepted', v_side);

  return query select v_row.id, v_row.accepted_at, v_row.side;
end;
$fn$;

comment on function public.accept_order_contract(uuid, text, text) is
  'Acceptarea electronică în platformă a ultimei versiuni a unui contract, de către o parte. Nu este semnătură electronică calificată. Auditată; anunță cealaltă parte.';

revoke all on function public.accept_order_contract(uuid, text, text) from public, anon;
grant execute on function public.accept_order_contract(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Ce citește pagina comenzii și ce desenează PDF-ul
-- ---------------------------------------------------------------------

/** Every version of an order's contract, newest first, with who accepted each. */
create or replace function public.order_contract_versions(p_order_id uuid)
returns table (
  contract_id uuid,
  version integer,
  contract_number text,
  template_version text,
  snapshot_hash text,
  generated_at timestamptz,
  generated_by_name text,
  generated_by_side text,
  is_latest boolean,
  carrier_accepted_at timestamptz,
  carrier_accepted_by text,
  client_accepted_at timestamptz,
  client_accepted_by text,
  my_side text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with o as (
    select t.*, public.order_contract_side(t) as side
    from public.transports t where t.id = p_order_id
  )
  select c.id, c.version, c.contract_number, c.template_version, c.snapshot_hash,
         c.generated_at,
         c.snapshot #>> '{generated_by,name}',
         c.generated_by_side,
         c.version = max(c.version) over (),
         ca.accepted_at, ca.accepted_by_name,
         cl.accepted_at, cl.accepted_by_name,
         o.side
  from o
  join public.order_contracts c on c.order_id = o.id
  left join public.order_contract_acceptances ca on ca.contract_id = c.id and ca.side = 'carrier'
  left join public.order_contract_acceptances cl on cl.contract_id = c.id and cl.side = 'client'
  where o.side is not null
  order by c.version desc;
$fn$;

revoke all on function public.order_contract_versions(uuid) from public, anon;
grant execute on function public.order_contract_versions(uuid) to authenticated;

/**
 * What `contract-pdf` draws one version from: its snapshot, and every
 * acceptance recorded up to and including it — names and times, never
 * the IP or the browser.
 */
create or replace function public.order_contract_render_data(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_contract public.order_contracts;
begin
  select * into v_contract from public.order_contracts c where c.id = p_contract_id;
  if not found or not public.can_see_order_contract(v_contract.order_id) then
    raise exception 'Contractul nu există' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'contract_id', v_contract.id,
    'order_id', v_contract.order_id,
    'version', v_contract.version,
    'contract_number', v_contract.contract_number,
    'template_version', v_contract.template_version,
    'snapshot_hash', v_contract.snapshot_hash,
    'redacted', v_contract.redacted_at is not null,
    'latest_version', (select max(c.version) from public.order_contracts c
                       where c.order_id = v_contract.order_id),
    'snapshot', v_contract.snapshot,
    'acceptances', coalesce((
      select jsonb_agg(jsonb_build_object(
               'version', c.version,
               'side', a.side,
               'name', a.accepted_by_name,
               'company_name', a.company_name,
               'accepted_at', a.accepted_at,
               'snapshot_hash', a.snapshot_hash)
             order by c.version, a.accepted_at)
      from public.order_contract_acceptances a
      join public.order_contracts c on c.id = a.contract_id
      where a.order_id = v_contract.order_id and c.version <= v_contract.version
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.order_contract_render_data(uuid) from public, anon;
grant execute on function public.order_contract_render_data(uuid) to authenticated;

/** For staff: every version and every acceptance, IP and browser included. */
create or replace function public.admin_order_contracts(p_order_id uuid)
returns table (
  contract_id uuid,
  version integer,
  contract_number text,
  template_version text,
  snapshot_hash text,
  generated_at timestamptz,
  generated_by uuid,
  generated_by_name text,
  generated_by_side text,
  redacted_at timestamptz,
  acceptances jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then
    raise exception 'Nu există' using errcode = 'P0002';
  end if;

  return query
  select c.id, c.version, c.contract_number, c.template_version, c.snapshot_hash,
         c.generated_at, c.generated_by, c.snapshot #>> '{generated_by,name}',
         c.generated_by_side, c.redacted_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'side', a.side,
                    'user_id', a.user_id,
                    'name', a.accepted_by_name,
                    'company_name', a.company_name,
                    'accepted_at', a.accepted_at,
                    'ip', host(a.ip),
                    'user_agent', a.user_agent,
                    'snapshot_hash', a.snapshot_hash)
                  order by a.accepted_at)
           from public.order_contract_acceptances a where a.contract_id = c.id
         ), '[]'::jsonb)
  from public.order_contracts c
  where c.order_id = p_order_id
  order by c.version desc;
end;
$fn$;

revoke all on function public.admin_order_contracts(uuid) from public, anon;
grant execute on function public.admin_order_contracts(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. Fișierele: bucketul privat
--
-- Calea: `<order_id>/<contract_id>/v<versiune>-a<acceptări>.pdf`. Citire
-- pentru părți și echipă. Nicio politică de scriere: scrie numai
-- `contract-pdf`, cu rolul de serviciu, după ce a întrebat baza, cu
-- tokenul celui care cere, dacă are voie să vadă contractul.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-contracts', 'order-contracts', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy order_contracts_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-contracts'
    and public.can_see_order_contract(public.safe_uuid((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------
-- 14. Retenția: ca a comenzii
--
-- O comandă nu se șterge: rămâne înregistrare comercială, iar datele
-- personale de pe ea se anonimizează la ștergerea contului sau a firmei.
-- Contractul urmează exact drumul ăsta. Instantaneul și acceptările
-- rămân, cu datele părții șterse înlocuite, iar fișierele PDF deja
-- desenate se șterg, pentru că le conțin: la următoarea deschidere se
-- desenează din instantaneul anonimizat. Amprenta păstrată arată în
-- continuare ce s-a acceptat atunci.
--
-- Poarta este flagul `app.contract_retention`, pus numai de funcția de
-- mai jos, care nu este a nimănui: o cheamă doar declanșatoarele.
-- ---------------------------------------------------------------------
create or replace function public.redact_order_contracts(
  p_order_id uuid,
  p_side text,
  p_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer := 0;
  v_gone constant text := '[șters la cerere]';
begin
  if not exists (select 1 from public.order_contracts where order_id = p_order_id) then
    return 0;
  end if;

  perform set_config('app.contract_retention', 'on', true);

  -- The party that was erased: its block in every version.
  if p_side is not null then
    update public.order_contracts c
    set snapshot = case
          when p_side = 'client' and c.snapshot #>> '{client,kind}' = 'individual' then
            jsonb_set(c.snapshot, '{client}',
              jsonb_build_object('kind', 'individual', 'full_name', v_gone,
                                 'email', null, 'phone', null))
          else
            jsonb_set(c.snapshot, array[p_side],
              coalesce(c.snapshot -> p_side, '{}'::jsonb)
                || jsonb_build_object('legal_name', 'Firmă ștearsă', 'display_name', null,
                                      'cui', null, 'reg_com', null, 'address', null, 'city', null,
                                      'county', null, 'legal_representative', v_gone,
                                      'contact_email', null, 'contact_phone', null))
        end
        || case when c.generated_by_side = p_side
                then jsonb_build_object('generated_by',
                       jsonb_build_object('name', v_gone, 'side', c.generated_by_side))
                else '{}'::jsonb end,
        redacted_at = now()
    where c.order_id = p_order_id;
    get diagnostics v_count = row_count;

    update public.order_contract_acceptances a
    set accepted_by_name = v_gone,
        company_name = case when a.company_id is null then null else 'Firmă ștearsă' end,
        ip = null,
        user_agent = null
    where a.order_id = p_order_id and a.side = p_side;
  end if;

  -- The person who was erased: what they did, wherever they did it.
  if p_user_id is not null then
    update public.order_contracts c
    set snapshot = c.snapshot || jsonb_build_object('generated_by',
                     jsonb_build_object('name', v_gone, 'side', c.generated_by_side)),
        redacted_at = now()
    where c.order_id = p_order_id and c.generated_by = p_user_id;

    update public.order_contract_acceptances a
    set accepted_by_name = v_gone, ip = null, user_agent = null
    where a.order_id = p_order_id and a.user_id = p_user_id;
  end if;

  -- Drawn files carry the old names; the next opening draws them again.
  delete from storage.objects
  where bucket_id = 'order-contracts' and name like p_order_id::text || '/%';

  perform set_config('app.contract_retention', 'off', true);
  return v_count;
end;
$fn$;

comment on function public.redact_order_contracts(uuid, text, uuid) is
  'Anonimizează partea sau persoana ștearsă în contractele unei comenzi și șterge PDF-urile desenate. Singurul drum prin guard_order_contract_immutable(). Chemată numai de declanșatoare.';

revoke all on function public.redact_order_contracts(uuid, text, uuid) from public, anon, authenticated;

/** An individual client's account is deleted: `complete_account_deletion` clears `shipper_user_id`. */
create or replace function public.redact_contracts_on_client_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.redact_order_contracts(new.id, 'client', old.shipper_user_id);
  return null;
end;
$fn$;

revoke all on function public.redact_contracts_on_client_deletion() from public, anon, authenticated;

create trigger transports_redact_contracts_on_client_deletion
  after update of shipper_user_id on public.transports
  for each row
  when (old.shipper_user_id is not null and new.shipper_user_id is null
        and new.shipper_company_id is null)
  execute function public.redact_contracts_on_client_deletion();

/** A firm is erased: `anonymise_company` stamps `anonymised_at`. */
create or replace function public.redact_contracts_on_company_erasure()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
begin
  for v_order in
    select * from public.transports t
    where t.carrier_company_id = new.id or t.shipper_company_id = new.id
  loop
    perform public.redact_order_contracts(
      v_order.id,
      case when v_order.carrier_company_id = new.id then 'carrier' else 'client' end);
  end loop;
  return null;
end;
$fn$;

revoke all on function public.redact_contracts_on_company_erasure() from public, anon, authenticated;

create trigger companies_redact_contracts_on_erasure
  after update of anonymised_at on public.companies
  for each row
  when (old.anonymised_at is null and new.anonymised_at is not null)
  execute function public.redact_contracts_on_company_erasure();

/**
 * Anybody's login is deleted — the profile cascades from `auth.users`.
 * A dispatcher who leaves takes their name, IP and browser off the
 * acceptances they recorded; the firm's own block stays, because the
 * firm did not leave.
 */
create or replace function public.redact_contracts_on_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order uuid;
begin
  for v_order in
    select a.order_id from public.order_contract_acceptances a where a.user_id = old.id
    union
    select c.order_id from public.order_contracts c where c.generated_by = old.id
  loop
    perform public.redact_order_contracts(v_order, null, old.id);
  end loop;
  return null;
end;
$fn$;

revoke all on function public.redact_contracts_on_profile_deletion() from public, anon, authenticated;

create trigger profiles_redact_contracts_on_deletion
  after delete on public.profiles
  for each row execute function public.redact_contracts_on_profile_deletion();

-- ---------------------------------------------------------------------
-- 15. Tipurile de notificare
--
-- Și trei etichete rămase de la vechile nume: „anunț" și „plecare" nu mai
-- numesc nimic din ce se publică (docs/19-navigatie-pe-rol.md).
-- ---------------------------------------------------------------------
insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('contract_generated', 'Contract de transport generat',
   'Cealaltă parte a generat contractul de transport al unei comenzi. Îl citești și îl accepți din pagina comenzii.',
   'both', true, false, false, '/cont/transporturi/{id}#contract', true, 720),
  ('contract_accepted', 'Contract acceptat de cealaltă parte',
   'Cealaltă parte a acceptat contractul de transport în platformă.',
   'both', true, false, false, '/cont/transporturi/{id}#contract', true, 730)
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

update public.notification_types
set label_ro = 'Cerere sau traseu scos de pe panou',
    description_ro = 'O cerere sau un traseu al tău a fost scos de pe panou. Mesajul spune de ce.'
where code = 'listing_hidden';

update public.notification_types
set label_ro = 'Cerere sau traseu repus pe panou'
where code = 'listing_restored';

update public.notification_types
set label_ro = 'Serie de trasee oprită',
    description_ro = 'O serie de trasee nu mai poate publica trasee noi. Mesajul spune de ce.'
where code = 'series_paused';
