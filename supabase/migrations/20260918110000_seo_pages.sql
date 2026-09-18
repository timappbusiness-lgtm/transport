-- =====================================================================
-- Landing pages for the searches this market actually types
--
-- "transport auto Germania România", "transport mașină București Cluj",
-- "transport motocicletă". The competitor owns these; we do not compete
-- on volume of text, which is the usual answer and produces a hundred
-- near-identical pages nobody reads. We compete on being the only page
-- that can say a true number: how many verified firms cover that route
-- today, what is actually on the board, what a kilometre costs.
--
-- Which is why this table stores only the words — title, heading, intro,
-- questions — and never a figure. Every number on a page is read live
-- from the tables that own it. A price written here would be a price that
-- goes stale silently, and a stale price on a landing page is the most
-- expensive kind of lie a marketplace can tell.
--
-- Nothing is published automatically. The starting set below lands
-- `is_published = false`, 161 rows, and somebody reads each one before it
-- is on the internet.
-- =====================================================================

create type public.seo_page_type as enum (
  'corridor_international',  -- Germania → România
  'route_internal',          -- București ↔ Cluj-Napoca
  'county',                  -- județul Cluj
  'vehicle_type'             -- motociclete
);

comment on type public.seo_page_type is
  'What a landing page is about. Decides its URL shape, its live blocks and its FAQ.';

create table public.seo_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  type public.seo_page_type not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- The words. Everything here is editable from /admin/pagini; nothing
  -- here is a number.
  title text not null check (length(btrim(title)) between 10 and 70),
  h1 text not null check (length(btrim(h1)) between 5 and 80),
  -- The second half of a two-tone heading: "Transport auto Germania —
  -- România" in ink, "cu firme verificate." in grey. One column rather
  -- than markup in `h1`, so the admin screen can offer two boxes and no
  -- page has to parse a heading.
  h1_soft text check (h1_soft is null or length(btrim(h1_soft)) <= 60),
  intro text not null check (length(btrim(intro)) between 40 and 600),

  -- What the page is about, in codes the live blocks can query by.
  --   corridor_international  origin = country code, destination = 'RO'
  --   route_internal          origin, destination = city names
  --   county                  origin = ISO 3166-2:RO county code
  --   vehicle_type            vehicle_type set, origin and destination null
  origin text,
  destination text,
  vehicle_type text,

  -- [{"q": "...", "a": "..."}], 3–5 per page. Rendered as an accordion and
  -- as FAQPage JSON-LD, from the same rows, so the two cannot disagree.
  faq jsonb not null default '[]'::jsonb,

  is_published boolean not null default false,
  published_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,

  constraint seo_pages_faq_is_array check (jsonb_typeof(faq) = 'array'),
  constraint seo_pages_faq_size check (jsonb_array_length(faq) <= 8),

  -- Each type needs its own coordinates, and a page missing them renders
  -- an empty block rather than an error nobody sees until it is indexed.
  constraint seo_pages_shape check (
    case type
      when 'corridor_international' then origin is not null and destination is not null
      when 'route_internal' then origin is not null and destination is not null
      when 'county' then origin is not null
      when 'vehicle_type' then vehicle_type is not null
    end
  )
);

comment on table public.seo_pages is
  'Landing pages for organic search. Words only: every figure on a rendered page is read live from the table that owns it.';
comment on column public.seo_pages.h1_soft is
  'The grey half of the two-tone heading. Separate from h1 so no page parses a heading and the admin screen can offer two boxes.';
comment on column public.seo_pages.is_published is
  'Off until somebody reads the page. The seeded set lands unpublished, and anon cannot see an unpublished row at all.';

create index seo_pages_published_idx on public.seo_pages (type, slug) where is_published;

create trigger seo_pages_set_updated_at
  before update on public.seo_pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Who sees what
--
-- An unpublished page is not "visible but marked draft": anon cannot read
-- the row, so it cannot reach the sitemap, the internal links or a page
-- render, and the route turns the missing row into a 404. One rule, in
-- one place, rather than an `is_published` check repeated in six loaders
-- where forgetting it once publishes a draft.
-- ---------------------------------------------------------------------
alter table public.seo_pages enable row level security;

create policy "seo_pages_read_published" on public.seo_pages
  for select to anon, authenticated
  using (is_published or public.is_platform_admin());

revoke all on public.seo_pages from anon, authenticated;
grant select on public.seo_pages to anon, authenticated;

-- ---------------------------------------------------------------------
-- Editing and publishing
--
-- No table grant would let a staff member write a row through PostgREST,
-- which is deliberate: publishing a page is the moment it becomes visible
-- to search engines, and every one of those moments belongs in
-- `audit_log` with a name against it.
-- ---------------------------------------------------------------------
create or replace function public.set_seo_page(
  p_slug text,
  p_title text,
  p_h1 text,
  p_h1_soft text,
  p_intro text,
  p_faq jsonb default null
)
returns public.seo_pages
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.seo_pages;
  v_after public.seo_pages;
  v_faq jsonb := coalesce(p_faq, '[]'::jsonb);
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica paginile' using errcode = '42501';
  end if;

  select * into v_before from public.seo_pages where slug = p_slug;
  if v_before.id is null then
    raise exception 'Pagina nu există' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_faq) <> 'array' then
    raise exception 'Întrebările trebuie să fie o listă' using errcode = '22023';
  end if;

  -- Every entry needs both halves. A question with no answer renders an
  -- empty accordion row and, worse, an FAQPage entry with an empty
  -- acceptedAnswer — which is a structured-data error on a page whose
  -- whole purpose is structured data.
  if exists (
    select 1 from jsonb_array_elements(v_faq) as e
    where coalesce(btrim(e ->> 'q'), '') = '' or coalesce(btrim(e ->> 'a'), '') = ''
  ) then
    raise exception 'Fiecare întrebare are nevoie de un răspuns' using errcode = '22023';
  end if;

  update public.seo_pages
  set title = btrim(p_title),
      h1 = btrim(p_h1),
      h1_soft = nullif(btrim(coalesce(p_h1_soft, '')), ''),
      intro = btrim(p_intro),
      faq = v_faq,
      updated_by = auth.uid()
  where slug = p_slug
  returning * into v_after;

  perform public.write_audit('seo_page.updated', 'seo_pages', v_after.id,
                             to_jsonb(v_before), to_jsonb(v_after), p_slug);
  return v_after;
end;
$fn$;

create or replace function public.set_seo_page_published(p_slug text, p_published boolean)
returns public.seo_pages
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.seo_pages;
  v_after public.seo_pages;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate publica pagini' using errcode = '42501';
  end if;

  select * into v_before from public.seo_pages where slug = p_slug;
  if v_before.id is null then
    raise exception 'Pagina nu există' using errcode = 'P0002';
  end if;

  update public.seo_pages
  set is_published = p_published,
      published_at = case when p_published then coalesce(v_before.published_at, now()) else null end,
      updated_by = auth.uid()
  where slug = p_slug
  returning * into v_after;

  perform public.write_audit(
    case when p_published then 'seo_page.published' else 'seo_page.unpublished' end,
    'seo_pages', v_after.id, to_jsonb(v_before), to_jsonb(v_after), p_slug);
  return v_after;
end;
$fn$;

-- Publishing forty-two county pages one at a time is how a person ends up
-- publishing forty-one. The count comes back so the screen can state what
-- happened rather than say "gata".
create or replace function public.set_seo_pages_published_by_type(
  p_type public.seo_page_type,
  p_published boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate publica pagini' using errcode = '42501';
  end if;

  update public.seo_pages
  set is_published = p_published,
      published_at = case when p_published then coalesce(published_at, now()) else null end,
      updated_by = auth.uid()
  where type = p_type and is_published is distinct from p_published;

  get diagnostics v_count = row_count;

  if v_count > 0 then
    perform public.write_audit(
      case when p_published then 'seo_pages.published_bulk' else 'seo_pages.unpublished_bulk' end,
      'seo_pages', null, null,
      jsonb_build_object('type', p_type, 'count', v_count), p_type::text);
  end if;

  return v_count;
end;
$fn$;

grant execute on function public.set_seo_page(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.set_seo_page_published(text, boolean) to authenticated;
grant execute on function public.set_seo_pages_published_by_type(public.seo_page_type, boolean) to authenticated;

-- =====================================================================
-- The starting set — 161 pages, none of them published
--
-- Seeded here rather than from a script so the set is the same on every
-- environment and the migration is the record of what was created. Every
-- row lands `is_published = false`: these are drafts with a sensible
-- first sentence, not finished pages. Somebody reads each one, edits it
-- at /admin/pagini, and publishes it.
--
-- The intros below are deliberately *specific* rather than templated
-- prose with the names swapped — a hundred pages built from one sentence
-- is the thin-content pattern this whole exercise exists to beat. Where a
-- template is unavoidable (105 city pairs), the sentence is chosen by
-- distance band from the real coordinates, and the substance of the page
-- is the live data below it: what a kilometre costs on that corridor, how
-- many verified firms cover it, what is on the board today.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. International corridors, nine of them
-- ---------------------------------------------------------------------
insert into public.seo_pages (type, slug, title, h1, h1_soft, intro, origin, destination, faq)
select
  'corridor_international',
  public.slugify(c.name_ro) || '-romania',
  'Transport auto ' || c.name_ro || ' România — preț și firme verificate',
  'Transport auto ' || c.name_ro || ' — România',
  'cu firme verificate.',
  c.intro,
  c.code,
  'RO',
  jsonb_build_array(
    jsonb_build_object(
      'q', 'Cât durează transportul din ' || c.name_ro || ' în România?',
      'a', c.duration_a),
    jsonb_build_object(
      'q', 'Ce acte îmi trebuie pentru mașina adusă din ' || c.name_ro || '?',
      'a', 'Actele mașinii și un document de transport. Transportatorul verificat îți spune exact ce are nevoie înainte de încărcare, iar documentele firmei le vezi pe profilul ei.'),
    jsonb_build_object(
      'q', 'Pot transporta o mașină care nu pornește?',
      'a', 'Da. Bifează la publicarea cererii că vehiculul nu se deplasează și cererea ajunge doar la firmele care au troliu.'),
    jsonb_build_object(
      'q', 'Cum plătesc transportul?',
      'a', 'Direct cu transportatorul, după înțelegerea dintre voi. Coridor este locul unde vă găsiți, nu intermediar de plată.')
  )
from (values
  ('DE', 'Germania',
   'Cel mai circulat coridor de transport auto către România: piese, mașini de la dealeri și mașini cumpărate de la particulari se întorc acasă pe platformă în fiecare săptămână. Firmele care fac acest drum au de obicei curse regulate, așa că o cerere publicată prinde un transport deja programat. Pregătește actele mașinii și cheia de rezervă înainte de încărcare.',
   'De obicei între trei și șase zile de la încărcare, în funcție de zona din care se ridică mașina și de câte opriri are platforma. O cursă expres, dedicată, este mai scurtă și mai scumpă.'),
  ('IT', 'Italia',
   'Al doilea coridor ca volum după Germania, cu diferența că multe transporturi pornesc din nordul industrial — Milano, Torino, Verona — unde platformele au drum de întoarcere aproape garantat. Asta face ca prețul pe kilometru să fie de obicei mai mic decât pe rutele fără retur. Actele mașinii și o adresă exactă de ridicare scurtează cel mai mult așteptarea.',
   'În general între trei și cinci zile de la încărcare. Din sudul Italiei durează mai mult, pentru că platforma are de urcat întâi spre nord.'),
  ('NL', 'Țările de Jos',
   'Multe mașini cumpărate din Țările de Jos sunt de la licitații și au termen de ridicare, deci data contează mai mult decât prețul. Publică cererea cu fereastra reală de încărcare, nu cu una optimistă: transportatorii aleg cursele pe care le pot respecta. Verifică dacă mașina pornește — de asta depinde ce fel de platformă are nevoie.',
   'De obicei între patru și șase zile. Drumul trece prin Germania, deci coridorul este bine acoperit.'),
  ('BE', 'Belgia',
   'Belgia se combină aproape întotdeauna cu Țările de Jos sau cu Germania în aceeași cursă, pentru că distanțele dintre ele sunt scurte. Dacă ai două mașini de adus din țări vecine, publică-le ca două cereri cu aceeași fereastră: sunt șanse să le ia aceeași platformă și să obții un preț mai bun.',
   'În general între patru și șase zile de la încărcare, în funcție de cum se completează platforma.'),
  ('FR', 'Franța',
   'Din Franța distanțele sunt mari și platformele urcă de obicei prin Germania sau prin Italia, în funcție de unde se află mașina. De aceea o adresă exactă de ridicare schimbă mult prețul: Lyon și Marsilia sunt pe drumuri diferite. Pregătește actele și spune din start dacă mașina are avarii.',
   'De obicei între cinci și șapte zile. Din sudul Franței poate fi mai scurt, dacă platforma urcă prin Italia.'),
  ('ES', 'Spania',
   'Cel mai lung coridor pe care îl acoperă piața aceasta, deci și cel pe care contează cel mai mult să aștepți o platformă care se completează. Un transport pe sens costă semnificativ mai puțin decât o cursă dedicată. Dacă nu ai termen, publică cererea cu o fereastră largă de încărcare.',
   'În general între șase și nouă zile de la încărcare. O cursă dedicată scurtează drumul, dar costă mult mai mult.'),
  ('AT', 'Austria',
   'Austria este pe drumul majorității platformelor care vin din Germania, deci un transport de aici prinde des o cursă deja programată. Distanțele sunt mici în comparație cu restul coridoarelor europene, iar prețul pe kilometru este de obicei mai mare tocmai pentru că drumul este scurt.',
   'De obicei între două și patru zile de la încărcare.'),
  ('HU', 'Ungaria',
   'Cel mai scurt coridor internațional din listă și, din cauza asta, cel la care prețul se apropie de un transport intern lung. Multe platforme care se întorc din vestul Europei au loc liber pe ultima bucată de drum, deci merită publicată cererea chiar și pentru o singură mașină.',
   'De obicei una sau două zile de la încărcare.'),
  ('GB', 'Marea Britanie',
   'Transportul din Marea Britanie are în plus formalitățile vamale de după Brexit și traversarea Canalului, care adaugă atât timp cât și cost. Pregătește din vreme actele mașinii și dovada de proprietate: aici lipsa unui document oprește transportul la graniță, nu la încărcare.',
   'În general între șase și nouă zile, în funcție de cât durează formalitățile vamale.')
) as c(code, name_ro, intro, duration_a);

-- ---------------------------------------------------------------------
-- 2. Internal routes — the 15 largest cities, 105 pairs
--
-- Pairs rather than ordered routes, on purpose. "transport auto București
-- Cluj" and "transport auto Cluj București" are the same job with the
-- same carriers and the same price; two pages would be two versions of
-- one page competing with each other, which is how a site ends up ranking
-- for neither. The page covers both directions and says so, and the
-- request form is prefilled from whichever way the visitor picks.
--
-- The opening sentence is chosen by the real straight-line distance
-- between the two, so a 120 km hop and a 700 km haul do not read
-- identically.
-- ---------------------------------------------------------------------
with cities as (
  select * from (values
    ('București', 'B', 44.4268::numeric, 26.1025::numeric),
    ('Cluj-Napoca', 'CJ', 46.7712, 23.6236),
    ('Timișoara', 'TM', 45.7489, 21.2087),
    ('Iași', 'IS', 47.1585, 27.6014),
    ('Constanța', 'CT', 44.1598, 28.6348),
    ('Craiova', 'DJ', 44.3302, 23.7949),
    ('Brașov', 'BV', 45.6427, 25.5887),
    ('Galați', 'GL', 45.4353, 28.0080),
    ('Ploiești', 'PH', 44.9367, 26.0225),
    ('Oradea', 'BH', 47.0465, 21.9189),
    ('Brăila', 'BR', 45.2692, 27.9575),
    ('Arad', 'AR', 46.1866, 21.3123),
    ('Pitești', 'AG', 44.8565, 24.8692),
    ('Sibiu', 'SB', 45.7983, 24.1256),
    ('Bacău', 'BC', 46.5670, 26.9146)
  ) as t(name, county, lat, lng)
),
pairs as (
  select
    a.name as from_name, b.name as to_name,
    round(public.distance_km(a.lat, a.lng, b.lat, b.lng))::integer as km
  from cities a
  join cities b on a.name < b.name
)
insert into public.seo_pages (type, slug, title, h1, h1_soft, intro, origin, destination, faq)
select
  'route_internal',
  public.slugify(p.from_name) || '-' || public.slugify(p.to_name),
  'Transport auto ' || p.from_name || ' — ' || p.to_name || ' | Coridor',
  'Transport auto ' || p.from_name || ' — ' || p.to_name,
  'în ambele sensuri.',
  case
    when p.km < 200 then
      'Un drum scurt, pe care platformele îl fac de obicei ca parte dintr-o cursă mai lungă. Pentru distanțe ca aceasta contează mai mult ziua în care poate fi încărcată mașina decât prețul pe kilometru, care este oricum mai mare pe drumurile scurte: încărcarea și actele nu se scurtează odată cu distanța. Pagina acoperă transportul în ambele sensuri, ' || p.from_name || ' — ' || p.to_name || ' și invers.'
    when p.km < 400 then
      'O distanță medie, cea mai obișnuită pe piața internă de transport auto. Majoritatea firmelor care acoperă ruta ' || p.from_name || ' — ' || p.to_name || ' au curse regulate, deci o cerere publicată prinde des un transport deja programat, la un preț mai mic decât o cursă dedicată. Pagina acoperă ambele sensuri.'
    else
      'Un transport lung pe teritoriul României, comparabil ca durată cu un drum scurt în străinătate. Pe distanțe ca aceasta merită așteptată o platformă care se completează: diferența de preț față de o cursă dedicată este cea mai mare aici. Pagina acoperă ruta ' || p.from_name || ' — ' || p.to_name || ' în ambele sensuri.'
  end,
  p.from_name,
  p.to_name,
  jsonb_build_array(
    jsonb_build_object(
      'q', 'Cât costă transportul unei mașini ' || p.from_name || ' — ' || p.to_name || '?',
      'a', 'Depinde de clasa vehiculului și de dacă pornește. Prețul orientativ de mai sus este calculat din tarifele publicate pe kilometru; prețul final este cel din oferta transportatorului.'),
    jsonb_build_object(
      'q', 'Cât durează?',
      'a', 'Un transport intern se face de obicei în una până la trei zile de la încărcare, în funcție de câte opriri are platforma pe drum.'),
    jsonb_build_object(
      'q', 'Mașina trebuie să pornească?',
      'a', 'Nu. Spune la publicarea cererii dacă nu pornește sau dacă roțile nu se învârt, și cererea ajunge doar la firmele cu troliu.'),
    jsonb_build_object(
      'q', 'Cum aleg transportatorul?',
      'a', 'Fiecare firmă de pe Coridor are documentele verificate și profilul public. Vezi ce transportă, cu ce dotări lucrează și de când este verificată, înainte să o contactezi.')
  )
from pairs p;

-- ---------------------------------------------------------------------
-- 3. Counties — all 41 and București
-- ---------------------------------------------------------------------
insert into public.seo_pages (type, slug, title, h1, h1_soft, intro, origin, faq)
select
  'county',
  public.slugify(c.name),
  'Transport auto ' || c.article || c.name || ' — firme verificate',
  'Transport auto ' || c.article || c.name,
  'cu firme verificate.',
  'Firmele de transport auto care ridică și livrează ' || c.article || c.name ||
  ', cu documentele verificate de echipa noastră. Vezi cine acoperă zona, ce platforme are și ce transporturi sunt publicate acum. ' ||
  'Publicarea unei cereri este gratuită și nu cere cont de firmă.',
  c.code,
  jsonb_build_array(
    jsonb_build_object(
      'q', 'Cum găsesc un transportator ' || c.article || c.name || '?',
      'a', 'Publică o cerere cu adresa de ridicare și cea de livrare. Cererea ajunge la firmele care au trecut zona aceasta în acoperirea lor, iar ele te contactează.'),
    jsonb_build_object(
      'q', 'Ce înseamnă „firmă verificată"?',
      'a', 'Am primit și am aprobat documentele firmei — licența, asigurarea și actele vehiculelor — și le reverificăm automat înainte să expire. Vezi starea lor pe profilul fiecărei firme.'),
    jsonb_build_object(
      'q', 'Se poate și transport în afara județului?',
      'a', 'Da. Majoritatea firmelor de aici fac și transport național, iar o parte și internațional. Filtrează după traseu pe pagina de cereri.')
  )
from (values
  ('AB', 'Alba', 'în județul '), ('AR', 'Arad', 'în județul '),
  ('AG', 'Argeș', 'în județul '), ('BC', 'Bacău', 'în județul '),
  ('BH', 'Bihor', 'în județul '), ('BN', 'Bistrița-Năsăud', 'în județul '),
  ('BT', 'Botoșani', 'în județul '), ('BV', 'Brașov', 'în județul '),
  ('BR', 'Brăila', 'în județul '), ('B', 'București', 'în '),
  ('BZ', 'Buzău', 'în județul '), ('CS', 'Caraș-Severin', 'în județul '),
  ('CL', 'Călărași', 'în județul '), ('CJ', 'Cluj', 'în județul '),
  ('CT', 'Constanța', 'în județul '), ('CV', 'Covasna', 'în județul '),
  ('DB', 'Dâmbovița', 'în județul '), ('DJ', 'Dolj', 'în județul '),
  ('GL', 'Galați', 'în județul '), ('GR', 'Giurgiu', 'în județul '),
  ('GJ', 'Gorj', 'în județul '), ('HR', 'Harghita', 'în județul '),
  ('HD', 'Hunedoara', 'în județul '), ('IL', 'Ialomița', 'în județul '),
  ('IS', 'Iași', 'în județul '), ('IF', 'Ilfov', 'în județul '),
  ('MM', 'Maramureș', 'în județul '), ('MH', 'Mehedinți', 'în județul '),
  ('MS', 'Mureș', 'în județul '), ('NT', 'Neamț', 'în județul '),
  ('OT', 'Olt', 'în județul '), ('PH', 'Prahova', 'în județul '),
  ('SM', 'Satu Mare', 'în județul '), ('SJ', 'Sălaj', 'în județul '),
  ('SB', 'Sibiu', 'în județul '), ('SV', 'Suceava', 'în județul '),
  ('TR', 'Teleorman', 'în județul '), ('TM', 'Timiș', 'în județul '),
  ('TL', 'Tulcea', 'în județul '), ('VS', 'Vaslui', 'în județul '),
  ('VL', 'Vâlcea', 'în județul '), ('VN', 'Vrancea', 'în județul ')
) as c(code, name, article);

-- ---------------------------------------------------------------------
-- 4. Vehicle types — five of them
--
-- The last one is not a category but a condition, and it is the one with
-- the clearest search intent on this market: somebody whose car will not
-- start is looking for a winch, not for a category.
-- ---------------------------------------------------------------------
insert into public.seo_pages (type, slug, title, h1, h1_soft, intro, vehicle_type, faq)
select
  'vehicle_type', v.slug, v.title, v.h1, v.h1_soft, v.intro, v.code,
  jsonb_build_array(
    jsonb_build_object('q', v.q1, 'a', v.a1),
    jsonb_build_object('q', v.q2, 'a', v.a2),
    jsonb_build_object(
      'q', 'Cât costă?',
      'a', 'Prețul orientativ de mai sus vine din tarifele pe kilometru publicate de noi, pe clase de vehicul. Prețul unei curse este cel din oferta transportatorului.')
  )
from (values
  ('autoturism', 'autoturism',
   'Transport autoturism pe platformă — preț și firme verificate',
   'Transport autoturism', 'pe platformă, cu firme verificate.',
   'Cel mai obișnuit transport de pe această bursă: un autoturism urcat pe platformă și dus dintr-un oraș în altul, sau adus din străinătate. Publici o cerere cu marca, modelul și anul, spui dacă pornește, iar firmele care acoperă traseul te contactează. Publicarea este gratuită.',
   'Mașina poate fi transportată cu lucruri în ea?',
   'Regula o dă transportatorul, iar cei mai mulți acceptă bagaje ușoare în portbagaj, pe răspunderea ta. Întreabă înainte de încărcare: asigurarea CARGO acoperă vehiculul, nu ce este în el.',
   'Se poate transporta o mașină fără numere?',
   'Da, pe platformă nu are nevoie de numere de înmatriculare. Ai nevoie de actele care arată că este a ta.'),
  ('autoutilitara', 'autoutilitara',
   'Transport autoutilitară pe platformă — preț și firme',
   'Transport autoutilitară', 'pe platformă, cu firme verificate.',
   'O autoutilitară este mai grea și mai înaltă decât un autoturism, deci nu intră pe orice platformă și nu costă cât un autoturism. Spune greutatea și înălțimea la publicarea cererii: de ele depinde ce platformă poate să o ia și cât costă drumul.',
   'De ce costă mai mult decât un autoturism?',
   'Pentru că ocupă mai mult loc pe platformă și cântărește mai mult, iar o platformă are o limită de sarcină pe axă. Unde intră două autoturisme intră adesea o singură autoutilitară.',
   'Ce înălțime maximă se poate transporta?',
   'Depinde de platformă. Scrie înălțimea în cerere și firmele care pot să o ia îți răspund; cele care nu pot, nu te contactează degeaba.'),
  ('motocicleta', 'motocicleta',
   'Transport motocicletă — preț orientativ și firme verificate',
   'Transport motocicletă', 'cu firme verificate.',
   'O motocicletă se transportă ancorată, de obicei alături de alte vehicule pe aceeași platformă, ceea ce face ca prețul pe kilometru să fie cel mai mic dintre toate categoriile. Spune dacă ai sau nu suport de ancorare și dacă motocicleta pornește.',
   'Cum este ancorată motocicleta?',
   'Cu chingi, pe roți sau pe cadru, în funcție de dotarea platformei. Firmele care au trecut chingi și dispozitive de ancorare în profil lucrează curent cu motociclete.',
   'Se poate transporta împreună cu o mașină?',
   'Da, și de obicei este mai ieftin așa. Publică ambele în aceeași fereastră de încărcare.'),
  ('microbuz', 'microbuz',
   'Transport microbuz pe platformă — preț și firme verificate',
   'Transport microbuz', 'pe platformă, cu firme verificate.',
   'Un microbuz depășește de obicei atât înălțimea, cât și sarcina pe care o ia o platformă obișnuită de autoturisme, deci ajunge la un număr mai mic de firme. Cu cât spui mai exact dimensiunile și greutatea, cu atât mai repede primești un răspuns care ține.',
   'Orice platformă poate transporta un microbuz?',
   'Nu. Are nevoie de o platformă cu sarcină și gabarit potrivite, iar cererea ta ajunge doar la firmele care au trecut microbuzul între categoriile pe care le transportă.',
   'Se poate transporta și dacă nu pornește?',
   'Da, dar are nevoie de troliu și de o platformă care îl susține. Bifează în cerere că nu se deplasează.'),
  ('nefunctional', 'masina-care-nu-porneste',
   'Transport mașină care nu pornește — troliu și firme verificate',
   'Transport mașină care nu pornește', 'cu troliu, de la firme verificate.',
   'O mașină care nu pornește, nu frânează sau are roțile blocate se încarcă altfel decât una care urcă singură: are nevoie de troliu, uneori de un al doilea operator și de roți de transport. Este un alt fel de muncă și un alt preț, iar o cerere care nu spune asta din start se transformă într-o platformă care pleacă goală.',
   'Ce înseamnă „nu se deplasează"?',
   'Că nu poate urca singură pe platformă: nu pornește, nu are direcție sau roțile nu se învârt. Bifează exact ce nu funcționează, iar cererea ajunge doar la firmele cu troliu.',
   'Este același lucru cu tractarea?',
   'Nu. Tractarea înseamnă ridicarea unei mașini rămase în pană sau accidentate, de obicei pe distanțe scurte. Transportul pe platformă este pentru un drum lung, programat dinainte.')
) as v(code, slug, title, h1, h1_soft, intro, q1, a1, q2, a2);
