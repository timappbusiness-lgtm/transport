/**
 * Romanian copy for the homepage. Components never contain hardcoded text.
 *
 * Rules that hold throughout: no invented numbers presented as real data,
 * every demonstration card labelled "Exemplu", every price labelled
 * orientativ. No exclamation marks, no superlatives, no social proof counts.
 */

export type CountryCode = 'RO' | 'DE' | 'IT' | 'NL' | 'ES' | 'FR' | 'BE' | 'AT' | 'HU';

export const homeCopy = {
  hero: {
    eyebrow: 'Transport auto · România și Europa',
    strong: 'Transport auto',
    soft: 'cu firme verificate.',
    subtitle:
      'Publici cererea gratuit și primești oferte doar de la transportatori cu documente valabile.',
    primary: 'Publică o cerere',
    secondary: 'Trasee disponibile',
    photoAlt: 'Platformă auto încărcată, pe un drum european',
  },

  panel: {
    eyebrow: 'Ce vezi despre un transportator',
    strong: 'Datele care contează,',
    soft: 'înainte să dai telefon.',
    lede:
      'Fiecare firmă are documentele urmărite zilnic. Cardurile de mai jos arată forma informației, cu date demonstrative.',
    documents: {
      title: 'Documentele firmei',
      subtitle: 'Autotrans Exemplu SRL · Timiș',
      rows: [
        { label: 'Licență comunitară', value: '21.10.2027', tone: 'success', state: 'valabil' },
        { label: 'Asigurare CMR', value: '03.04.2027', tone: 'success', state: 'valabil' },
        { label: 'ITP · TM 04 EXE', value: '11.06.2027', tone: 'success', state: 'valabil' },
        { label: 'RCA · TM 04 EXE', value: '28.09.2026', tone: 'warning', state: 'expiră curând' },
        { label: 'Copie conformă', value: '14.02.2026', tone: 'danger', state: 'expirat' },
      ],
    },
    seats: {
      title: 'Locuri pe platformă',
      subtitle: 'München → Cluj-Napoca · platformă deschisă',
      taken: 5,
      total: 8,
      caption: '3 locuri libere din 8',
      free: 'liber',
    },
    corridor: {
      title: 'Coridor și ocol acceptat',
      from: 'München',
      fromCc: 'DE' as CountryCode,
      to: 'Cluj-Napoca',
      toCc: 'RO' as CountryCode,
      waypoints: 'Viena · Budapesta · Oradea',
      detourLabel: 'Ocol acceptat',
      detour: '50 km',
      windowLabel: 'Plecare',
      window: '22.09 – 24.09',
    },
  },

  comparison: {
    eyebrow: 'Cum se schimbă',
    strong: 'Ce faci azi',
    soft: 'și ce faci cu Coridor.',
    oldTitle: 'Vechea metodă',
    newTitle: 'Cu Coridor',
    old: [
      'Grupuri de Facebook',
      'Zeci de telefoane',
      'Nicio verificare',
      'Acte expirate',
      'Retur gol',
    ],
    fresh: [
      'Publici o singură dată',
      'Oferte de la firme verificate',
      'Documente urmărite zilnic',
      'Comandă în platformă',
      'Retur plin',
    ],
    stepLabel: 'Pasul',
  },

  carriers: {
    eyebrow: 'Pentru transportatori',
    strong: 'Ai platformă?',
    soft: 'Nu te mai întoarce gol.',
    lede:
      'Publici traseele de tur și de retur, vezi cererile de pe traseul tău și completezi locurile libere înainte să pleci.',
    plan: {
      name: 'Plan transportator',
      price: '149 lei',
      period: 'pe lună',
      features: [
        'Publicare nelimitată pe tur și pe retur',
        'Acces la cererile compatibile cu traseele tale',
        'Alerte pe e-mail pentru cereri de pe traseele tale',
        'Evidența documentelor firmei și ale vehiculelor',
        'Notificare înainte să expire un document',
      ],
      cta: 'Înscrie-ți firma',
      note: 'Perioada gratuită începe după validarea firmei. Fără card la înscriere.',
    },
  },

  forwarders: {
    eyebrow: 'Pentru case de expediții',
    strong: 'Publici cursele o dată.',
    soft: 'Primești oferte doar de la firme cu acte valabile.',
    lede:
      'Cont de firmă pentru toată echipa, curse publice sau trimise doar transportatorilor tăi, și istoricul comenzilor într-un singur loc.',
    points: [
      'Un cont de firmă, mai mulți dispeceri',
      'Vezi documentele fiecărui ofertant',
      'Istoricul comenzilor rămâne în platformă',
    ],
    cta: 'Creează cont de firmă',
  },

  verification: {
    eyebrow: 'Verificare continuă',
    strong: 'Nu verificăm firmele o singură dată.',
    soft: 'Urmărim fiecare dată de expirare.',
    body:
      'Licența comunitară, asigurarea CMR, RCA-ul, ITP-ul și copiile conforme au fiecare o dată de expirare urmărită zilnic. Transportatorul primește notificări înainte să expire.',
    rules: [
      {
        title: 'Dacă expiră un document al firmei',
        body: 'Firma nu mai poate oferta până la revalidare.',
        tone: 'danger' as const,
      },
      {
        title: 'Dacă expiră RCA-ul sau ITP-ul unui vehicul',
        body: 'Doar acel vehicul dispare de pe bursă. Restul flotei rămâne activ.',
        tone: 'warning' as const,
      },
    ],
  },

  prices: {
    eyebrow: 'Tarife',
    strong: 'Un reper de preț,',
    soft: 'înainte să ceri oferte.',
    lede:
      'Tarife orientative pentru un autoturism standard. Oferta finală depinde de vehicul, locație, disponibilitate și termen.',
    tabs: [
      { key: 'standard', label: 'Transport standard' },
      { key: 'expres', label: 'Transport expres' },
    ],
    columns: {
      route: 'Rută',
      price: 'Preț orientativ',
      range: 'Interval',
      duration: 'Durată estimată',
    },
    onRequest: 'La cerere',
    // TODO: valori orientative, de validat cu partenerul de transport
    // înainte de lansare. Nu sunt calculate din transporturi încheiate.
    rows: [
      { country: 'Germania', cc: 'DE' as CountryCode, standard: '650 €', range: '590–780 €', days: '5–7 zile' },
      { country: 'Italia', cc: 'IT' as CountryCode, standard: '700 €', range: '640–860 €', days: '5–8 zile' },
      { country: 'Olanda', cc: 'NL' as CountryCode, standard: '700 €', range: '650–830 €', days: '6–8 zile' },
      { country: 'Belgia', cc: 'BE' as CountryCode, standard: '690 €', range: '620–810 €', days: '6–8 zile' },
      { country: 'Franța', cc: 'FR' as CountryCode, standard: '720 €', range: '660–880 €', days: '6–9 zile' },
      { country: 'Spania', cc: 'ES' as CountryCode, standard: '750 €', range: '690–940 €', days: '7–10 zile' },
      { country: 'Austria', cc: 'AT' as CountryCode, standard: '520 €', range: '470–610 €', days: '3–5 zile' },
    ],
    note:
      'Prețurile de mai sus sunt orientative, stabilite pe baza pieței. Pe măsură ce se încheie transporturi în platformă, vom afișa intervalele reale pentru fiecare rută.',
  },

  finalCta: {
    strong: 'Ai o mașină de mutat',
    soft: 'sau un loc liber pe platformă?',
    lede: 'Publică o cerere de transport sau anunță un traseu disponibil.',
    primary: 'Publică o cerere',
    secondary: 'Anunță un traseu',
  },
} as const;
