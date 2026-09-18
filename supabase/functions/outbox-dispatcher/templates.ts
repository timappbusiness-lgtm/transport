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
