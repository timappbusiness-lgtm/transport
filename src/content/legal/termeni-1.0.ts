import { ROUTES } from '@/config/routes';
import { BRAND_NAME } from '@/config/brand';
import { operatorField, operatorLine } from '@/config/company';
import type { LegalDocument } from './document';

/**
 * Termeni și condiții, versiunea 1.0.
 *
 * Written to describe what the platform actually does, not what a
 * template says a platform does. Where we do not do something — check a
 * carrier's insurance every morning, guarantee that a transport happens,
 * hold anybody's money — it says so, because a term that promises more
 * than the software delivers is the term that loses the argument.
 *
 * Keep this file when 1.1 arrives.
 */
export const TERMENI_1_0: LegalDocument = {
  slug: 'termeni',
  title: 'Termeni și condiții',
  version: '1.0',
  effectiveFrom: '2026-09-18',
  lede: `Aceștia sunt termenii în care poți folosi ${BRAND_NAME}. Pe scurt: noi ținem locul în care vă găsiți, voi faceți transportul între voi. Restul paginii explică exact ce înseamnă asta.`,
  sections: [
    {
      title: 'Cine suntem',
      body: [
        `Platforma ${BRAND_NAME} este operată de ${operatorLine()}.`,
        `Ne poți scrie la ${operatorField('email')}. Pentru orice ține de datele tale personale, adresa este ${operatorField('privacyEmail')} și explicațiile sunt în politica de confidențialitate.`,
      ],
      link: { href: ROUTES.privacy, label: 'Politica de confidențialitate' },
    },
    {
      title: 'Ce este platforma, și ce nu este',
      body: [
        `${BRAND_NAME} este un loc de întâlnire între cine are o mașină de transportat și cine transportă mașini. Atât.`,
        'Nu suntem transportator. Nu suntem casă de expediții. Nu suntem parte în contractul de transport dintre tine și firma pe care o găsești aici, nu îl semnăm, nu îl garantăm și nu răspundem de executarea lui.',
        'Nu încasăm și nu ținem banii nimănui. Prețul se negociază direct între client și transportator, se plătește direct, iar factura o emite transportatorul.',
        'Nu preluăm, nu mutăm și nu depozităm vehicule. Nu avem nicio persoană pe teren.',
      ],
    },
    {
      title: 'Cine își poate face cont',
      body: [
        'Conturile sunt de două feluri.',
        'Persoanele fizice își fac un cont rapid și pot publica cereri de transport pentru propriul vehicul. Trebuie să ai cel puțin 18 ani și un număr de telefon pe care îl confirmi.',
        'Firmele își fac cont pe baza CUI-ului. Persoana care creează contul declară că are dreptul să reprezinte firma. Poate invita colegi, cu roluri diferite, și răspunde de ce fac aceștia în cont.',
      ],
      list: [
        'Un cont este al unei singure persoane. Parola nu se împarte.',
        'Datele de identificare ale unei firme verificate nu mai pot fi schimbate din cont; ne scrii și le corectăm noi.',
        'Un cont creat cu date false poate fi suspendat fără preaviz.',
      ],
    },
    {
      title: 'Ce își asumă transportatorii',
      body: [
        'Dacă publici trasee sau răspunzi la cereri ca firmă de transport, declari și menții următoarele pe toată durata folosirii platformei.',
      ],
      list: [
        'Ai licență de transport valabilă și, pentru transport internațional, licență comunitară.',
        'Fiecare vehicul cu care transporți are ITP valabil, RCA valabilă și copie conformă valabilă, acolo unde legea o cere.',
        'Ai asigurarea de răspundere a transportatorului (CMR) acolo unde o cere transportul pe care îl accepți.',
        'Capacitatea pe care o anunți este reală: platforma anunțată există, este disponibilă la datele pe care le publici și poate transporta ce ai declarat.',
        'Anunți din timp orice schimbare, inclusiv un document care expiră sau un vehicul care iese din flotă.',
        'Respecți legislația privind timpii de odihnă și transportul rutier de mărfuri.',
      ],
    },
    {
      title: 'Ce își asumă clienții',
      body: [
        'Dacă publici o cerere de transport, declari următoarele.',
      ],
      list: [
        'Ai dreptul să dispui de vehicul: ești proprietar, ai mandat de la proprietar sau ești împuternicit altfel.',
        'Datele despre vehicul sunt corecte — marcă, model, an, greutate, dacă rulează, dacă frânează, dacă are cheile, ce avarii are.',
        'Vehiculul nu conține bunuri nedeclarate, substanțe interzise sau persoane.',
        'Ești disponibil, tu sau cineva din partea ta, la încărcare și la descărcare.',
        'Plătești transportul convenit, în condițiile convenite cu transportatorul.',
      ],
    },
    {
      title: 'Ce înseamnă „firmă verificată", și ce nu înseamnă',
      body: [
        'Verificarea este o verificare de documente, făcută de oameni, la un moment dat. Atât înseamnă, și merită citit încet.',
        'Ce facem: cerem documentele obligatorii, ne uităm la ele, verificăm CUI-ul în registrul public ANAF, urmărim datele de expirare și suspendăm automat contul când un document obligatoriu expiră.',
        'Ce nu facem: nu verificăm dacă firma își respectă contractele, nu îi verificăm situația financiară, nu îi verificăm șoferii unul câte unul și nu garantăm că transportul va decurge bine. Nu suntem o asigurare și nu suntem un scoring de credit.',
        'Insigna „verificat" spune că actele erau în regulă ultima dată când le-am văzut. Restul rămâne judecata ta: cere referințe, cere contract scris, cere dovada asigurării pentru marfa ta.',
      ],
      link: { href: ROUTES.verification, label: 'Cum verificăm firmele' },
    },
    {
      title: 'Abonamente și plăți',
      body: [
        'Publicarea unei cereri este gratuită pentru persoane fizice. Firmele au nevoie de abonament pentru a vedea datele de contact, a publica trasee peste o anumită limită și a folosi celelalte funcții din pagina de abonamente.',
        'Prețurile, ce include fiecare plan și limitele lor sunt cele afișate în pagina de abonamente la momentul cumpărării. Le putem schimba pentru viitor, anunțând cu cel puțin 30 de zile înainte; abonamentul în curs rămâne la prețul plătit până la finalul perioadei.',
        'Abonamentul se facturează în avans, pentru perioada aleasă. Nu se rambursează pentru perioada rămasă dacă renunți mai devreme, cu excepția cazurilor în care legea prevede altfel.',
        'Un cont suspendat pentru documente expirate nu primește prelungirea perioadei de abonament: reactivarea este imediată după ce documentul nou este aprobat.',
      ],
      link: { href: ROUTES.plans, label: 'Abonamente și prețuri' },
    },
    {
      title: 'Ce nu se face aici',
      body: [
        'Următoarele duc la suspendarea contului, în unele cazuri fără avertisment.',
      ],
      list: [
        'Date false despre firmă, despre vehicul sau despre documente, inclusiv documente modificate.',
        'Publicarea de anunțuri pentru transporturi care nu există, ca să aduni contacte.',
        'Folosirea datelor de contact obținute aici pentru altceva decât transportul pentru care le-ai deschis — inclusiv pentru marketing.',
        'Extragerea automată a conținutului platformei, indiferent de mijloc.',
        'Încercarea de a ocoli limitele contului sau de a accesa date care nu sunt ale tale.',
        'Comportament abuziv față de alți utilizatori sau față de echipa noastră.',
      ],
    },
    {
      title: 'Suspendare și încetare',
      body: [
        'Un cont de firmă se suspendă automat când un document obligatoriu expiră. Nu este o sancțiune: contul rămâne accesibil, anunțurile ies de pe panou și se întorc singure după ce încarci documentul nou și acesta este aprobat.',
        'Un cont poate fi suspendat de noi pentru oricare dintre faptele din secțiunea anterioară. Îți spunem motivul și ai dreptul să răspunzi.',
        'Poți renunța la cont oricând, din pagina Date personale. Contul se oprește imediat, iar datele se șterg după perioada de grație afișată acolo. Ce suntem obligați prin lege să păstrăm rămâne, fără datele tale de contact.',
        'Putem închide platforma sau o parte din ea, anunțând cu cel puțin 30 de zile înainte. Abonamentele plătite și neconsumate se restituie proporțional.',
      ],
      link: { href: ROUTES.accountPersonalData, label: 'Date personale și ștergerea contului' },
    },
    {
      title: 'De ce răspundem și de ce nu',
      body: [
        'Răspundem pentru funcționarea platformei: ținem datele în siguranță, aplicăm regulile descrise aici și reparăm ce se strică.',
        'Nu răspundem pentru transportul în sine — întârzieri, avarii, pierderi, neplată, neprezentare. Acestea sunt între tine și cealaltă parte, iar dovada este contractul și scrisoarea de transport dintre voi.',
        'Nu răspundem pentru informațiile publicate de utilizatori. Verificăm documentele, nu verificăm fiecare anunț.',
        'Nu garantăm că platforma funcționează neîntrerupt. Facem întreruperi pentru mentenanță și anunțăm când putem.',
        'Unde răspunderea noastră poate fi limitată legal, ea este limitată la suma plătită de tine pentru abonament în ultimele 12 luni. Nimic din acești termeni nu limitează răspunderea pentru vătămare, dol sau culpă gravă, și nimic nu îngrădește drepturile pe care legea le dă consumatorilor.',
      ],
    },
    {
      title: 'Reclamații și neînțelegeri',
      body: [
        `Dacă ceva nu este în regulă, scrie-ne la ${operatorField('email')}. Răspundem în cel mult 30 de zile, de obicei mult mai repede.`,
        'Dacă reclamația este despre o altă firmă de pe platformă, spune-ne — folosim semnalările la verificare și la suspendare, chiar dacă nu putem rezolva noi contractul dintre voi.',
        'Dacă ești consumator, te poți adresa ANPC, inclusiv prin platforma europeană de soluționare online a litigiilor. Asta nu îți ia dreptul de a te adresa instanței.',
        'Încercăm întâi să rezolvăm direct. Dacă nu reușim, litigiile se judecă de instanțele competente de la sediul nostru, cu excepția cazurilor în care legea consumatorului prevede altfel.',
      ],
      link: { href: ROUTES.contact, label: 'Scrie-ne' },
    },
    {
      title: 'Legea aplicabilă și modificările',
      body: [
        'Se aplică legea română.',
        'Putem modifica acești termeni. Când o facem, versiunea se schimbă și ți-o arătăm la următoarea autentificare, ca să o accepți înainte de a continua. Versiunile anterioare rămân în istoricul nostru, iar noi păstrăm versiunea pe care ai acceptat-o și data.',
        'Dacă o prevedere din acest document se dovedește nevalabilă, restul rămâne în vigoare.',
      ],
    },
  ],
};
