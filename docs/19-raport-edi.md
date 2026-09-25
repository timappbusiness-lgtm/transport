# Coridor: unde suntem — raport pentru Edi, 25 septembrie 2026

## 1. Unde suntem

În cod, platforma face tot drumul: cerere, ofertă, comandă cu poze, contract
și evaluare. Pe site-ul real sunt oprite e-mailurile, citirea actelor,
notificările pe telefon și mesajele programate: lipsesc cheile, nu codul
(verificat pe 24 septembrie). Un transportator și un client reali **nu** o pot
folosi mâine fără ajutorul nostru; după ce punem cheile și avem un om care
aprobă actele, da.

## 2. Ce funcționează

Totul are teste automate, dar ecranele n-au fost testate pe o bază reală și
**niciun drum n-a fost parcurs de un om, cu un cont real, pe site-ul real.**

- Clientul își face cont și publică o cerere, cu poze.
- Transportatorul vede cererile imediat, publică trasee pe tur și pe retur și
  urcă cele 6 acte pe un ecran. *Citirea automată a actelor e oprită.*
- Echipa aprobă actele (un act expirat suspendă firma sau mașina) și poate face
  contul firmei la telefon. *Linkul se dă pe WhatsApp.*
- Ofertă, acceptare sau refuz; telefoanele rămân ascunse până la acceptare.
- Comanda, cu poze la preluare și cod la livrare; disputele, la echipă.
- Contractul din comandă, acceptat în platformă. *Textul e ciornă.*
- Evaluări, mesaje, alerte pe căutări salvate, ștergerea contului.

## 3. Ce trebuie făcut de voi, în ordinea urgenței (est. = estimare)

| Ce | Cine | Cât durează | Cât costă | Ce se blochează |
|---|---|---|---|---|
| E-mail (Resend, SMTP) | Madalin, Edi | o zi (est.) | 0 (est.) | Orice e-mail; publicarea |
| Chei: acte, mesaje, telefon | Madalin | o oră (est.) | §4 | Citirea actelor, mesajele |
| Cine aprobă actele | Edi | o decizie | timp de om | Promisiunea de 24 de ore |
| Datele firmei | Edi | 15 min | 0 | Paginile legale |
| Verificarea juridică | avocat | de aflat | de cerut | Contractul: pilotul. Restul: lansarea |
| Baza de producție | Edi, Madalin | o zi (est.) | §4 | E comună cu probele |
| Cine primește alertele | Madalin | o zi (est.) | 0 | Nu află nimeni când pică |
| 3 luni gratuite la pilot | Edi | un minut | venit amânat | Implicit: 30 de zile |
| Tarifele orientative | Edi, asociat | 1–2 zile (est.) | 0 | /preturi (cifre provizorii) |
| Furnizorul de SMS | Edi | o zi + aprobări | §4 | Nimic la pilot |
| Procesatorul de plăți | Edi | după pilot | comision | Plata automată |

## 4. Cât costă pe lună

Pentru 20 de transportatori, 5 case de expediții, 100 de cereri pe lună și
4,5 lei/$. Prețurile de listă sunt **neverificate azi**: site-urile ne sunt blocate.

| Ce | Pe lună |
|---|---|
| Supabase, plan plătit (copii zilnice) | ~25 $ ≈ 115 lei (est.) |
| Vercel, plan plătit | ~20 $ ≈ 90 lei de om (est.; poate plătit deja) |
| Resend | 0 până la 3.000 de e-mailuri; ~20 $ peste (est.) |
| Citirea actelor | ~0,09 lei pe act; 10–25 lei o singură dată, la pornire (calculat) |
| Importul unei cereri dintr-un anunț de pe alt site | sub 5 lei; plafon în cod de 50 $ (calculat) |
| SMS | 0 la pilot |
| **Total pilot** | **~200–250 lei (est.)** |

## 5. Ce facem noi în continuare (numai cod; zile estimate)

1. Al doilea criteriu pe /admin/pilot; „activ” = ofertă sau comandă. — 1–2 zile
2. Alertă către un om când nu pleacă mesajele. — 1 zi
3. Drumurile din §2 parcurse pe site-ul real; testele cu bază, rulate. — 4–5 zile
4. Formularul de traseu, de la 20 de câmpuri la 3. — 2 zile
5. Contractul, cu textul avocatului. — o zi

**Faza 3 se amână după pilot.** Contractul, prima ei parte, e făcut (textul așteaptă avocatul). Rămân:

- indicele de prețuri, din transporturi încheiate;
- locul mașinii pe hartă în timpul comenzii;
- promovarea plătită a cererilor și traseelor;
- alertele pe WhatsApp;
- profilele firmelor, găsite în Google;
- unelte în plus pentru șofer.

## 6. Pilotul

**Asociatul pregătește:**
- 20 de transportatori și 5 case de expediții care au spus „da”, fiecare cu
  un om de contact (nume, telefon, e-mail verificat literă cu literă).
- Actele: licența comunitară, ONRC, asigurarea CMR; pe mașină ITP, RCA, copie
  conformă. Casele de expediții: certificatul lor și ONRC.

**Înscrierea:** asistată, la telefon, ~10 minute pe firmă; firma primește un
link și își alege parola. [Ghid](inscriere-asistata.md).

1. **Criteriul 1: 20 de transportatori verificați și 5 case de expediții,
   active săptămânal, fără noi.** Azi contează ca „activ” și o autentificare.
2. **Criteriul 2: peste jumătate din înțelegeri pornesc de la o ofertă, nu de
   la un telefon.** **Azi nu îl măsoară nimic**; întrebăm și firmele.

**Săptămânal, pe /admin/pilot:** firme active, acte în așteptare, primul contact,
mesaje eșuate și intervențiile noastre.

## 7. Riscuri

1. **Platforma goală** — la început citim noi cererile și sunăm transportatorul.
2. **Înțelegerea se mută pe telefon** — măsurăm din prima săptămână, întrebăm de ce.
3. **Primul om real găsește ce n-au găsit testele** — parcurgem noi totul înainte.
4. **Actele așteaptă prea mult** — un nume, un înlocuitor, cel mai vechi act urmărit.

## 8. Ce nu construim și de ce

- **Plata transportului, escrow, comision:** alt business; vindem abonamente.
- **Aplicații în magazine, GPS permanent:** site-ul merge pe telefon.
- **Verificări automate ARR, RAR, AIDA:** cer un acord pe care nu îl avem.
- **Prețuri propuse automat:** fără transporturi încheiate, ar fi inventate.
- **Licitații:** părțile vor ofertă directă.
- **Publicare fără cont:** decis pe 22 septembrie; contul se face la final.
- **Marfă generală, bărci, utilaje, tractări, acces pentru alte programe:** în afara nișei.

Detalii: [configurare-externa.md](configurare-externa.md) (pașii) ·
[09-verificare-juridica.md](09-verificare-juridica.md) (avocatul) ·
[faza-1-checklist.md](faza-1-checklist.md) · [04-roadmap.md](04-roadmap.md)
