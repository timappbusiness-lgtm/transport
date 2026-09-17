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
