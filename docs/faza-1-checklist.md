# Faza 1 — lista de ieșire

Scris pe `main` la commit-ul care adaugă paginile legale, 18 septembrie 2026.

„Faza 1" în briefurile noastre înseamnă MVP-ul fără oferte, comenzi,
mesagerie și moderare — adică fazele 1, 2, 3, 4 și 9 din
`docs/04-roadmap.md`, plus partea de administrare care le susține. Fazele
5–8 și moderarea din faza 10 sunt Faza 2 și nu sunt evaluate aici.

Stările sunt trei și numai trei:

- **gata** — se poate folosi de un client, de la interfață până la regula din
  bază, și există un test care cade dacă se strică;
- **parțial** — există, dar îi lipsește ceva numit explicit în coloana
  următoare;
- **lipsește** — nu există.

Nimic nu este marcat gata pentru că „există tabela". Tabela nu este
funcționalitate; asta a fost concluzia auditului din 18 septembrie și rămâne
regula aici.

---

## Faza 1 — Verificare

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Înscriere firmă cu `create_company()` | gata | — |
| Căutare CUI la ANAF, autocompletare, marcaj inactiv | gata | — |
| Membri prin invitație, transfer de proprietate | gata | — |
| Cont rapid persoană fizică, telefon confirmat prin OTP | gata | — |
| Încărcare documente, extragere AI, coadă de aprobare | gata | — |
| Stări de document: valid, expiră curând, expirat | gata | — |
| Registru vehicule: număr, VIN, tip, dimensiuni, șofer, trasee | gata | — |
| Memento-uri de expirare pe e-mail la 30/14/7/1 zile | parțial | Coada se umple și dispecerul le trimite; **nu a fost văzut niciun e-mail real ajuns în inbox**, pentru că furnizorul nu este configurat |
| Suspendare și reactivare automată | gata | — |
| Administrarea echipei (`set_platform_staff()`) | gata | — |

**Criteriul de ieșire al fazei**: un transportator se înscrie, invită un
dispecer, adaugă o platformă, încarcă actele și este verificat fără ca
nimeni să atingă baza de date; o RCA expirată suspendă, reînnoirea
reactivează. **Îndeplinit în cod și în teste; neconfirmat de la un capăt la
altul pe producție cu un cont real.**

## Faza 2 — Cereri

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Cerere cu marcă, model, an, stare, tip serviciu | gata | — |
| Persoanele fizice publică cu contul rapid | gata | — |
| Stările de anunț din spec | gata | — |
| Panou public cu filtre | gata | — |
| Deschiderea contactului, limitată de plan | gata | — |
| Import din anunț (link sau poză) | gata | — |

## Faza 3 — Trasee tur și retur

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Trasee `tur` și `retur` cu opriri, tipuri acceptate, preț orientativ | gata | — |
| Platforme cu locuri, scădere automată la confirmare | parțial | Scăderea la confirmarea comenzii ține de Faza 2 (comenzi); azi locurile se ajustează doar la rezervare |
| Rezervări care expiră în 24 de ore | gata | — |
| Clienții nu rezervă direct | gata | — |

## Faza 4 — Potrivire

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Mesajul „N transportatori verificați circulă pe această rută" | gata | — |
| Alerte pe e-mail pentru traseele salvate | parțial | Se pun în coadă și au șablon; **nefolosite de nimeni real**, din același motiv ca memento-urile |
| Homepage: „alerte pe e-mail", nu „pe WhatsApp" | gata | — |

## Faza 9 — Abonamente

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Perioadă gratuită de la verificare | gata | — |
| Plată recurentă, schimbare card, anulare | lipsește | Nu există procesator de plăți. Abonamentele se activează manual de echipă |
| Factură pentru fiecare plată | lipsește | Aceeași cauză |
| Memento de reînnoire, suspendare pentru neplată | parțial | Memento-ul există ca șablon; suspendarea pentru neplată nu este implementată |
| Coduri promo, istoric de plăți | lipsește | — |

## Administrare (partea din faza 10 care ține de Faza 1)

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Coadă de verificare documente și firme | gata | — |
| `/admin/notificari`: starea joburilor și coada | gata | — |
| `/admin/stergeri`: cereri de ștergere și anonimizare | gata | — |
| `/admin/setari`: praguri, grație, retenție | gata | — |
| `/admin/import`, `/admin/pagini`, `/admin/optiuni`, `/admin/preturi` | gata | — |
| Export de rapoarte | lipsește | Faza 2 |

## GDPR și documente legale

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Ștergerea contului și a firmei, cu perioadă de grație | gata | — |
| Export „Descarcă datele mele" | gata | — |
| Anonimizare din partea echipei, cu motiv, auditată | gata | — |
| Retenție 24 de luni pentru jurnalul de contacte | gata | — |
| `/termeni`, `/confidentialitate`, `/cookies` | parțial | **Neverificate de un avocat** și fără datele operatorului. Vezi `docs/09-verificare-juridica.md` |
| Înregistrarea versiunii acceptate, re-acceptare la schimbare | gata | — |

---

## Pregătirea operațională

Astea nu sunt funcționalități și nu apar în roadmap, dar fără ele lansarea
nu are sens.

| Element | Stare | Cine |
|---|---|---|
| **Furnizor de e-mail configurat** (`RESEND_API_KEY`, `MAIL_FROM`) | lipsește | Madalin / Edi. Fără el dispecerul răspunde 503 și numește variabila lipsă. Nimeni nu a primit niciodată un e-mail de la platformă |
| **Joburile programate rulează** | de confirmat | Migrația `20260918210000` le programează pe toate opt. De verificat pe `/admin/notificari` că trec pe „la zi" în 24 de ore |
| **Documentele legale verificate** | lipsește | Avocat. Lista este în `docs/09-verificare-juridica.md` |
| **Datele operatorului completate** | lipsește | Edi, în `src/config/company.ts` |
| **Conturile de test separate de cele reale** | parțial | Există conturi de test pe producție. De marcat vizibil și de exclus din orice număr arătat public — azi nu sunt |
| **Decizia despre proiectul Supabase de producție** | de luat | Proiectul actual a fost creat pentru dezvoltare. De decis dacă lansăm pe el sau creăm unul nou în `eu-central-1`, cu datele migrate. Regiunea nu se schimbă după creare |
| **Secretele în Vault** | parțial | `outbox_dispatcher_url`, `account_deletion_url`, `cron_secret`. De confirmat că toate trei există |
| **Backup și restaurare** | de confirmat | Supabase face backup automat pe planul plătit. De testat o restaurare o dată, înainte de lansare, nu după |

---

## Cum măsurăm criteriul de ieșire

Criteriul din roadmap este: **20 de transportatori verificați și 5 case de
expediții care folosesc platforma săptămânal, fără noi în buclă**.

„Verificat" se numără exact:

```sql
select count(*) from public.companies
where verification_status = 'verified' and not is_suspended
  and company_type in ('transport', 'both');
```

„Casă de expediții" este același lucru cu `company_type in ('expeditie',
'both')`.

„Săptămânal" are nevoie de o definiție care nu există încă în cod. Propunem:
o firmă este activă într-o săptămână dacă a făcut cel puțin una dintre
acțiunile de mai jos în acea săptămână. Toate sunt deja înregistrate.

| Acțiune | Unde se vede |
|---|---|
| A publicat un traseu sau o cerere | `cargo_listings.published_at`, `truck_listings.published_at` |
| A deschis datele de contact ale cuiva | `contact_reveals.created_at` |
| A rezervat sau a confirmat un loc | `departure_bookings.created_at` |
| Un membru s-a autentificat | `profiles.last_seen_at` |

„Fără noi în buclă" înseamnă: nicio intervenție manuală a echipei în
săptămâna respectivă, în afara aprobării documentelor. Se citește din
`audit_log`, filtrat pe `actor_role = 'staff'`.

**Ce lipsește ca să putem măsura**: un ecran care pune numerele astea
împreună. `audit_log` și tabelele de mai sus au datele; nimic nu le
adună. Este o zi de lucru și ar trebui făcut înainte de lansare, nu după —
un criteriu de ieșire pe care nu îl poți citi într-o pagină este un criteriu
pe care nimeni nu îl verifică.

Al doilea criteriu — **peste jumătate din înțelegeri pornite de la o ofertă
în platformă, nu de la un telefon** — nu se poate măsura deloc în Faza 1,
pentru că ofertele sunt Faza 2. Până atunci, toate înțelegerile pornesc de la
un telefon, prin construcție.
