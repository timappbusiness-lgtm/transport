import type { Template } from "./render.ts";

// =====================================================================
// Ce scriem oamenilor
//
// Calm Romanian with its diacritics. No exclamation marks and no
// superlatives: every e-mail here is either an administrative fact or a
// deadline, and both read as more serious without decoration. A firm that
// has two weeks to renew its RCA does not need enthusiasm, it needs the
// date and the link.
//
// One action per e-mail. A message with three buttons is a message that
// gets none of them pressed.
//
// `unsubscribable` is false for suspension, reactivation and verification
// results. Somebody who cannot be told their account stopped working
// cannot fix it, and an unsubscribe link on that message is an invitation
// to make the problem permanent.
//
// The variables each one needs are asserted by a test against the
// producers in `supabase/migrations`, so a template can never quietly
// want something the queue does not put in the payload.
// =====================================================================

export const TEMPLATES: Record<string, Template> = {
  // --- Documente și conformitate ---------------------------------------
  document_expiry_reminder: {
    subject: "{{ document_label }} expiră în {{ days_left }} zile",
    lines: [
      "Bună ziua,",
      "Documentul {{ document_label }} al firmei {{ company_name }} este valabil până la {{ valid_until }}, adică încă {{ days_left }} zile.",
      "După data aceea, firma nu mai poate publica și anunțurile active ies de pe panou până când încărcați documentul nou. Reactivarea este automată: se face în câteva minute de la aprobare.",
    ],
    action: { label: "Încarcă documentul", href: "{{ site_url }}/cont/firma/documente" },
    unsubscribable: true,
  },

  document_rejected: {
    subject: "{{ document_label }} nu a putut fi aprobat",
    lines: [
      "Bună ziua,",
      "Documentul {{ document_label }} încărcat pentru {{ company_name }} nu a putut fi aprobat.",
      "Motivul: {{ reason }}",
      "Puteți încărca o versiune nouă oricând. Verificarea se reia de la sine.",
    ],
    action: { label: "Încarcă din nou", href: "{{ site_url }}/cont/firma/documente" },
    unsubscribable: false,
  },

  vehicle_suspended: {
    subject: "Vehiculul {{ plate_number }} a ieșit de pe panou",
    lines: [
      "Bună ziua,",
      "Vehiculul {{ plate_number }} nu mai apare în anunțuri, pentru că {{ document_label }} a expirat la {{ valid_until }}.",
      "Restul flotei nu este afectată. Vehiculul revine singur după ce încărcați documentul nou și acesta este aprobat.",
    ],
    action: { label: "Vezi vehiculul", href: "{{ site_url }}/cont/firma/flota" },
    unsubscribable: false,
  },

  // --- Contul firmei ----------------------------------------------------
  account_suspended: {
    subject: "Contul {{ company_name }} a fost suspendat",
    lines: [
      "Bună ziua,",
      "Contul firmei {{ company_name }} a fost suspendat pentru că un document obligatoriu a expirat: {{ reason }}",
      "Anunțurile active au ieșit de pe panou și se întorc automat, în starea în care erau, după ce documentul nou este aprobat — dacă datele lor sunt încă valabile.",
      "Vă puteți autentifica în continuare. Nu blocăm accesul nimănui care are ceva de reparat.",
    ],
    action: { label: "Vezi ce lipsește", href: "{{ site_url }}/cont/firma/documente" },
    unsubscribable: false,
  },

  account_reactivated: {
    subject: "Contul {{ company_name }} este activ din nou",
    lines: [
      "Bună ziua,",
      "Documentul a fost aprobat și contul firmei {{ company_name }} este activ.",
      "Anunțurile care erau pe panou înainte de suspendare s-au întors în starea lor anterioară. Cele ale căror date trecuseră între timp au rămas expirate — le puteți republica oricând.",
    ],
    action: { label: "Deschide contul", href: "{{ site_url }}/cont" },
    unsubscribable: false,
  },

  company_verified: {
    subject: "{{ company_name }} este verificată",
    lines: [
      "Bună ziua,",
      "Am verificat documentele firmei {{ company_name }}. Contul este activ și puteți publica, trimite oferte și vedea datele de contact.",
      "Perioada gratuită începe de astăzi.",
    ],
    action: { label: "Publică primul traseu", href: "{{ site_url }}/cont/trasee/nou" },
    unsubscribable: false,
  },

  company_rejected: {
    subject: "Verificarea firmei {{ company_name }} nu a trecut",
    lines: [
      "Bună ziua,",
      "Verificarea firmei {{ company_name }} nu a putut fi finalizată.",
      "Motivul: {{ reason }}",
      "Puteți corecta și trimite din nou. Nu există o limită de încercări.",
    ],
    action: { label: "Vezi documentele", href: "{{ site_url }}/cont/firma/documente" },
    unsubscribable: false,
  },

  // --- Echipă -----------------------------------------------------------
  company_invitation: {
    subject: "{{ invited_by }} vă invită în echipa {{ company_name }}",
    lines: [
      "Bună ziua,",
      "{{ invited_by }} v-a invitat să vă alăturați firmei {{ company_name }} pe Coridor, cu rolul {{ role }}.",
      "Invitația este valabilă șapte zile. Ca să o acceptați, aveți nevoie de un cont pe aceeași adresă de e-mail.",
    ],
    action: { label: "Vezi invitația", href: "{{ site_url }}/cont/invitatii" },
    unsubscribable: false,
  },

  // --- Potriviri pe trasee ---------------------------------------------
  request_match_alert: {
    subject: "Cerere nouă pe {{ from_city }} — {{ to_city }}",
    lines: [
      "Bună ziua,",
      "A apărut o cerere de transport pe o rută pe care o acoperiți: {{ from_city }} ({{ from_country }}) — {{ to_city }} ({{ to_country }}).",
      "Cererile se închid repede. Dacă vă interesează, deschideți-o cât este încă pe panou.",
    ],
    action: { label: "Vezi cererea", href: "{{ site_url }}/cereri/{{ request_id }}" },
    unsubscribable: true,
  },

  /**
   * Two days before a request comes off the board.
   *
   * Before, not after. A client who finds out on Monday that the request
   * expired on Friday has already decided nobody wanted the job.
   */
  listing_expiring_soon: {
    subject: "Cererea „{{ listing_title }}” iese de pe panou în {{ days_left }} zile",
    lines: [
      "Bună ziua,",
      "Cererea dumneavoastră „{{ listing_title }}” mai este vizibilă pe panou încă {{ days_left }} zile.",
      "Dacă transportul nu s-a rezolvat, o puteți prelungi dintr-un singur clic; dacă s-a rezolvat, o puteți închide ca să nu mai primiți telefoane.",
    ],
    action: { label: "Vezi cererea", href: "{{ site_url }}/cereri/{{ listing_id }}" },
    unsubscribable: true,
  },

  /**
   * One match, for somebody who asked to hear immediately.
   *
   * The reasons are the point. An alert that says „a apărut o cerere" and
   * nothing else is one a carrier learns to ignore; one that says which
   * route, which vehicle and how far off their own corridor it is, is one
   * they open.
   */
  saved_search_alert: {
    subject: "{{ search_name }}: {{ from_city }} — {{ to_city }}",
    lines: [
      "Bună ziua,",
      "A apărut o cerere care se potrivește cu căutarea „{{ search_name }}”: {{ title }}.",
      "De ce v-am trimis-o:",
      "· {{ reasons }}",
    ],
    action: { label: "Vezi cererea", href: "{{ site_url }}/cereri/{{ request_id }}" },
    unsubscribable: true,
  },

  /** The same thing, once a day, for somebody who asked for that instead. */
  saved_search_digest: {
    subject: "{{ search_name }}: {{ count }} cereri noi",
    lines: [
      "Bună ziua,",
      "Căutarea „{{ search_name }}” a găsit {{ count }} cereri de ieri până azi:",
      "{{ listings }}",
      "Le puteți deschide pe toate din panoul de cereri.",
    ],
    action: { label: "Vezi cererile", href: "{{ site_url }}/cereri" },
    unsubscribable: true,
  },

  /**
   * What happened to a report somebody sent.
   *
   * Neutral on purpose, and it carries the team's own sentence rather
   * than a status word: „rezolvată" with no explanation is the answer
   * that makes people stop reporting things.
   */
  report_closed: {
    subject: "Sesizarea dumneavoastră a fost {{ outcome }}",
    lines: [
      "Bună ziua,",
      "Am analizat sesizarea pe care ne-ați trimis-o. Iată ce am constatat și ce am decis:",
      "{{ resolution }}",
      "Dacă lucrurile arată altfel decât am înțeles noi, scrieți-ne și o redeschidem.",
    ],
    unsubscribable: false,
  },

  // --- Oferte -----------------------------------------------------------
  //
  // Six events, three to each side. The one that needs care is
  // `offer_received`: a request that attracts four offers in ten minutes
  // must produce one e-mail, not four. The grouping is not done here —
  // `queue_offer_notifications()` buckets the dedupe key by quarter hour
  // — so this template never says how many, only that there is something
  // to look at.
  offer_received: {
    subject: "Ofertă nouă pentru {{ title }}",
    lines: [
      "Bună ziua,",
      "Ați primit cel puțin o ofertă pentru cererea {{ title }} ({{ from_city }} — {{ to_city }}).",
      "Deschideți cererea ca să le vedeți pe toate, cu preț, date estimate și condiții, și ca să le comparați.",
    ],
    action: { label: "Vezi ofertele", href: "{{ site_url }}/cont/cereri/{{ request_id }}" },
    unsubscribable: true,
  },

  offer_withdrawn: {
    subject: "O ofertă pentru {{ title }} a fost retrasă",
    lines: [
      "Bună ziua,",
      "{{ carrier_name }} și-a retras oferta pentru cererea {{ title }}.",
      "Celelalte oferte rămân neschimbate.",
    ],
    action: { label: "Vezi cererea", href: "{{ site_url }}/cont/cereri/{{ request_id }}" },
    unsubscribable: true,
  },

  offer_accepted: {
    subject: "Oferta dumneavoastră a fost acceptată",
    lines: [
      "Bună ziua,",
      "Oferta trimisă pentru {{ title }} ({{ from_city }} — {{ to_city }}) a fost acceptată.",
      "Datele de contact ale clientului sunt acum vizibile în cont, fără să consume din abonament. Luați legătura cu el ca să stabiliți detaliile încărcării.",
    ],
    action: { label: "Vezi oferta", href: "{{ site_url }}/cont/oferte?oferta={{ offer_id }}" },
    unsubscribable: false,
  },

  offer_rejected: {
    subject: "Oferta pentru {{ title }} nu a fost aleasă",
    lines: [
      "Bună ziua,",
      "Clientul a ales altă ofertă pentru {{ title }} ({{ from_city }} — {{ to_city }}).",
      "Nu înseamnă nimic despre firma dumneavoastră — de cele mai multe ori este vorba de preț sau de dată.",
    ],
    action: { label: "Vezi alte cereri", href: "{{ site_url }}/cereri" },
    unsubscribable: true,
  },

  offer_expired: {
    subject: "Oferta pentru {{ title }} a expirat",
    lines: [
      "Bună ziua,",
      "Oferta trimisă pentru {{ title }} ({{ from_city }} — {{ to_city }}) a trecut de termenul de valabilitate și nu mai poate fi acceptată.",
      "Dacă tot puteți face transportul, trimiteți una nouă: cererea este încă pe panou.",
    ],
    action: { label: "Vezi cererea", href: "{{ site_url }}/cereri" },
    unsubscribable: true,
  },

  offer_question: {
    subject: "Mesaj nou despre oferta pentru {{ title }}",
    lines: [
      "Bună ziua,",
      "Aveți un mesaj nou în discuția despre oferta pentru {{ title }}.",
      "Până la confirmarea comenzii, numerele de telefon și adresele de e-mail sunt ascunse automat în mesaje. După ce comanda este confirmată, vă vedeți datele de contact în cont.",
    ],
    action: { label: "Vezi discuția", href: "{{ site_url }}/cont/oferte?oferta={{ offer_id }}" },
    unsubscribable: true,
  },

  // --- Rezervări --------------------------------------------------------
  reservation_created: {
    subject: "Rezervare nouă pe traseul {{ from_city }} — {{ to_city }}",
    lines: [
      "Bună ziua,",
      "Cineva a rezervat un loc pe traseul {{ from_city }} — {{ to_city }} din {{ departure_date }}.",
      "Rezervarea se eliberează singură după 24 de ore sau la sfârșitul zilei de plecare, care vine prima. Până atunci locul este ținut pentru ei.",
    ],
    action: { label: "Confirmă sau refuză", href: "{{ site_url }}/cont/trasee" },
    unsubscribable: true,
  },

  reservation_confirmed: {
    subject: "Rezervarea pe {{ from_city }} — {{ to_city }} este confirmată",
    lines: [
      "Bună ziua,",
      "Transportatorul a confirmat rezervarea pentru traseul {{ from_city }} — {{ to_city }} din {{ departure_date }}.",
      "Comanda este deschisă. Datele de contact sunt disponibile în contul dumneavoastră.",
    ],
    action: { label: "Vezi comanda", href: "{{ site_url }}/cont" },
    unsubscribable: false,
  },

  reservation_rejected: {
    subject: "Rezervarea pe {{ from_city }} — {{ to_city }} nu a fost confirmată",
    lines: [
      "Bună ziua,",
      "Transportatorul nu a putut confirma rezervarea pentru {{ from_city }} — {{ to_city }} din {{ departure_date }}.",
      "Locul s-a eliberat. Pe panou sunt și alte trasee pe ruta aceasta.",
    ],
    action: { label: "Vezi traseele", href: "{{ site_url }}/trasee" },
    unsubscribable: true,
  },

  reservation_expired: {
    subject: "Rezervarea pe {{ from_city }} — {{ to_city }} a expirat",
    lines: [
      "Bună ziua,",
      "Rezervarea pentru traseul {{ from_city }} — {{ to_city }} nu a fost confirmată la timp și s-a eliberat.",
      "Puteți rezerva din nou, dacă locul este încă liber.",
    ],
    action: { label: "Vezi traseul", href: "{{ site_url }}/trasee" },
    unsubscribable: true,
  },

  // --- Abonament --------------------------------------------------------
  subscription_request_received: {
    subject: "Am primit cererea de abonament {{ plan }}",
    lines: [
      "Bună ziua,",
      "Am primit cererea de abonament {{ plan }} pentru {{ company_name }}.",
      "În perioada de lansare emitem factură și plata se face prin transfer bancar. Vă contactăm în cel mult o zi lucrătoare. Nu se ia niciun ban acum.",
    ],
    action: { label: "Vezi abonamentul", href: "{{ site_url }}/cont/abonament" },
    unsubscribable: false,
  },

  subscription_activated: {
    subject: "Abonamentul {{ plan }} este activ",
    lines: [
      "Bună ziua,",
      "Abonamentul {{ plan }} pentru {{ company_name }} este activ până la {{ period_end }}.",
      "Vă trimitem un mesaj înainte de expirare.",
    ],
    action: { label: "Vezi abonamentul", href: "{{ site_url }}/cont/abonament" },
    unsubscribable: false,
  },

  // --- Ștergerea contului -----------------------------------------------
  //
  // None of these can be switched off. An e-mail saying an account is a
  // fortnight from deletion is the one message where an unsubscribe link
  // would be actively harmful, and the cancel link inside it is the only
  // thing that stops the clock.
  account_deletion_scheduled: {
    subject: "Ștergerea {{ what }} a fost programată pentru {{ scheduled_for }}",
    lines: [
      "Bună ziua,",
      "Am primit cererea de ștergere a {{ what }} și am programat-o pentru {{ scheduled_for }}.",
      "Până atunci contul este oprit: anunțurile au ieșit de pe panou și nu se poate publica nimic nou. Dacă v-ați răzgândit, butonul de mai jos oprește ștergerea și pune totul la loc.",
      "După acea dată ștergem datele personale. Rămâne doar ce suntem obligați să păstrăm — transporturile încheiate, documentele contabile și jurnalul deciziilor — fără numele și datele dumneavoastră de contact.",
    ],
    action: {
      label: "Anulează ștergerea",
      href: "{{ site_url }}/stergere/anuleaza?t={{ cancel_token }}",
    },
    unsubscribable: false,
  },

  account_deletion_blocked: {
    subject: "Ștergerea {{ what }} nu poate începe încă",
    lines: [
      "Bună ziua,",
      "Am primit cererea de ștergere a {{ what }}, dar nu o putem porni acum.",
      "{{ reason }}",
      "După ce se rezolvă, cereți ștergerea din nou din pagina Date personale. Până atunci nu am schimbat nimic la cont.",
    ],
    action: {
      label: "Vezi datele personale",
      href: "{{ site_url }}/cont/setari/date-personale",
    },
    unsubscribable: false,
  },

  account_deletion_cancelled: {
    subject: "Ștergerea {{ what }} a fost anulată",
    lines: [
      "Bună ziua,",
      "Ștergerea {{ what }} a fost anulată. Contul funcționează ca înainte.",
      "Anunțurile care erau pe panou s-au întors în starea lor anterioară. Cele ale căror date trecuseră între timp au rămas expirate — le puteți republica oricând.",
    ],
    action: { label: "Deschide contul", href: "{{ site_url }}/cont" },
    unsubscribable: false,
  },

  account_deletion_completed: {
    subject: "Datele dumneavoastră au fost șterse",
    lines: [
      "Bună ziua,",
      "Am șters contul și datele personale legate de el. Nu mai există o autentificare pe această adresă.",
      "Am păstrat doar ce suntem obligați să păstrăm: transporturile încheiate, documentele contabile și jurnalul deciziilor, fără numele și datele dumneavoastră de contact.",
      "Acesta este ultimul mesaj pe care vi-l trimitem.",
    ],
    unsubscribable: false,
  },
};

/**
 * Templates that exist here but have no producer in the migrations yet.
 *
 * Kept honest on purpose: a test lists what the database actually queues
 * and compares it with this file, so the gap is a number somebody can see
 * rather than an assumption. Writing the copy now costs nothing and means
 * the day a producer lands it is not blocked on wording.
 */
export const WITHOUT_PRODUCER = [
  "document_rejected",
  "vehicle_suspended",
  "reservation_created",
  "reservation_confirmed",
  "reservation_rejected",
  "reservation_expired",
] as const;
