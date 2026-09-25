# Ce trebuie verificat de un avocat înainte de lansare

Documentele din `src/content/legal/` sunt scrise de echipa care a construit
platforma. Descriu corect ce face software-ul — asta este partea pe care o
putem garanta noi. Nu sunt verificate de nimeni că spun ce cere legea
română să spună, iar până atunci fiecare pagină poartă o notă care spune
exact asta.

Lista de mai jos este ce trebuie pus în fața avocatului, în ordinea în care
contează.

## Blocant pentru lansare

1. **Datele operatorului.** `src/config/company.ts` este gol. Denumire
   legală, CUI, număr de înregistrare la registrul comerțului, sediu, două
   adrese de e-mail. Fără ele, paginile afișează `[de completat]` și nu pot
   fi considerate publicate.
2. **Termeni și condiții, punctul 2 — „Ce este platforma, și ce nu este".**
   Toată apărarea noastră stă pe faptul că nu suntem parte în contractul de
   transport. Dacă formularea nu ține în fața unei instanțe române, restul
   documentului nu contează.
3. **Punctul 10 — limitarea răspunderii.** Am limitat-o la suma plătită ca
   abonament în ultimele 12 luni și am exclus explicit vătămarea, dolul și
   culpa gravă. De verificat dacă limita este opozabilă unui profesionist și
   ce se schimbă față de un consumator.
4. **Clauze abuzive față de consumatori.** Persoanele fizice care publică
   cereri sunt consumatori. De verificat suspendarea fără preaviz (punctul
   8), competența instanței (punctul 11) și lipsa rambursării pentru
   abonamentul neconsumat (punctul 7).
5. **Politica de confidențialitate, secțiunea 3 — temeiurile.** Am invocat
   interesul legitim pentru jurnalul de deschidere a contactelor și pentru
   prevenirea fraudei. De verificat dacă avem nevoie de un test de echilibru
   documentat (LIA) și dacă trebuie publicat.
6. **Secțiunea 8 — ce rămâne după ștergere.** Păstrăm un identificator
   pseudonim în jurnalul deciziilor, invocând art. 17(3). De confirmat că
   temeiul ține și că formularea este suficientă.
7. **Rolul nostru față de datele șoferilor.** Am scris că firma este
   operator și noi persoană împuternicită. De confirmat, și de pregătit
   contractul de prelucrare pe care îl semnăm cu fiecare firmă client.
8. **Contractul de transport, modelul 1.0 — înainte de pilot.** Îl generează
   platforma din comandă (`supabase/functions/contract-pdf/templates/contract-1.0.ts`;
   cum funcționează: `docs/20-contract-transport.md`). Fiecare PDF poartă
   pe prima pagină nota „Proiect de contract, în curs de verificare
   juridică". Clauzele de verificat, cu numerele din document:
   - **Preambulul și punctul 2 — platforma ca intermediar.** „Nu este parte
     la acest contract de transport, nu execută transportul, nu încasează
     prețul". Trebuie să spună același lucru ca punctul 2 din termeni și să
     țină și pe un document pe care îl generăm noi, cu numele nostru în el.
   - **Punctul 1 — părțile.** Pentru o persoană fizică: nume, e-mail,
     telefon, fără CNP și fără adresă. De confirmat că un contract de
     transport cu un consumator este valabil așa și că verificarea
     identității la predare, după actul de identitate, este suficientă.
     Pentru firme: reprezentantul legal vine dintr-un câmp completat de
     firmă, nu verificat de noi.
   - **Punctul 4 — documentele verificate.** Scriem „verificat în platformă
     la …" lângă licență, asigurarea CMR, ITP, RCA și copia conformă. De
     confirmat că formularea nu ne face garanți ai valabilității lor.
   - **Punctul 6 — plata.** Termenul de plată îl socotim „de la primirea
     facturii, pe care transportatorul o emite după livrare". În platformă
     termenul este doar un număr de zile; de confirmat punctul de pornire.
     Fără termen: „la livrare".
   - **Punctul 9 — predarea și primirea.** Termenul de 7 zile pentru
     avariile ascunse (după art. 30 CMR) l-am pus și pentru transportul
     intern. De confirmat față de Codul civil.
   - **Punctul 10 — răspunderea.** Internațional: CMR, cu limitele ei
     (art. 23: 8,33 DST/kg). Intern: Codul civil, fără limită contractuală.
     De confirmat dacă transportatorul poate sau trebuie să-și limiteze
     răspunderea pe intern și cum se leagă de polița lui de asigurare.
   - **Punctul 11 — forța majoră și anularea.** Pragul de 5 zile după care
     oricare parte renunță și cheltuielile datorate la anulare sunt ale
     noastre, nu ale legii. De confirmat sau de înlocuit.
   - **Punctul 12 — litigiile.** Instanțele din România, 15 zile de
     încercare amiabilă, drepturile consumatorului (ANPC, SAL, instanța de
     la domiciliu). De confirmat că nu este clauză abuzivă și dacă trebuie
     menționat dreptul de retragere (credem că nu se aplică: art. 16 din
     OUG 34/2014, servicii de transport cu dată fixă).
   - **Punctul 13 — datele personale.** Părțile sunt operatori independenți
     pentru datele de contact ale celeilalte; noi păstrăm contractul cât
     păstrăm datele transportului, iar ștergerea la cerere anonimizează
     numele din instantanee și din acceptări. De confirmat că perioada ține
     și față de obligațiile de arhivare ale părților.
   - **Punctul 15 — acceptarea electronică.** Nu este semnătură electronică
     calificată (eIDAS, Regulamentul 910/2014) și spunem asta. Înregistrăm
     contul, numele, firma, data și ora, adresa IP, browserul și amprenta
     SHA-256 a versiunii. De confirmat: ce forță probantă are, dacă este
     suficientă pentru un contract de transport între profesioniști și față
     de un consumator, dacă textul trebuie să citeze legea națională a
     semnăturii electronice și dacă clauza prin care „părțile o recunosc ca
     dovadă" este valabilă.
   - **Versiunile.** Oricare parte poate genera o versiune nouă; se acceptă
     numai ultima, iar cele vechi rămân neschimbate, cu o notă că au fost
     înlocuite. De confirmat că o versiune acceptată de o singură parte nu
     creează obligații.

## De pregătit odată cu ele

9. **Contractele cu subîmputerniciții**: Supabase, Vercel, furnizorul de
   e-mail, Anthropic. Le enumerăm public în politica de confidențialitate;
   trebuie să existe și pe hârtie.
10. **Registrul de prelucrări** (art. 30). Nu există. Categoriile și
    perioadele sunt deja scrise în politica de confidențialitate și în
    `docs/06-gdpr-and-antifraud.md`, deci este muncă de transcriere. Se
    adaugă acceptările contractului: IP și browser, păstrate cât
    transportul.
11. **Notificarea ANSPDCP**, dacă avocatul consideră că este necesară
    pentru prelucrările noastre.
12. **Verificarea faptului că nu suntem intermediar în sensul legii
    transporturilor.** Publicăm anunțuri și punem părțile în legătură. De
    confirmat că asta nu ne aduce obligații de licențiere.

## Blocant de la prima vânzare online către consumatori

13. **SAL și SOL (ANPC).** Ordinul ANPC 449/2022 cere comercianților care
    vând online către consumatori să afișeze pe site două pictograme cu
    legătură: SAL (soluționarea alternativă a litigiilor) și SOL
    (platforma europeană de soluționare online a litigiilor).
    - **Când devine obligatoriu pentru noi:** obligația privește vânzarea
      către consumatori. Din momentul în care vindem abonamente online,
      cu plata pe site, unui consumator, este obligatorie. Azi abonamentele
      le cumpără firme și plata nu e online, iar persoanele fizice folosesc
      platforma gratuit. De confirmat dacă serviciul gratuit către
      consumatori ne aduce obligația deja. Rândul e oricum în subsolul
      fiecărei pagini, de pe 25 septembrie 2026, ca să nu depindă de o
      amintire.
    - **Ce am pus:** numai SAL, cu legătura `https://reclamatiisal.anpc.ro/`,
      ca buton simplu cu formularea oficială, într-un rând al lui, pe toate
      paginile, inclusiv în cont și în zona echipei
      (`src/config/consumer-redress.ts`). Pictograma oficială nu a putut fi
      descărcată; se pune în doi pași, `docs/configurare-externa.md` §12.
    - **De ce nu SOL:** platforma europeană a fost desființată prin
      Regulamentul (UE) 2024/3228 și s-a închis pe 20 iulie 2025; o
      legătură spre ea după data aceea poate induce în eroare. Ordinul ANPC
      270/2026 (7 aprilie 2026) a modificat Ordinul 449/2022: a scos
      referirile la SOL și a trecut SAL pe platforma reclamatiisal.anpc.ro,
      cu o pictogramă nouă de 250×50. **Sursele sunt comunicatul ANPC și
      presa; textul oficial nu a putut fi deschis** (anpc.ro și
      legislatie.just.ro erau inaccesibile din mediul de lucru).
    - **De confirmat:** (a) că SOL nu mai trebuie afișat; (b) legătura
      exactă pentru SAL; (c) dacă e obligatorie pictograma oficială, nu
      un buton, și unde (prima pagină, subsol); (d) termenul de
      conformare cu Ordinul 270/2026; (e) punctul 12 din contractul de
      transport menționează ANPC și SAL — de aliniat cu ce se confirmă.
    - Termenii 1.1 (§11) nu mai trimit la platforma europeană; e singura
      schimbare față de 1.0.

## Ce spun textele și nu face produsul (verificat pe 25 septembrie 2026)

Am citit fiecare frază din cele trei documente față de cod. Contradicțiile
de fapt, mici și fără echivoc, sunt corectate în versiunile 1.1 (termeni
§11; confidențialitate: adresa IP la acceptarea contractului, termenul de
24 de luni al jurnalului deciziilor; cookie-uri: numele și durata
cookie-ului de firmă, durata sesiunii, tot ce ține browserul). Restul cer
o decizie — construim ce promite textul, sau schimbăm textul — și nu le-am
rescris:

- **Termeni §12 — reacceptarea.** „…ți-o arătăm la următoarea
  autentificare, ca să o accepți înainte de a continua." Întrebarea apare
  numai la intrarea în `/cont`; publicarea unei cereri, deschiderea unui
  contact, salvarea unei căutări și cererea de abonament merg și fără
  acceptare, iar baza de date nu verifică. Propunere: verificarea în
  acțiunile publice (cod), nu schimbarea textului.
- **Termeni §3, §8, §9 — suspendarea de către echipă.** „Îți spunem
  motivul și ai dreptul să răspunzi." Nu există ecran sau funcție pentru
  o suspendare decisă de echipă; suspendarea automată (act expirat) există
  și anunță motivul. Persoanele fizice nu pot fi suspendate deloc.
- **Termeni §7 — abonamentul.** Nu spune de planul gratuit (3 deschideri
  pe lună) și nici de perioada de probă de 30 de zile; promite 30 de zile
  de preaviz la schimbarea prețului, pentru care nu există mecanism.
- **Termeni §9 — renunțarea.** „Contul se oprește imediat." Ștergerea e
  blocată cât ai transporturi neîncheiate sau ești singurul proprietar al
  unei firme cu alți membri.
- **Confidențialitate §4 — cererile persoanelor fizice, 12 luni.** Nu
  există job care să le șteargă; secțiunea spune că termenele ei sunt
  aplicate efectiv.
- **Confidențialitate §5 — deschiderea contactelor.** „…o poți vedea în
  exportul datelor tale." Exportul arată doar deschiderile făcute de tine;
  cine ți-a deschis numărul nu vezi nicăieri.
- **Confidențialitate §7 — exportul.** „…o arhivă cu tot ce avem despre
  tine." Lipsesc vehiculele, șoferii, căutările salvate, sesizările,
  evaluările și mesajele primite, contractele și acceptările, istoricul
  termenilor și fișierele însele.
- **Confidențialitate §4 — dovezile transportului.** „La anonimizare se
  șterg odată cu restul datelor tale." Se șterg numai la anonimizarea unei
  firme; la ștergerea unui client persoană fizică rămân numele și
  semnătura primitorului.
- **Confidențialitate §3 — e-mailurile despre cont „nu pot fi oprite".**
  Amintirea despre un act care expiră are link de dezabonare.
- **Confidențialitate §3, §7 — marketingul.** Consimțământ „bifat separat"
  și retragere „dintr-un clic": nu există nici bifa, nici e-mailuri de
  marketing. Promisiunea nu e încălcată azi, dar mecanismul lipsește.
- **Confidențialitate §5, §6 — cine mai vede datele.** Nu sunt numiți
  furnizorul de e-mail (Resend), serviciile de notificări ale browserelor
  și, când va fi pornit, furnizorul de SMS. „Singurul transfer" în afara
  UE e îndoielnic: Resend, Vercel și Supabase sunt firme americane.
  Regiunea Vercel nu e fixată în cod.
- **Termeni §3, §11 — mărunte.** Vârsta de 18 ani nu e declarată nicăieri
  la înscriere; termenul de răspuns e 30 de zile în termeni și două zile
  lucrătoare pe `/contact`.

## De știut înainte de discuție

- Nu încasăm bani pentru transport. Nu există escrow, comision sau plată în
  platformă. Abonamentul este singurul lucru pe care îl facturăm.
- „Firmă verificată" înseamnă strict: documente cerute, primite, citite de un
  om, plus CUI verificat în registrul public ANAF, plus suspendare automată
  la expirare. Nimic despre bonitate, nimic despre comportament contractual.
- Ștergerea contului funcționează și este testată. Perioada de grație este
  configurabilă din `/admin/setari` și este 14 zile.
- Contractul de transport nu îl semnăm și nu îl garantăm. Îl completăm din
  datele pe care le avem și le-am verificat, îl păstrăm în versiuni care nu
  se mai schimbă și înregistrăm cine l-a acceptat. Adresa IP și browserul
  le vede numai echipa.
- Nu avem cookie-uri care cer consimțământ, deci nu avem bannerul. Dacă
  avocatul consideră că e nevoie de unul oricum, se adaugă — dar pagina
  `/cookies` explică de ce nu există.

## După verificare

Când documentele sunt aprobate:

1. Se trece `LEGAL_REVIEWED = true` în `src/content/legal/document.ts`, ceea
   ce scoate nota de „document în lucru" de pe toate trei.
2. Dacă textul s-a schimbat, versiunea se urcă (`1.0` → `1.1` pentru
   formulări, `2.0` pentru orice schimbă ce accepți). Fișierul vechi rămâne
   în repo.
3. La următoarea autentificare, fiecare utilizator este întrebat din nou.
   Versiunea acceptată și data rămân în `terms_acceptances`.

Pentru contractul de transport:

1. Textul aprobat devine `contract-1.1.ts` (sau `2.0`), fără nota de
   proiect, înregistrat în `templates/index.ts`; `contract-1.0.ts` rămâne
   neschimbat, pentru versiunile deja generate.
2. O migrare nouă urcă `contract_template_version()` la noua versiune.
   Contractele deja generate se desenează în continuare cu modelul lor.
3. Comenzile în curs pot genera o versiune nouă, pe modelul aprobat; cele
   vechi rămân disponibile.
