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

## De pregătit odată cu ele

8. **Contractele cu subîmputerniciții**: Supabase, Vercel, furnizorul de
   e-mail, Anthropic. Le enumerăm public în politica de confidențialitate;
   trebuie să existe și pe hârtie.
9. **Registrul de prelucrări** (art. 30). Nu există. Categoriile și
   perioadele sunt deja scrise în politica de confidențialitate și în
   `docs/06-gdpr-and-antifraud.md`, deci este muncă de transcriere.
10. **Notificarea ANSPDCP**, dacă avocatul consideră că este necesară
    pentru prelucrările noastre.
11. **Verificarea faptului că nu suntem intermediar în sensul legii
    transporturilor.** Publicăm anunțuri și punem părțile în legătură. De
    confirmat că asta nu ne aduce obligații de licențiere.

## De știut înainte de discuție

- Nu încasăm bani pentru transport. Nu există escrow, comision sau plată în
  platformă. Abonamentul este singurul lucru pe care îl facturăm.
- „Firmă verificată" înseamnă strict: documente cerute, primite, citite de un
  om, plus CUI verificat în registrul public ANAF, plus suspendare automată
  la expirare. Nimic despre bonitate, nimic despre comportament contractual.
- Ștergerea contului funcționează și este testată. Perioada de grație este
  configurabilă din `/admin/setari` și este 14 zile.
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
