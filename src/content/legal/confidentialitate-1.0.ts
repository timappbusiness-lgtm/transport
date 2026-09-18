import { ROUTES } from '@/config/routes';
import { BRAND_NAME } from '@/config/brand';
import { operatorField, operatorLine } from '@/config/company';
import type { LegalDocument } from './document';

/**
 * Politica de confidențialitate, versiunea 1.0.
 *
 * Written against the schema rather than against a template: every
 * retention period here is one the database actually enforces, and where
 * it does not yet, the text says so. A privacy notice that promises a
 * deletion nothing performs is the one document where being wrong is
 * itself the breach.
 *
 * Keep this file when 1.1 arrives.
 */
export const CONFIDENTIALITATE_1_0: LegalDocument = {
  slug: 'confidentialitate',
  title: 'Politica de confidențialitate',
  version: '1.0',
  effectiveFrom: '2026-09-18',
  lede: `Ce date ținem despre tine, de ce, cât timp și ce poți cere să facem cu ele. Scris pe baza a ce face efectiv platforma, nu pe baza unui model.`,
  sections: [
    {
      title: 'Cine decide ce se întâmplă cu datele tale',
      body: [
        `Operator de date este ${operatorLine()}.`,
        `Pentru orice întrebare despre datele tale, scrie la ${operatorField('privacyEmail')}. Nu avem obligația legală de a numi un responsabil cu protecția datelor și nu am numit unul; la adresa de mai sus răspunde direct echipa.`,
        'Pentru datele angajaților unei firme client — șoferi, administratori — firma este operatorul, iar noi suntem persoana împuternicită care le procesează în numele ei.',
      ],
    },
    {
      title: 'Ce date ținem',
      body: [
        'Majoritatea a ce ținem sunt date despre firme, care nu sunt date personale. Următoarele sunt.',
      ],
      list: [
        'Contul: nume, e-mail, telefon, parola (păstrată doar ca amprentă criptografică, niciodată în clar), tipul de cont.',
        'Firma și documentele ei: licențe, ITP, RCA, copie conformă, certificat ONRC, asigurare CMR. Multe dintre ele conțin numele unui administrator sau al unui șofer.',
        'Șoferii și vehiculele pe care le adaugi: nume, telefon, atestate, numere de înmatriculare.',
        'Cererile și traseele publicate, inclusiv orașe, date și fotografii pe care le încarci.',
        'Mesajele și ofertele schimbate pe platformă.',
        'Jurnalul de deschidere a contactelor: cine a văzut ce număr de telefon și când.',
        'Jurnale tehnice: adresa IP este păstrată ca amprentă cu sare, nu ca adresă, iar din anunțurile importate păstrăm doar numele domeniului, nu pagina.',
        'Notificările trimise și preferințele tale despre ele.',
      ],
    },
    {
      title: 'De ce le ținem și în ce temei',
      body: [
        'Fiecare categorie are un temei legal, și nu sunt toate la fel.',
      ],
      list: [
        'Contul și folosirea platformei — executarea contractului dintre noi (art. 6(1)(b) GDPR).',
        'Documentele firmei și verificarea lor — obligația legală a clientului nostru de a le deține, plus contractul cu noi.',
        'Jurnalul de deschidere a contactelor și semnalările de fraudă — interesul nostru legitim de a preveni frauda pe platformă (art. 6(1)(f)).',
        'Datele șoferilor — interesul legitim al firmei care îi angajează, procesate de noi în numele ei.',
        'Mesajele de marketing — doar cu consimțământul tău, bifat separat și retractabil oricând. Mesajele despre cont — document expirat, cont suspendat — nu sunt marketing și nu pot fi oprite.',
        'Facturile și transporturile încheiate — obligația legală de păstrare a documentelor contabile.',
      ],
    },
    {
      title: 'Cât timp le ținem',
      body: [
        'Perioadele de mai jos sunt cele pe care le aplică efectiv platforma, nu intenții.',
      ],
      list: [
        'Contul și datele lui: pe durata contului. După ștergere, mai există doar perioada de grație afișată în pagina Date personale.',
        'Documentele încărcate și fișierele din spatele lor: pe durata contului. La ștergere se șterg efectiv din depozit, nu doar din listă.',
        'Jurnalul de deschidere a contactelor: 24 de luni, după care un job nocturn îl șterge.',
        'Transporturile încheiate și documentele contabile: termenul legal de arhivare. Rămân, dar fără numele și datele tale de contact.',
        'Jurnalul deciziilor platformei (verificări, suspendări, ștergeri): rămâne, cu un identificator pseudonim în locul identității tale. Vezi secțiunea despre ștergere.',
        'Anunțurile persoanelor fizice: 12 luni de la ultimul anunț, dacă nu ceri ștergerea mai devreme.',
      ],
    },
    {
      title: 'Cine le mai vede',
      body: [
        'Nu vindem date, nu le închiriem și nu le dăm nimănui pentru publicitate.',
        'Alți utilizatori văd doar ce publici: anunțul, fără datele de contact. Numărul tău de telefon se vede de un transportator verificat doar după ce îl deschide din abonamentul lui, iar fiecare deschidere se înregistrează și o poți vedea în exportul datelor tale.',
        'Furnizorii pe care îi folosim ca să funcționeze platforma sunt următorii. Cu fiecare avem, sau vom avea înainte de lansare, contractul de prelucrare cerut de GDPR.',
      ],
      list: [
        'Supabase — baza de date, autentificarea și depozitul de fișiere. Proiectul este găzduit în Uniunea Europeană (Frankfurt).',
        'Vercel — găzduirea aplicației web. Servirea paginilor se face din regiuni europene.',
        'Furnizorul de e-mail tranzacțional — trimite mesajele despre cont. Vezi lista actualizată la adresa de contact de mai jos.',
        'Anthropic — citește automat documentele încărcate și anunțurile importate, ca să completeze câmpurile în locul tău. Conținutul trimis nu este folosit pentru antrenarea modelelor. Dacă nu vrei asta, ne scrii și introducem datele manual.',
      ],
    },
    {
      title: 'Unde ajung datele',
      body: [
        'Ținem datele în Uniunea Europeană oriunde putem, și le ținem acolo în cazul bazei de date și al fișierelor, care este partea care contează.',
        'Procesarea automată a documentelor și importul din anunțuri pot implica un transfer către un furnizor din afara UE, pe baza clauzelor contractuale standard ale Comisiei Europene. Este singurul transfer de acest fel și poate fi evitat, la cerere, prin introducerea manuală a datelor.',
      ],
    },
    {
      title: 'Ce poți cere',
      body: [
        'Ai toate drepturile din GDPR, iar pe cele care se pot face cu un buton le-am făcut butoane.',
      ],
      list: [
        'Acces: descarci o arhivă cu tot ce avem despre tine, din pagina Date personale. Nu trebuie să ne scrii.',
        'Rectificare: îți corectezi datele din cont. Pentru datele de identificare ale unei firme verificate, ne scrii și le corectăm noi.',
        'Ștergere: o ceri din aceeași pagină. Îți oprim contul imediat și ștergem datele după perioada de grație, cu excepția celor pe care legea ne obligă să le păstrăm.',
        'Restricționare și opoziție: ne scrii și oprim prelucrarea contestată cât timp o analizăm.',
        'Portabilitate: arhiva de mai sus este în format JSON și CSV, exact pentru asta.',
        'Retragerea consimțământului pentru marketing: dintr-un clic, din setările de notificări sau din orice e-mail de marketing.',
      ],
      link: { href: ROUTES.accountPersonalData, label: 'Date personale: descarcă sau șterge' },
    },
    {
      title: 'Ce rămâne după ștergere, și de ce',
      body: [
        'Ștergerea contului chiar șterge: profilul, cererile, traseele, ofertele, mesajele, documentele și fișierele din spatele lor, preferințele și dispozitivele pe care primeai notificări. La final dispare și autentificarea.',
        'Rămân trei lucruri, și e corect să le știi dinainte.',
        'Transporturile încheiate și documentele contabile rămân, fără numele și datele tale de contact, pentru că legea ne obligă să le arhivăm.',
        'Firmele care au dus măcar un transport nu se șterg, ci rămân ca o înregistrare fără identitate — fără denumire reală, fără CUI, fără date de contact, fără documente — pentru ca un transport încheiat să nu rămână cu o singură parte.',
        'Jurnalul deciziilor platformei rămâne, cu identificatorul tău intern (un șir aleatoriu, nu numele sau e-mailul) și fără datele tale de contact. Îl păstrăm pentru apărarea unui drept în instanță și pentru prevenirea fraudei, temeiuri pe care GDPR le recunoaște explicit ca excepții de la ștergere. Este singura urmă care te mai leagă de platformă după ștergere și nu poate fi corelată cu tine fără datele pe care tocmai le-am șters.',
      ],
    },
    {
      title: 'Securitate',
      body: [
        'Regulile de acces sunt aplicate în baza de date, nu în interfață: fiecare cerere este verificată acolo, iar un browser modificat nu ajunge la datele altcuiva.',
        'Documentele stau într-un depozit privat. Nu există link public către ele; când trebuie deschise, se generează o adresă valabilă câteva minute.',
        'Parolele nu sunt păstrate în clar. Adresele IP sunt păstrate ca amprentă cu sare.',
        'Dacă apare o breșă care îți pune datele în pericol, anunțăm autoritatea în 72 de ore și te anunțăm și pe tine dacă riscul pentru tine este ridicat.',
      ],
    },
    {
      title: 'Cookie-uri',
      body: [
        `${BRAND_NAME} folosește doar cookie-uri strict necesare. Nu avem publicitate, nu avem analytics de urmărire și nu vei vedea o fereastră care îți cere acordul, pentru că nu avem ce să îți cerem.`,
      ],
      link: { href: ROUTES.cookies, label: 'Ce cookie-uri folosim' },
    },
    {
      title: 'Reclamații',
      body: [
        `Scrie-ne întâi nouă, la ${operatorField('privacyEmail')}. Răspundem în cel mult 30 de zile.`,
        'Dacă nu ești mulțumit de răspuns, te poți adresa Autorității Naționale de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), București, sau autorității din țara în care locuiești.',
      ],
    },
    {
      title: 'Modificări',
      body: [
        'Când schimbăm această politică, schimbăm și versiunea și data de sus. Modificările importante sunt anunțate prin e-mail sau la autentificare.',
        'Versiunile anterioare rămân în istoricul nostru, ca să poți vedea ce scria când ți-ai făcut contul.',
      ],
    },
  ],
};
