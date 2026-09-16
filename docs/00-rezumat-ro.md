# Bursa de transport — rezumat pentru discuția cu clientul

> Documentul acesta este singurul în română: e făcut ca să poată fi trimis
> clientului. Restul documentației e tehnică și, conform convenției interne,
> e scrisă în engleză.

## Ce construim

O bursă de transport online (model `bursatractari.ro`) cu trei secțiuni,
exact cum au fost cerute:

| Secțiune | Cine postează | Ce postează |
|---|---|---|
| **Curse** | Case de expediții și firme | Marfă / curse disponibile |
| **Mașini pe tur** | Firme de transport | Camioane cu capacitate liberă pe dus |
| **Mașini pe retur** | Firme de transport + **persoane fizice** | Camioane care se întorc goale, plus cereri de transport de la persoane fizice cu cont rapid |

## Diferențiatorul: contul se suspendă singur

Asta e partea care ne desparte de un simplu site de anunțuri.

1. La înregistrare, firma încarcă documentele obligatorii: licență comunitară
   sau certificat de casă de expediții, certificat ONRC, asigurare CMR.
2. Pentru fiecare mașină din flotă: **ITP, RCA și copia conformă ARR**.
3. Fiecare document este citit automat (AI extrage data de expirare), apoi
   **confirmat de un om** din echipa de administrare.
4. Sistemul urmărește zilnic datele de expirare și trimite notificări la
   30, 14, 7 și 1 zi înainte.
5. În ziua expirării, contul se suspendă automat: firma **nu mai poate posta
   și nu mai poate vedea datele de contact**, dar se poate loga și încărca
   documentul nou. În momentul aprobării, contul se redeschide singur.

Rezultat: pe bursă nu există camioane fără ITP sau fără RCA valabil. Pentru o
casă de expediții asta e chiar motivul pentru care plătește abonament.

## Ce se poate verifica automat și ce nu

Trebuie spus clientului clar, pentru că afectează promisiunea comercială:

| Verificare | Se poate automat? | Cum o facem |
|---|---|---|
| Firma există, e activă, nu e radiată | **Da** | API public ANAF, gratuit, oficial |
| Firma e plătitoare de TVA | **Da** | Același API ANAF |
| Data expirării ITP / RCA / copie conformă | **Da, din document** | Citim documentul încărcat cu AI + confirmare umană |
| Interogare directă în baza de date a asigurătorilor (RCA) | **Nu** | Nu există API public în România. Verificarea oficială (portalul AIDA/BAAR) e o pagină web cu CAPTCHA, făcută pentru oameni. Scraping-ul ei nu e o fundație pe care să construim un produs comercial. |
| Interogare directă în registrul RAR pentru ITP | **Nu** | Aceeași situație |
| Registru public interogabil pentru copii conforme ARR | **Nu** | Nu există |

**Important:** cerința clientului („să vedem când expiră și să suspendăm
contul”) se rezolvă complet pe ruta documentelor. Nu avem nevoie de o
integrare cu asigurătorii ca să livrăm exact funcționalitatea cerută.

Dacă mai târziu clientul vrea verificare la sursă, ruta realistă e un
parteneriat comercial cu un broker de asigurări sau un furnizor de date auto
care are deja acces prin contract. E o discuție de business, nu una tehnică,
și o tratăm ca fază 2.

## Etape și livrare

| Fază | Conținut | Durată estimată |
|---|---|---|
| **1 — MVP** | Conturi, documente + suspendare automată, cele trei secțiuni, căutare, contact deblocat pe abonament | 4–6 săptămâni |
| **2 — Tranzacțional** | Oferte de preț, mesagerie în platformă, rating între firme, panou de administrare complet | 3–4 săptămâni |
| **3 — Creștere** | Alerte WhatsApp, anunțuri promovate, plăți automate, aplicație mobilă | 4+ săptămâni |

Estimările sunt pentru echipa noastră pe stack-ul Lovable + Supabase și pot
varia după ce se fixează designul.

## Bani

Modelul: **te uiți gratis, dar contactezi pe abonament.** Așa funcționează
toate bursele care merg.

| Plan | Preț / lună | Pentru cine |
|---|---|---|
| Gratuit | 0 lei | Oricine — 3 anunțuri, 3 contacte pe lună |
| Transportator | 149 lei | Firme de transport |
| Casă de expediții | 249 lei | Case de expediții |
| Business | 449 lei | Flote mari, grupuri de firme |
| Persoană fizică | 0 lei | Cont rapid pentru cereri pe retur |

Sursă suplimentară de venit: anunțuri promovate (afișate primele).

## De confirmat cu clientul

1. Cine face verificarea manuală a documentelor și în cât timp răspunde?
   (Promisiunea „aprobat în 24h” trebuie susținută de cineva real.)
2. Persoanele fizice pot vedea datele de contact ale transportatorilor gratuit
   sau limitat? Propunerea noastră: 5 contacte pe lună, gratuit.
3. Acoperim doar România sau și curse internaționale de la început?
4. Procesator de plăți preferat: Netopia, Stripe sau facturare manuală în MVP?
5. Cine e administratorul platformei și pe ce canal primește alertele?
