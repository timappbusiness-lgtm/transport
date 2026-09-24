# Viteza înscrierii: înainte și după

Un transportator ne-a spus că înscrierea e prea complicată. Verificarea
actelor rămâne — e motivul pentru care un transportator plătește — așa că
s-a schimbat **ordinea** întrebărilor, nu regulile. Documentul ăsta spune
cât costă acum fiecare drum, față de `main` înainte de schimbare
(`2550399`), și unde se opresc cel mai probabil oamenii.

## Cum s-a măsurat

Trei feluri de numere, fiecare marcat în tabele:

- **parcurs** — mers pas cu pas într-un browser, de
  `scripts/masoara-inscrierea.mjs`, pe ambele versiuni, construite pentru
  producție și pornite una lângă alta (`main` pe 3001, ramura pe 3000), la
  390 px. Scriptul numără pe fiecare ecran controalele vizibile (un grup de
  butoane radio e un singur control; ce stă într-o casetă închisă nu se
  vede, deci nu se numără), apoi completează ce trebuie și numără atingerile
  și caracterele tastate.
- **numărat din cod** — ecranele care cer un cont (firma, vehiculele,
  actele, aprobarea) nu se pot parcurge aici: sandboxul nu ajunge la o bază
  Supabase. Controalele și atingerile lor sunt numărate din componentele
  fiecărei versiuni. Drumul întreg e scris în
  `tests/e2e/inscriere-rapida-supabase.spec.ts` și se rulează cu baza
  pornită.
- **minute calculate** — nu am cronometrat un om. Minutele sunt calculate
  din numerele de mai sus cu modelul KLM (keystroke-level model), la
  viteză de telefon: **1,1 s** o atingere, **0,35 s** un caracter,
  **1,35 s** gândul dinaintea fiecărui câmp, **15 s** o fotografie la un
  act. Aceleași constante pentru ambele versiuni, deci comparația e
  cinstită chiar dacă cifra absolută nu e un cronometru. Pentru cifra
  adevărată: scenariul de 10 minute din raport, cu un om, cu ceasul.

Rulat din nou oricând:

```bash
pnpm build && pnpm start                       # ramura, pe 3000
node scripts/masoara-inscrierea.mjs http://127.0.0.1:3000 ramura
```

## Clientul: o cerere publicată

| | Înainte (`main`) | După | Cum |
| --- | --- | --- | --- |
| Ecrane până la cont | 4 pași + formularul de cont | la fel | parcurs |
| Câmpuri vizibile, pasul 1 (traseu) | 6 | 5 — „Până la" e o casetă „Poate fi încărcat și în alte zile?" | parcurs |
| Câmpuri vizibile, pasul 2 (vehicul) | 11 | 6 — greutatea și cele patru bife de stare stau într-o casetă al cărei rând spune ce conține („roțile se învârt, direcția merge, are cheile, fără avarii") și care se deschide singură când un răspuns nu e cel obișnuit | parcurs |
| Câmpuri vizibile, pasul 3 (serviciu) | 3, toate precompletate | 3, la fel | parcurs |
| Câmpuri vizibile, pasul 4 fără cont | 4 (nume, telefon, e-mail, detalii) | **0** — numele, telefonul și e-mailul le cere contul, o singură dată; detaliile, într-o casetă | parcurs |
| Formularul de cont | 5 (nume, e-mail, telefon, parolă, termeni) | 5, la fel | parcurs |
| **Total câmpuri vizibile** | **29** | **19** | parcurs |
| Câmpuri completate | 12 | 10 | parcurs |
| Câmpuri scrise de două ori | 2 (numele și telefonul: la pasul 4 și din nou la cont) | **0** | parcurs |
| Atingeri până la „Creează contul" | 18 | 16 | parcurs |
| Caractere tastate | 114 | 95 | parcurs |
| Minute până la „Creează contul" | 1,3 | 1,1 | calculate |
| Pasul 4 după confirmarea e-mailului | câmpurile din ciornă + „Publică" | telefonul luat din cont + „Publică" | numărat din cod |

**De la pasul contului la cererea publicată:** „Fă-ți cont gratuit", patru
câmpuri și bifa, „Creează contul", linkul din e-mail, „Publică cererea":
10 atingeri, 51 de caractere, **aproximativ 34 de secunde** plus cât
durează să ajungă e-mailul. Sub un minut, în ambele versiuni — ce s-a
câștigat e înainte de cont, nu după. Specul cu bază de date verifică
minutul cu ceasul.

## Transportatorul: de la „vreau să văd" la prima ofertă

O firmă de transport cu un vehicul. Actele obligatorii sunt aceleași ca
înainte: licența comunitară, certificatul ONRC și asigurarea CMR ale
firmei; copia conformă ARR (cu excepția de sub 3,5 t), ITP-ul și RCA-ul
vehiculului. Șase acte, șase fotografii, în ambele versiuni.

| Faza | Înainte (`main`) | După | Cum |
| --- | --- | --- | --- |
| Contul | 3 câmpuri + termeni (fără telefon) | 4 câmpuri + termeni (telefonul, cerut de sarcină; e cel pe care îl sună clienții și intră singur la firmă) | parcurs |
| Unde ajunge după cont | pagina „Verifică-ți e-mailul", apoi panoul contului | **panoul de cereri**, cu o linie despre e-mail și una despre acte | parcurs |
| Poate vedea cererile | după ce trece prin firmă | **imediat**, fără nimic completat | parcurs |
| Firma | un ecran cu două formulare: CUI + „Caută", apoi 7 câmpuri; județul și localitatea de mână | un formular: CUI-ul caută singur la ANAF, restul vine completat; telefonul și e-mailul din cont | numărat din cod |
| Vehiculul | număr, tip, VIN; apoi pagina vehiculului | număr, tip, câte mașini încap; rămâne pe loc, „Adaugă încă un vehicul" | numărat din cod |
| Actele | lista, apoi **un ecran pe act** pentru cele 3 ale firmei, apoi pagina vehiculului pentru cele 3 ale lui, apoi înapoi la listă | **un singur ecran** pentru toate șase, cu progres („3 din 6 încărcate") și trimiterea la verificare jos | numărat din cod |
| **Ecrane, de la cont la „Trimite la verificare"** | **11** | **6** (dintre care 3 cu acte: firma, vehiculul, actele) | numărat din cod |
| Atingeri | 45 | 35 (pe rând, cu camera); 31 dacă actele sunt deja în galerie | numărat din cod |
| Minute până la panou | după firmă, vehicul și acte | **sub 1** (contul: 0,6) | calculate |
| Minute cu acte cu tot | 2,9 | 2,9 | calculate |

Casa de expediții (două acte obligatorii: certificatul de casă de
expediții și ONRC; asigurarea de răspundere poate aștepta): **8 → 5**
ecrane, **21 → 18** atingeri, **1,3 → 1,4** minute.

**Ce spun cifrele, cinstit.** Timpul total cu acte nu a scăzut: aceleași
acte, aceleași fotografii, și acum câte o atingere în plus pe act, ca
transportatorul să confirme data de expirare pe care am citit-o (cerut
explicit). Ce s-a schimbat e **când** se plătește timpul ăsta și **câte
ecrane** îl împart: panoul e acolo în sub un minut, actele se cer abia când
omul vrea să trimită o ofertă, să publice un traseu sau să vadă un contact
— cu o frază despre de ce — și toate stau pe un ecran în loc de cinci.
Bannerul de pe panou promite „aproximativ X minute" cu 45 de secunde pe act,
mai mult decât modelul, fiindcă include căutatul hârtiei în cabină.

## Ce s-a mutat mai târziu

- **Firma, vehiculele, actele**: după cont, nu înainte de panou. Se cer la
  prima ofertă, primul traseu sau primul contact, cu pagina care explică de
  ce și întoarcerea exact acolo unde a plecat omul (`?pentru=…&next=…`).
- **Actele vehiculelor**: nu se mai cer la adăugarea vehiculului.
- **Numele, telefonul și e-mailul clientului**: din pasul 4 în formularul
  de cont, o singură dată.
- **Câmpurile opționale** ale cererii: într-o casetă, nu șterse.

## Ce a rămas impus, neschimbat

Nicio regulă din baza de date nu s-a atins; singura migrare adaugă o
coloană opțională (`vehicles.platform_slots`, 1–15).

- **Nicio ofertă, niciun traseu publicat, niciun contact dezvăluit înainte
  de verificare**: `company_can_act()` și gărzile ei. Ecranele doar le
  anunță mai devreme.
- **Toate actele obligatorii, exact ca înainte**: licența comunitară sau
  certificatul de casă de expediții, ONRC, asigurarea CMR, copia conformă
  ARR pe vehicul cu excepția existentă sub 3,5 t, ITP, RCA. Lista vine din
  `document_requirements`; ecranul o doar numără.
- **Aceeași verificare de către oameni**: `submit_company_for_review`,
  `review_document`, `review_company`, cu aceleași gărzi. Garda pentru
  firma inactivă la ANAF are acum și date: instantaneul ANAF se salvează la
  crearea firmei (înainte nu se salva niciodată).
- **Mascarea contactelor, cotele, publicarea cererilor** (telefon, e-mail
  confirmat pentru persoane fizice): neschimbate.

## Unde se opresc oamenii, cel mai probabil

1. **E-mailul de confirmare.** Omul iese din site, în aplicația de e-mail.
   Transportatorul vede deja panoul cât așteaptă; clientul își găsește
   cererea exact pe pasul 4. Linkul trebuie deschis pe același dispozitiv
   (scrie pe pagină).
2. **Actele, pentru transportator.** Nu e un formular, e o căutare de
   hârtii: polița CMR, copia licenței, talonul. De aceea se cer abia la
   prima ofertă și se pot alege toate deodată din galerie.
3. **Așteptarea verificării.** Cel mai lung timp din tot drumul, și singurul
   pe care nu-l măsoară nimic aici. Nu promitem o durată nicăieri.
4. **ANAF indisponibil la CUI.** Formularul spune și lasă completarea de
   mână; o verificăm la aprobare.
5. **Pasul 2 pentru ce nu e un autoturism** (Altceva, istoric):
   descrierea minimă de 10 caractere e o regulă a bazei.

## Propuneri (neimplementate — pentru decizia voastră)

- **Pasul 3 pliat în pasul 4.** Are numai alegeri precompletate (Standard,
  14 zile, pe bursă) și costă o atingere. Rezumatul de la pasul 4 le arată
  deja, cu „Modifică". Nu l-am scos acum: pașii sunt în adresă, iar testele
  de continuitate se sprijină pe ei.
- **Certificatul ONRC verificat prin ANAF, nu încărcat.** E obligatoriu,
  nu expiră, iar datele lui (denumire, nr. Reg. Com., stare) vin deja de la
  ANAF la CUI. Ar scădea un act din șase. E o schimbare de regulă, deci nu
  am făcut-o.
- **`review_document` verifică firma singur** când ultimul act e aprobat,
  fără `review_company`. Merită hotărât dacă e intenționat.
- **Publicarea pentru o persoană fizică înainte de confirmarea e-mailului**,
  vizibilă abia după confirmare. Ar scoate ieșirea în e-mail din minutul
  clientului. E o regulă (`email_is_confirmed`), deci doar propunere.
- **Două citiri AI pentru un act din galerie** (una ca să-l recunoască,
  una ca să-l citească după ce transportatorul îl confirmă). Costul e mic,
  dar s-ar putea păstra prima citire pe server și sări peste a doua.
