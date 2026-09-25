import { ROUTES } from '@/config/routes';
import { BRAND_NAME } from '@/config/brand';
import type { LegalDocument } from './document';

/**
 * Politica de cookie-uri, versiunea 1.1.
 *
 * Short because the truth is short: two cookies, both necessary, no
 * banner. The page exists anyway — somebody looking for it and not
 * finding it assumes the worst, and „we do not set any" is only
 * believable if it is written down somewhere.
 *
 * If an analytics or advertising cookie is ever added, this page changes
 * and a consent banner becomes mandatory. `tests/unit/legal.test.ts`
 * checks that the cookie named here is the one the application sets.
 *
 * What changed from 1.0, all of it to match what the software does:
 * - the company cookie is `app_company` (the brand name left every key
 *   the platform keeps in a browser) and lasts 30 days, as 1.0 said —
 *   the code had set 365 and now sets 30;
 * - the session cookie lasts until sign-out, at most 400 days, the
 *   default of the Supabase library, not „the session";
 * - the browser-storage list was two items and is now all of them, and
 *   no longer says none of it reaches us: a signed-in draft is also kept
 *   on the account.
 *
 * Keep this file when 1.2 arrives.
 */
export const COOKIES_1_1: LegalDocument = {
  slug: 'cookies',
  title: 'Cookie-uri',
  version: '1.1',
  effectiveFrom: '2026-09-25',
  lede: `Folosim două cookie-uri, ambele strict necesare. Nu avem publicitate, nu avem analytics și nu îți cerem acordul, pentru că nu avem ce să îți cerem.`,
  sections: [
    {
      title: 'Ce punem pe calculatorul tău',
      body: [
        'Un cookie strict necesar este unul fără de care serviciul pe care l-ai cerut nu funcționează. Pentru astea, legea nu cere consimțământ — cere să îți spunem că există, ceea ce facem aici.',
      ],
      list: [
        'Cookie-ul de sesiune (numele începe cu „sb-"): te ține autentificat între pagini. Fără el, fiecare clic te-ar trimite înapoi la formularul de autentificare. Rămâne până te deloghezi, cel mult 400 de zile, și se șterge la delogare.',
        'Cookie-ul „app_company": ține minte în numele cărei firme lucrezi, dacă ești în mai multe. Fără el ai alege firma la fiecare pagină. Durează 30 de zile.',
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
        'Câteva lucruri stau în memoria browserului tău, ca să nu pierzi ce ai scris sau ce ai ales. Nu sunt cookie-uri: nu pleacă spre noi odată cu fiecare pagină.',
      ],
      list: [
        'Ciorna unui formular lung — cererea, traseul, oferta, vehiculul, firma: trei zile în browser. Dacă ești autentificat, o copie stă și în contul tău, 30 de zile, ca să poți continua de pe alt dispozitiv. Se șterge când trimiți formularul.',
        'Textul scurt pe care nu l-ai trimis încă — un mesaj, o întrebare, o evaluare, un răspuns: trei zile, numai în browser.',
        'Pozele și documentele alese pentru încărcare, până când serverul confirmă că le-a primit. Dacă pagina se reîncarcă între timp, pleacă de acolo, nu le alegi din nou.',
        'Unde ai rămas pe panoul de cereri sau de trasee (filtrele, pagina) și dacă ai lăsat deschise „Mai multe filtre”. Dispar când închizi fila.',
        'Un identificator pentru următorul mesaj din fiecare conversație, ca o conexiune căzută să nu îl trimită de două ori. Nu conține nimic din mesaj.',
        'Faptul că ai închis nota despre notificări, ca să nu ți-o arătăm din nou. Rămâne până îți golești datele de navigare.',
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
