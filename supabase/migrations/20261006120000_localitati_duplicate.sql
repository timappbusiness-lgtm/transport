-- =====================================================================
-- Un oraș, un rând
--
-- Rulează după import, fiindcă are nevoie de rândurile pe care le aduce.
--
-- Cele 75 de localități scrise de mână folosesc exonimele românești —
-- Viena, Praga, Londra, Varșovia — iar importul aduce numele local:
-- Wien, Praha, London. Fără pasul ăsta nomenclatorul ar avea două
-- rânduri pentru același oraș, iar cine caută „Viena" ar trebui să
-- aleagă între două răspunsuri corecte. Exact problema pentru care
-- sectoarele Bucureștiului sunt excluse din import.
--
-- Direcția se scrie pe fiecare rând, fiindcă nu este aceeași peste tot:
--
--   - pentru orașele din străinătate rămâne numele local, iar exonimul
--     românesc devine alias — așa scrie și pe hârtiile transportului;
--   - pentru Târgu Mureș și Miercurea Ciuc rămâne forma din listă, care
--     este cea oficială; GeoNames le scrie cu cratimă;
--   - pentru Țăndărei rămâne forma din GeoNames, care este cea corectă:
--     în listă era scrisă „Țândărei".
--
-- Anunțurile publicate nu se strică. `from_city` este text, nu o cheie
-- străină, iar coordonatele deja ștampilate rămân ștampilate; odată ce
-- căutarea se uită și în aliasuri, o reștampilare găsește rândul rămas
-- pornind de la același cuvânt.
-- =====================================================================

do $fold$
declare
  r record;
  v_keep uuid;
  v_drop uuid;
begin
  for r in
    select * from (values
      -- (rămâne, dispare, țara)
      ('Wien',              'Viena',           'AT'),
      ('Antwerpen',         'Anvers',          'BE'),
      ('Praha',             'Praga',           'CZ'),
      ('København',         'Copenhaga',       'DK'),
      ('Marseille',         'Marsilia',        'FR'),
      ('London',            'Londra',          'GB'),
      ('Budapest',          'Budapesta',       'HU'),
      ('Warszawa',          'Varșovia',        'PL'),
      ('Frankfurt am Main', 'Frankfurt',       'DE'),
      ('Târgu Mureș',       'Târgu-Mureș',     'RO'),
      ('Miercurea Ciuc',    'Miercurea-Ciuc',  'RO'),
      ('Țăndărei',          'Țândărei',        'RO')
    ) as t(keep, drops, country)
  loop
    select id into v_keep from public.localities
    where name = r.keep and country = r.country;
    select id into v_drop from public.localities
    where name = r.drops and country = r.country;

    -- Dacă lipsește oricare dintre ele nu este nimic de unit. Nu este o
    -- eroare: pragul importului se poate schimba, iar un oraș care nu a
    -- venit rămâne găsibil sub numele pe care îl are.
    if v_keep is null or v_drop is null or v_keep = v_drop then
      continue;
    end if;

    -- Rândul care rămâne ia și ce știa celălalt. Numai aliasul nu
    -- ajunge: primul fold a păstrat „Târgu Mureș" și a șters rândul din
    -- import, iar cu el populația și steagul de reședință de județ —
    -- nomenclatorul a ieșit cu 39 de reședințe în loc de 41, și cele
    -- două orașe s-au dus la coada sortării fiindcă nu mai aveau
    -- populație. Se ia ce lipsește, niciodată peste ce există.
    update public.localities k
    set aliases = (select array(select distinct e
                                from unnest(k.aliases || d.aliases || array[r.drops]) e
                                where e <> '' and e <> k.name)),
        population = coalesce(k.population, d.population),
        is_county_seat = k.is_county_seat or d.is_county_seat,
        region = case when k.region = '' then d.region else k.region end
    from public.localities d
    where k.id = v_keep and d.id = v_drop;

    delete from public.localities where id = v_drop;
  end loop;
end
$fold$;
