import type { HelpSection } from '@/lib/help';

/**
 * Răspunsurile din cont.
 *
 * Scrise pentru cineva care are ecranul deschis și o întrebare, nu
 * pentru cineva care citește documentație. Deci: propoziții scurte,
 * răspunsul în primul rând, și explicația abia după.
 *
 * Regulile numerice — câte zile, câte contacte, ce documente — nu se
 * scriu aici. Se iau din setările pe care platforma chiar le aplică,
 * acolo unde ecranul le are la îndemână; un număr copiat într-un text
 * de ajutor este un număr greșit peste două luni.
 */
export const helpCopy = {
  meta: { title: 'Ajutor' },
  eyebrow: 'Ajutor',
  title: 'Cum funcționează',
  lede: 'Răspunsuri scurte la ce se întreabă cel mai des. Caută sau răsfoiește.',

  search: 'Caută în ajutor',
  searchAction: 'Caută',
  clear: 'Vezi tot',
  results: (n: number) =>
    n === 0 ? 'Niciun răspuns' : n === 1 ? 'Un răspuns' : `${n} răspunsuri`,

  empty: 'Nu am găsit nimic pentru ce ai căutat.',
  emptyBody: 'Încearcă alt cuvânt, sau scrie-ne — răspundem și adăugăm răspunsul aici.',

  support: {
    title: 'Nu ai găsit răspunsul?',
    lede: 'Scrie-ne. Răspundem în cel mult o zi lucrătoare.',
    email: 'E-mail',
    phone: 'Telefon',
    missing: 'De completat înainte de lansare',
    missingHint:
      'Datele de contact nu sunt încă trecute în configurare. Până atunci, folosește pagina de contact.',
    contactPage: 'Pagina de contact',
  },

  /** Ce scrie pe semnul de întrebare de pe fiecare ecran. */
  hint: 'Cum funcționează',
} as const;

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: 'publicare',
    title: 'Publicare',
    answers: [
      {
        id: 'cum-public-o-cerere',
        question: 'Cum public o cerere de transport?',
        audience: ['client', 'toti'],
        keywords: ['marfa', 'anunt', 'masina', 'vehicul'],
        answer: [
          'Din „Publică" → „Cerere de transport". Ai nevoie de localitatea de încărcare, cea de descărcare, perioada în care se poate încărca și datele vehiculului.',
          'Cererea ajunge pe panoul public, iar transportatorii care circulă pe ruta ta primesc o alertă. Primești oferte în cont.',
          'Poți retrage o cerere oricând, cât timp nu ai acceptat o ofertă.',
        ],
        link: { href: '/cerere/noua', label: 'Publică o cerere' },
      },
      {
        id: 'cum-public-o-plecare',
        question: 'Cum public o plecare?',
        audience: ['transportator'],
        keywords: ['traseu', 'tur', 'retur', 'bursa'],
        answer: [
          'Din „Trasee" → „Adaugă plecare". Alegi vehiculul, direcția (tur sau retur), de unde pleci, unde ajungi și în ce zile.',
          'Plecarea apare pe bursă numai dacă firma este verificată și vehiculul are ITP, RCA și copie conformă valabile. Dacă unul lipsește, îți spunem care.',
        ],
        link: { href: '/cont/trasee/nou', label: 'Adaugă o plecare' },
      },
      {
        id: 'cum-repet-o-plecare',
        question: 'Cum fac o plecare care se repetă?',
        audience: ['transportator'],
        keywords: ['serie', 'saptamanal', 'recurent', 'automat'],
        answer: [
          'În formularul de plecare bifează „Se repetă" și alege fie zilele din săptămână, fie la câte zile se repetă, plus data până la care ține.',
          'De acolo plecările se publică singure, cu două săptămâni înainte. Fiecare este o plecare obișnuită: o poți retrage separat, fără să oprești seria.',
          'Dacă vehiculului îi expiră un document, seria se oprește și primești un mesaj. După ce reînnoiești, o pornești la loc din aceeași listă.',
        ],
        link: { href: '/cont/trasee', label: 'Vezi seriile' },
      },
      {
        id: 'cum-public-returul',
        question: 'Cum public returul după o livrare?',
        audience: ['transportator'],
        keywords: ['gol', 'inapoi', 'comanda'],
        answer: [
          'Pe pagina comenzii, după ce ai programat livrarea, apare „Publică returul". Îți completează formularul cu ruta întoarsă, cu o dată după livrare și cu același vehicul.',
          'Verifici ce am completat și publici tu. Nu se publică nimic singur.',
        ],
      },
      {
        id: 'ce-este-o-cerere-privata',
        question: 'Ce este o cerere privată?',
        audience: ['client', 'toti'],
        keywords: ['invitatie', 'direct', 'ascuns', 'doar cativa'],
        answer: [
          'O cerere pe care o văd numai transportatorii aleși de tine. Nu apare pe panoul public, nu intră în numărătorile publice și nimeni altcineva nu primește alertă pentru ea.',
          'Îi inviți din lista de favoriți sau căutând firma. Doar ei pot trimite oferte.',
          'Dacă nu primești oferta pe care o vrei, apeși „Deschide pe bursă" și cererea devine publică. Invers nu se poate: odată publică, rămâne publică.',
        ],
      },
    ],
  },
  {
    id: 'oferte',
    title: 'Oferte și comenzi',
    answers: [
      {
        id: 'cum-functioneaza-ofertele',
        question: 'Cum funcționează ofertele?',
        audience: ['toti'],
        keywords: ['pret', 'negociere', 'accept'],
        answer: [
          'Un transportator trimite un preț, o dată estimată de ridicare și una de livrare, plus condițiile lui. Oferta are un termen de valabilitate.',
          'Poți cere lămuriri pe fiecare ofertă, fără să o accepți. Discuția rămâne legată de ofertă.',
          'Când accepți una, celelalte se resping automat și se face comanda.',
        ],
        link: { href: '/cont/oferte', label: 'Vezi ofertele' },
      },
      {
        id: 'ce-sunt-transportatorii-favoriti',
        question: 'Ce sunt transportatorii favoriți?',
        audience: ['client'],
        keywords: ['lista', 'preferati', 'cu care lucrez'],
        answer: [
          'Lista firmelor cu care lucrezi. O adaugi de pe profilul unei firme, de pe o ofertă primită sau de pe o comandă încheiată.',
          'Lista este a firmei, nu a ta personal: rămâne și după ce pleacă un coleg.',
          'O folosești ca să inviți pe cineva la o cerere privată dintr-un clic, și ca să filtrezi ofertele primite.',
          'Transportatorul nu află că este pe lista ta.',
        ],
      },
      {
        id: 'ce-se-intampla-dupa-acceptare',
        question: 'Ce se întâmplă după ce accept o ofertă?',
        audience: ['toti'],
        keywords: ['comanda', 'transport', 'ridicare'],
        answer: [
          'Se face comanda, iar datele de contact se schimbă între cele două părți. Din acel moment vă puteți suna.',
          'Comanda trece prin ridicare, transport și livrare. La fiecare pas primiți amândoi o notificare.',
          'Pe comandă se deschide singur un fir de mesaje, unde intră și șoferul repartizat.',
        ],
        link: { href: '/cont/transporturi', label: 'Vezi comenzile' },
      },
      {
        id: 'cum-se-face-dovada-livrarii',
        question: 'Cum se face dovada livrării?',
        audience: ['toti'],
        keywords: ['poze', 'semnatura', 'cod', 'cmr'],
        answer: [
          'La ridicare și la livrare se încarcă fotografii ale vehiculului și fișa de stare. La livrare, primitorul confirmă cu un cod de șase cifre sau cu semnătura.',
          'Dovezile nu se mai pot schimba după ce au fost încărcate. Asta este tot rostul lor.',
          'Dacă ceva nu este în regulă, deschizi o dispută din pagina comenzii și ne uităm noi.',
        ],
      },
      {
        id: 'cum-evaluez',
        question: 'Cum evaluez după un transport?',
        audience: ['toti'],
        keywords: ['nota', 'stele', 'reputatie', 'recenzie'],
        answer: [
          'După ce comanda este finalizată, ai la dispoziție paisprezece zile ca să dai o notă, sub-scoruri și câteva cuvinte.',
          'O poți corecta o singură dată, în primele 48 de ore. După aceea rămâne așa cum este — o notă care se poate rescrie oricând este o negociere.',
          'Firma evaluată poate răspunde public o dată. Media apare pe profil abia de la a treia evaluare.',
        ],
        link: { href: '/cont/evaluari', label: 'Vezi evaluările' },
      },
    ],
  },
  {
    id: 'documente',
    title: 'Documente și verificare',
    answers: [
      {
        id: 'ce-documente-imi-trebuie',
        question: 'Ce documente îmi trebuie?',
        audience: ['transportator'],
        keywords: ['licenta', 'itp', 'rca', 'copie conforma', 'asigurare'],
        answer: [
          'Pentru firmă: certificatul de înregistrare, licența de transport și asigurarea de răspundere. Pentru fiecare vehicul: ITP, RCA și copia conformă.',
          'Lista exactă, cu ce lipsește la tine, este pe pagina de documente. Ce este obligatoriu este marcat acolo.',
          'Le încarcă oricine din firmă; le verificăm noi, de obicei într-o zi lucrătoare.',
        ],
        link: { href: '/cont/firma/documente', label: 'Vezi documentele' },
      },
      {
        id: 'ce-se-intampla-la-expirare',
        question: 'Ce se întâmplă când expiră un document?',
        audience: ['transportator'],
        keywords: ['expirat', 'memento', 'reinnoire'],
        answer: [
          'Primești un memento înainte de expirare, apoi încă unul în ziua în care expiră.',
          'Un vehicul cu ITP, RCA sau copie conformă expirate iese de pe bursă până la reînnoire. Plecările lui se retrag automat și se întorc singure după ce încarci documentul nou și îl aprobăm.',
          'Dacă expiră un document al firmei, iese de pe bursă firma întreagă.',
        ],
      },
      {
        id: 'ce-inseamna-suspendare',
        question: 'Ce înseamnă că firma este suspendată?',
        audience: ['transportator'],
        keywords: ['blocat', 'oprit', 'sanctiune'],
        answer: [
          'Anunțurile tale ies de pe panouri și nu mai poți publica sau trimite oferte. Contul rămâne al tău și vezi tot ce ai în el.',
          'Motivul este scris în cont. Suspendarea se ridică după ce se rezolvă.',
          'Comenzile în curs nu se opresc: transportul tot trebuie făcut, iar mesajele de pe el rămân deschise.',
        ],
      },
    ],
  },
  {
    id: 'mesaje',
    title: 'Mesaje',
    answers: [
      {
        id: 'de-ce-nu-vad-numarul-de-telefon',
        question: 'De ce nu văd numărul de telefon din mesaj?',
        audience: ['toti'],
        keywords: ['mascat', 'ascuns', 'contact', 'email'],
        answer: [
          'Până la confirmarea unei comenzi, numerele de telefon și adresele de e-mail se ascund automat din mesaje.',
          'După ce există o comandă între voi, contactele se schimbă și mesajele noi le arată normal.',
          'Mesajele scrise înainte rămân așa cum au fost trimise. Nu le dezvăluim retroactiv.',
        ],
        link: { href: '/cont/mesaje', label: 'Deschide mesajele' },
      },
      {
        id: 'cine-citeste-mesajele',
        question: 'Cine citește mesajele mele?',
        audience: ['toti'],
        keywords: ['privat', 'confidential', 'echipa'],
        answer: [
          'Cele două părți, și atât. Noi nu deschidem conversații private.',
          'Două excepții: dacă cineva sesizează un mesaj din ea, sau dacă respectiva comandă a intrat în dispută. Altfel nu avem cum — nu este o politică internă, este o regulă în baza de date.',
        ],
        link: { href: '/confidentialitate', label: 'Politica de confidențialitate' },
      },
      {
        id: 'cat-ma-costa-un-mesaj',
        question: 'Mă costă ceva să scriu cuiva?',
        audience: ['transportator'],
        keywords: ['contact', 'abonament', 'cota'],
        answer: [
          'Deschiderea unei conversații de pe un anunț consumă un contact din abonament, exact ca „Vezi datele de contact".',
          'Se numără o singură dată pe anunț: dacă ai scris deja acolo, nu se mai numără.',
          'Firele de pe oferte și de pe comenzi sunt gratuite.',
        ],
      },
    ],
  },
  {
    id: 'sofer',
    title: 'Pentru șoferi',
    answers: [
      {
        id: 'ce-vad-ca-sofer',
        question: 'Ce văd eu, ca șofer?',
        audience: ['sofer'],
        keywords: ['transport', 'cursa', 'repartizat'],
        answer: [
          'Comenzile pe care te-a repartizat dispecerul, și atât. Nu vezi bursa, nu vezi ofertele și nu vezi celelalte comenzi ale firmei.',
          'Pe fiecare comandă ai ce trebuie făcut la ridicare și la livrare, și firul de mesaje cu cele două părți.',
        ],
        link: { href: '/cont/transporturi', label: 'Comenzile mele' },
      },
    ],
  },
];
