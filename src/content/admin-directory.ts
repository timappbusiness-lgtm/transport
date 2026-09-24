/**
 * Romanian copy for the three staff screens behind the public directory.
 *
 * Everything these screens change is written through a SECURITY DEFINER RPC
 * that checks staff membership and writes an audit row, so the copy talks
 * about consequences rather than about forms: a threshold hides a section
 * from every visitor, a price change is what a carrier reads on the
 * homepage, and hiding a profile is a moderation decision with a reason
 * attached to it.
 */

export const adminDirectoryCopy = {
  settings: {
    title: 'Setări pentru lista de firme',
    lede:
      'Sub aceste praguri, secțiunile de pe prima pagină nu se afișează deloc. Un număr mic spus cu voce tare este mai rău decât niciun număr.',
    state: {
      title: 'Ce se vede acum',
      verified: 'Firme verificate',
      listed: 'Firme în lista publică',
      vehicles: 'Vehicule cu acte în termen',
      bandShown: 'Banda cu cifre se afișează',
      bandHidden: 'Banda cu cifre este ascunsă',
      gridShown: 'Lista de firme de pe prima pagină se afișează',
      gridHidden: 'Lista de firme de pe prima pagină este ascunsă',
      unavailable: 'Nu am putut citi cifrele din baza de date.',
      cached: 'Prima pagină citește aceste cifre printr-o memorie de cinci minute. Salvarea o golește imediat.',
    },
    statsMin: 'Prag pentru banda cu cifre',
    statsMinHint: 'Câte firme verificate sunt necesare ca să afișăm cifrele.',
    directoryMin: 'Prag pentru lista de pe prima pagină',
    directoryMinHint: 'Câte firme în listă sunt necesare ca să afișăm grila.',
    trialDays: 'Perioada gratuită, în zile',
    trialDaysHint: 'Începe când firma este aprobată. 0 ascunde promisiunea peste tot.',
    save: 'Salvează',
    saved: 'Setările au fost salvate.',
    invalidStats: 'Pragul trebuie să fie un număr întreg între 1 și 100000.',
    invalidDirectory: 'Pragul trebuie să fie un număr întreg între 1 și 100000.',
    invalidTrial: 'Perioada trebuie să fie un număr întreg între 0 și 365 de zile.',
    noAccess: 'Nu ai acces la această acțiune.',
  },

  plans: {
    title: 'Planuri',
    lede:
      'Prețul de aici este cel pe care îl citește prima pagină și răspunsul din întrebări frecvente. Orice modificare trece prin audit_log.',
    columns: {
      plan: 'Plan',
      price: 'Preț pe lună, lei',
      visible: 'Vizibil public',
      features: 'Ce scrie pe card',
    },
    featuresHint: 'Câte o linie pentru fiecare. Sunt doar text: limitele reale sunt cele din baza de date.',
    save: 'Salvează planul',
    saved: 'Planul a fost salvat.',
    invalidPrice: 'Prețul trebuie să fie un număr pozitiv.',
    noAccess: 'Nu ai acces la această acțiune.',
    empty: 'Nu există planuri de afișat.',
    audience: 'Pentru cine',
    audienceNone: 'Nu apare pe pagina de abonamente',
    audienceCarrier: 'Transportatori',
    audienceForwarder: 'Case de expediții',
    name: 'Nume',
    shortDescription: 'Descriere scurtă',
    highlight: 'Recomandat pentru această categorie',
    highlightHint: 'Un singur plan poate fi recomandat per categorie. Dacă bifezi altul, cel vechi iese.',
    featuresHelp:
      'Câte o linie: cheie | text | stare. Starea poate fi inclus, neinclus sau curand. Fără stare, linia este inclusă.',
    periods: 'Perioade de facturare',
    periodsHint:
      'Totalul pe perioadă, în lei. Economia și „2 luni gratuite” se calculează din acest total și prețul lunar — nu se scrie nicăieri un procent.',
    periodMonths: (months: number) => `Total pe ${months} ${months === 1 ? 'lună' : 'luni'}`,
    periodPublic: 'Vizibil public',
    savePeriod: 'Salvează perioada',
    periodSaved: 'Perioada a fost salvată.',
    invalidPeriod: 'Totalul trebuie să fie un număr pozitiv.',
    preview: 'Vezi pagina publică',
    history: 'Ultimele modificări',
    historyEmpty: 'Nicio modificare înregistrată încă.',
  },

  /** What /abonamente says about the trial, VAT and how billing works. */
  pricing: {
    title: 'Setări de facturare',
    lede:
      'Ce scrie pagina de abonamente despre perioada gratuită, TVA și modul de plată. Perioada gratuită este și cea care pornește la aprobarea firmei.',
    trialDays: 'Perioada gratuită, în zile',
    trialDaysHint: 'Pornește când firma este aprobată. 0 o ascunde peste tot și nu mai pornește nimic.',
    vatLabel: 'Mențiune despre TVA',
    vatLabelHint: 'Apare sub fiecare preț. Lasă gol dacă nu vrei să scrie nimic despre TVA.',
    manualBilling: 'Facturare manuală (transfer bancar)',
    manualBillingHint: 'Debifează când plata cu cardul este disponibilă.',
    billingEmail: 'E-mail pentru cererile de abonament',
    billingEmailHint: 'Aici primim notificarea când o firmă cere un plan.',
    save: 'Salvează setările',
    saved: 'Setările de facturare au fost salvate.',
    invalidTrial: 'Perioada trebuie să fie un număr întreg între 0 și 365 de zile.',
    noAccess: 'Nu ai acces la această acțiune.',
  },

  /** The request queue: a company asked for a plan, and we invoice it. */
  requests: {
    title: 'Cereri de abonament',
    lede:
      'Firmele cer un plan de aici; noi emitem factura și activăm. Nimic nu se încasează din platformă.',
    empty: 'Nicio cerere deschisă.',
    columns: {
      company: 'Firmă',
      plan: 'Plan',
      period: 'Perioadă',
      requested: 'Cerut',
      status: 'Stare',
    },
    status: {
      new: 'Nouă',
      contacted: 'Contactat',
      activated: 'Activat',
      rejected: 'Respins',
    },
    contact: 'Marchează drept contactat',
    contacted: 'Cererea a fost marcată.',
    activate: 'Activează abonamentul',
    activated: 'Abonamentul a fost activat.',
    reject: 'Respinge',
    rejected: 'Cererea a fost respinsă.',
    reason: 'Motiv',
    reasonPlaceholder: 'De ce nu activăm',
    reasonRequired: 'Scrie motivul: rămâne în audit_log.',
    noAccess: 'Nu ai acces la această acțiune.',
    notes: 'Mențiuni de la firmă',
  },

  companies: {
    title: 'Firme în lista publică',
    lede:
      'Poți scoate o firmă din lista publică, cu motiv. Nu îi schimbă verificarea și nu o suspendă: profilul dispare, contul rămâne cum era.',
    columns: {
      company: 'Firmă',
      city: 'Localitate',
      vehicles: 'Vehicule în termen',
      action: 'Acțiune',
    },
    reason: 'Motiv',
    reasonPlaceholder: 'De ce scoatem profilul din listă',
    hide: 'Scoate din listă',
    hidden: 'Profilul a fost scos din listă.',
    reasonRequired: 'Scrie motivul: rămâne în audit_log.',
    view: 'Vezi profilul',
    empty: 'Nicio firmă nu este în lista publică acum.',
    noAccess: 'Nu ai acces la această acțiune.',
  },
} as const;
