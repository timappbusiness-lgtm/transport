import { ROUTES } from '@/config/routes';
import { BRAND_NAME } from '@/config/brand';
import type { LegalDocument } from './document';

/**
 * Politica de cookie-uri, versiunea 1.0.
 *
 * Short because the truth is short: two cookies, both necessary, no
 * banner. The page exists anyway — somebody looking for it and not
 * finding it assumes the worst, and „we do not set any" is only
 * believable if it is written down somewhere.
 *
 * If an analytics or advertising cookie is ever added, this page changes
 * and a consent banner becomes mandatory. The unit test next to it
 * asserts that the list here matches what the application actually sets.
 */
export const COOKIES_1_0: LegalDocument = {
  slug: 'cookies',
  title: 'Cookie-uri',
  version: '1.0',
  effectiveFrom: '2026-09-18',
  lede: `Folosim două cookie-uri, ambele strict necesare. Nu avem publicitate, nu avem analytics și nu îți cerem acordul, pentru că nu avem ce să îți cerem.`,
  sections: [
    {
      title: 'Ce punem pe calculatorul tău',
      body: [
        'Un cookie strict necesar este unul fără de care serviciul pe care l-ai cerut nu funcționează. Pentru astea, legea nu cere consimțământ — cere să îți spunem că există, ceea ce facem aici.',
      ],
      list: [
        'Cookie-ul de sesiune (numele începe cu „sb-"): te ține autentificat între pagini. Fără el, fiecare clic te-ar trimite înapoi la formularul de autentificare. Durează cât sesiunea și se șterge la delogare.',
        'Cookie-ul „coridor_company": ține minte în numele cărei firme lucrezi, dacă ești în mai multe. Fără el ai alege firma la fiecare pagină. Durează 30 de zile.',
      ],
    },
    {
      title: 'Ce nu punem',
      body: [
        'Niciun cookie de publicitate. Niciun cookie de la o rețea socială. Niciun instrument de analiză care te urmărește între site-uri. Niciun pixel de remarketing.',
        `Nu avem Google Analytics și niciun echivalent. Nu știm câți oameni au vizitat ${BRAND_NAME} ieri, iar asta este o alegere, nu o scăpare.`,
      ],
    },
    {
      title: 'De ce nu vezi o fereastră de acord',
      body: [
        'Fereastra aceea există ca să îți ceară acordul pentru cookie-urile care nu sunt necesare. Noi nu avem niciunul, deci nu am avea ce să îți cerem, iar o fereastră care îți cere acordul pentru nimic este doar un clic în plus.',
        'Dacă vom adăuga vreodată un instrument care are nevoie de acordul tău, vei vedea fereastra înainte ca el să pornească, iar pagina asta se va schimba odată cu ea.',
      ],
    },
    {
      title: 'Ce mai ținem în browser, fără cookie-uri',
      body: [
        'Două lucruri stau în memoria browserului tău și nu ajung niciodată la noi.',
      ],
      list: [
        'Ciorna cererii pe care o completezi, ca să nu o pierzi dacă treci prin înregistrare. Dispare când închizi fila.',
        'Faptul că ai închis un anunț din cont, ca să nu ți-l arătăm din nou. Rămâne până îți golești datele de navigare.',
      ],
    },
    {
      title: 'Cum le controlezi',
      body: [
        'Orice browser îți permite să vezi, să blochezi și să ștergi cookie-urile, din setările de confidențialitate. Căutăm-le după numele site-ului nostru.',
        'Dacă blochezi cookie-urile noastre, paginile publice funcționează în continuare, dar nu te vei putea autentifica: fără cookie-ul de sesiune nu avem cum să te ținem minte de la o pagină la alta.',
      ],
      link: { href: ROUTES.privacy, label: 'Politica de confidențialitate' },
    },
  ],
};
