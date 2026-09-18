/**
 * „Date personale" — the screen where somebody takes their data back or
 * asks us to stop holding it.
 *
 * Written plainly on purpose. Every sentence here is either a fact about
 * what happens or a date, and both read as more trustworthy without
 * decoration. Nothing is softened: „ștergem" rather than „închidem",
 * because a person who thinks they closed an account and discover they
 * deleted it has been misled by our vocabulary.
 */
export const personalDataCopy = {
  title: 'Date personale',
  lede:
    'Ce avem despre tine, cum îți iei o copie și cum ceri ștergerea. Toate se întâmplă din pagina asta.',

  export: {
    title: 'Descarcă datele mele',
    body:
      'Îți pregătim o arhivă cu tot ce avem despre tine: profilul, cererile, traseele, ofertele, mesajele și notificările trimise. Un fișier JSON și, pentru liste, câte un CSV.',
    note: 'Linkul este valabil 24 de ore și funcționează o singură dată. Poți cere o arhivă nouă o dată pe zi.',
    button: 'Pregătește arhiva',
    pending: 'Se pregătește…',
    ready: 'Arhiva este gata.',
    download: 'Descarcă arhiva',
    expired: 'Linkul a expirat sau a fost deja folosit. Cere o arhivă nouă.',
    noFiles:
      'Fișierele pe care le-ai încărcat (documente, poze) nu sunt în arhivă. Le găsești în cont, în paginile din care le-ai încărcat.',
  },

  deletion: {
    title: 'Șterge contul',
    companyTitle: 'Șterge firma',
    body: (days: number) =>
      `Îți oprim contul imediat și ștergem datele după ${days} zile. În tot acest timp poți anula, dintr-un link pe care ți-l trimitem pe e-mail.`,
    companyBody: (days: number) =>
      `Oprim firma imediat și îi ștergem datele după ${days} zile. Anunțurile ies de pe panou acum. Poți anula oricând în acest interval.`,
    whatGoes: 'Ce ștergem',
    whatGoesList: [
      'Profilul, numele, telefonul și adresa de e-mail.',
      'Cererile, traseele, ofertele și mesajele.',
      'Documentele încărcate și fișierele din spatele lor.',
      'Preferințele de notificare și dispozitivele pe care primeai notificări.',
    ],
    whatStays: 'Ce rămâne, și de ce',
    whatStaysList: [
      'Transporturile încheiate și documentele contabile, fără numele și datele tale de contact. Legea ne obligă să le păstrăm.',
      'Jurnalul deciziilor platformei (verificări, suspendări), tot fără datele tale de contact.',
      'Firmele care au avut transporturi rămân ca o înregistrare fără identitate, ca să nu rămână transporturi fără una dintre părți.',
    ],
    blockedTitle: 'Nu putem șterge încă',
    blockedHelp:
      'Rezolvă ce scrie mai sus și cere din nou. Nu am schimbat nimic la cont între timp.',
    scheduledTitle: 'Ștergere programată',
    scheduledOn: (date: string) => `Ștergem datele pe ${date}.`,
    held:
      'Contul este oprit până atunci: anunțurile au ieșit de pe panou și nu poți publica nimic nou.',
    cancel: 'Anulează ștergerea',
    cancelled: 'Ștergerea a fost anulată. Contul funcționează ca înainte.',

    confirmTitle: 'Confirmă ștergerea',
    confirmUser: (email: string) => `Scrie adresa ta de e-mail, ${email}, ca să confirmi.`,
    confirmCompany: (name: string) => `Scrie denumirea firmei, ${name}, ca să confirmi.`,
    confirmLabel: 'Confirmare',
    confirmMismatch: 'Textul nu se potrivește. Ștergerea nu a pornit.',
    start: 'Cere ștergerea',
    back: 'Renunță',
    ownerOnly: 'Doar proprietarul firmei poate cere ștergerea ei.',
  },

  cancelPage: {
    title: 'Ștergerea contului',
    ok: 'Am anulat ștergerea. Contul funcționează ca înainte și te poți autentifica din nou.',
    gone:
      'Linkul nu mai este valabil. Fie ștergerea a fost deja anulată, fie s-a încheiat. Dacă nu tu ai cerut-o, scrie-ne.',
    signIn: 'Intră în cont',
    home: 'Mergi la pagina principală',
  },

  admin: {
    title: 'Ștergeri de cont',
    lede:
      'Cererile de ștergere, starea lor și ce le blochează. Anonimizarea din partea echipei are nevoie de un motiv și se trece în jurnal.',
    empty: 'Nicio cerere de ștergere.',
    statuses: {
      requested: 'primită',
      blocked: 'blocată',
      scheduled: 'programată',
      completed: 'finalizată',
      cancelled: 'anulată',
    } as Record<string, string>,
    kinds: { user: 'cont', company: 'firmă' } as Record<string, string>,
    anonymiseTitle: 'Anonimizează un cont',
    anonymiseBody:
      'Pornește imediat, fără perioadă de grație. Se aplică aceleași reguli: un cont cu transporturi nefinalizate rămâne blocat.',
    userId: 'ID utilizator',
    reason: 'Motiv',
    reasonHint: 'Se trece în jurnal și rămâne acolo. Scrie de ce, nu ce.',
    anonymise: 'Anonimizează',
    cancel: 'Anulează ștergerea',
    jobWarning:
      'Jobul de ștergere nu a rulat de peste 36 de ore. Cererile programate nu se duc la capăt până nu rulează.',

    settings: {
      title: 'Ștergere și retenție',
      lede:
        'Trei numere care se aplică tuturor. Se scriu printr-un apel auditat, deci fiecare schimbare rămâne în jurnal cu cine și când.',
      graceDays: 'Zile de grație',
      graceDaysHint:
        'Cât timp poate fi anulată o ștergere. Contul este oprit în tot acest interval.',
      supportEmail: 'E-mail de suport',
      supportEmailHint:
        'Apare în pagina Date personale. Lăsat gol, pagina nu afișează nicio adresă în loc să afișeze una care nu există.',
      contactRevealMonths: 'Luni de păstrare a jurnalului de contacte',
      contactRevealMonthsHint:
        'Politica noastră spune 24 de luni. Jobul nocturn șterge ce este mai vechi.',
      save: 'Salvează',
      saved: 'Setările au fost salvate.',
      noAccess: 'Doar echipa platformei poate schimba aceste setări.',
      invalidGrace: 'Perioada de grație este între 0 și 90 de zile.',
      invalidMonths: 'Perioada de retenție este între 1 și 120 de luni.',
      invalidEmail: 'Adresa de e-mail nu pare validă.',
    },
  },
} as const;
