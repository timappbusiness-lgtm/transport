/**
 * „Înscriere asistată" — cuvintele pentru cele trei ecrane.
 *
 * Două publicuri foarte diferite. `admin` vorbește cu cineva din echipă,
 * care face asta de zece ori pe săptămână și are nevoie de scurtime.
 * `claim` vorbește cu un transportator care deschide un link primit pe
 * WhatsApp și care, pe bună dreptate, este suspicios: primește un cont
 * pe care nu l-a făcut el. Fiecare propoziție de acolo răspunde la
 * „stai, ce e asta?".
 */

import { BRAND_NAME } from '@/config/brand';

export const onboardingCopy = {
  admin: {
    meta: { title: 'Înscrieri asistate' },
    eyebrow: 'Administrare',
    title: 'Înscrieri asistate',
    lede: 'Conturile pregătite de noi pentru firme care au fost de acord. Fiecare se termină cu un link pe care îl deschide firma, nu noi.',
    add: 'Înscriere nouă',

    filters: {
      title: 'Stare',
      all: 'Toate',
    },

    empty: 'Nicio înscriere asistată.',
    emptyBody: 'Începe una când vorbești cu un transportator care vrea cont, dar nu are timp să îl facă.',
    emptyFiltered: 'Nicio înscriere în starea asta.',
    emptyFilteredBody: 'Schimbă filtrul de mai sus.',

    columns: {
      company: 'Firmă',
      contact: 'Persoană de contact',
      staff: 'Cine se ocupă',
      status: 'Stare',
      progress: 'Pași',
      link: 'Link',
    },

    open: 'Continuă',
    view: 'Vezi firma',
    noCompany: 'Fără firmă încă',
    steps: (done: number, total: number) => `${done} din ${total}`,
    chase: 'De sunat',
    chaseHint: (days: number) =>
      `Linkul a plecat acum ${days} de zile și nu l-a deschis nimeni. Un telefon rezolvă mai repede decât încă un e-mail.`,
    purgeIn: (days: number) =>
      days === 0
        ? 'Se șterge la următoarea curățenie de noapte.'
        : `Se șterge automat peste ${days} de zile.`,
    soloReviews: (n: number) =>
      n === 1
        ? 'Un document verificat de cine l-a și încărcat.'
        : `${n} documente verificate de cine le-a și încărcat.`,
  },

  wizard: {
    meta: { title: 'Înscriere asistată' },
    title: 'Înscriere asistată',
    lede: 'Aceiași pași pe care i-ar face firma singură. Fiecare se salvează când îl termini, deci poți închide pagina și relua.',
    back: 'Înapoi la înscrieri',

    /** Pasul zero, care nu este un pas: acordul. */
    consent: {
      title: 'Acordul firmei',
      lede: 'Nu creăm nimic pentru o firmă care nu a cerut. Bifa de mai jos se salvează cu data și cu felul în care ai vorbit, și rămâne în jurnal.',
      name: 'Numele persoanei cu care ai vorbit',
      nameHint: 'Persoana care va fi proprietarul contului, nu firma.',
      email: 'E-mailul ei',
      emailHint: 'Aici pleacă linkul, și tot cu adresa asta se va înregistra. Verific-o de două ori.',
      phone: 'Telefonul ei',
      channel: 'Cum ai obținut acordul',
      date: 'Când',
      note: 'Notă (opțional)',
      noteHint: 'Ce ai spus și ce a răspuns. Pentru cine citește peste șase luni.',
      confirm: 'Firma a fost de acord să îi pregătim contul, iar persoana de mai sus știe că va primi un link.',
      submit: 'Începe înscrierea',
    },

    company: {
      title: 'Date firmă',
      lede: 'Caută CUI-ul la ANAF, ca la înscrierea obișnuită. Ce nu găsește, completezi de mână.',
      cui: 'CUI',
      lookup: 'Caută la ANAF',
      legalName: 'Denumire',
      type: 'Ce face firma',
      county: 'Județ',
      city: 'Oraș',
      contactEmail: 'E-mail de contact al firmei',
      contactPhone: 'Telefon de contact al firmei',
      contactHint: 'Dacă le lași goale, punem datele persoanei de contact.',
      submit: 'Salvează firma',
      done: 'Firma a fost creată. Nimeni nu o deține încă — proprietarul apare la revendicare.',
    },

    documents: {
      title: 'Documente',
      lede: 'Le încarci tu, în numele firmei. Fiecare document poartă asta pe el și intră în verificarea obișnuită.',
      fourEyes: 'Documentele încărcate de tine le verifică altcineva din echipă. Dacă ești singurul, o poți face tu, dar îți cere o notă.',
      upload: 'Încarcă document',
      kind: 'Ce document este',
      empty: 'Niciun document încărcat încă.',
      onBehalf: 'Adăugat de echipă în numele firmei',
      skip: 'Continuă fără documente',
      skipHint: 'Le poate încărca firma după ce preia contul.',
    },

    vehicles: {
      title: 'Vehicule',
      lede: 'Cel puțin o mașină, ca firma să poată primi cereri de la început.',
      plate: 'Număr de înmatriculare',
      type: 'Tip',
      weight: 'Masă maximă (kg)',
      add: 'Adaugă vehiculul',
      empty: 'Niciun vehicul încă.',
      skip: 'Continuă fără vehicule',
    },

    profile: {
      title: 'Profil și acoperire',
      lede: 'Unde merge și cu ce. Asta decide pe ce cereri apare firma la potriviri.',
      scope: 'Cât de departe merge',
      counties: 'Județe',
      services: 'Ce face',
      equipment: 'Ce are pe platformă',
      submit: 'Salvează profilul',
    },

    finish: {
      title: 'Trimite linkul',
      lede: 'Linkul funcționează o singură dată și expiră în 7 zile. Noi nu alegem nicio parolă și nu putem vedea ce alege firma.',
      send: 'Generează linkul',
      sent: 'Linkul a fost generat și e-mailul este în coadă.',
      copy: 'Copiază linkul',
      copied: 'Copiat.',
      /** Când furnizorul de e-mail nu este configurat. */
      noMail: 'Atenție: furnizorul de e-mail nu este configurat, deci mesajul nu pleacă. Dă linkul de mai jos personal sau pe WhatsApp.',
      onceOnly: 'Linkul se arată o singură dată, acum. Nu îl mai putem recupera — dacă îl pierzi, generezi altul.',
      whatNext: 'După ce firma îl deschide, își alege parola și contul este al ei. Tu nu mai ai drepturi în plus asupra lui.',
    },
  },

  claim: {
    meta: { title: 'Preia contul firmei' },
    title: (company: string) => `Contul pentru ${company}`,
    lede: `Echipa ${BRAND_NAME} a pregătit contul acestei firme. Ca să îl preiei, alege-ți o parolă.`,
    filled: 'Ce am completat deja',
    documents: (n: number) => (n === 1 ? 'un document încărcat' : `${n} documente încărcate`),
    vehicles: (n: number) => (n === 1 ? 'un vehicul adăugat' : `${n} vehicule adăugate`),
    nothingYet: 'Datele firmei',
    emailHint: (hint: string) => `Contul se va face pe adresa ${hint}`,
    expires: (label: string) => `Linkul ${label}.`,

    password: 'Alege o parolă',
    passwordAgain: 'Scrie parola din nou',
    passwordHint: 'Noi nu am ales niciuna și nu putem vedea ce alegi tu.',
    terms: 'Am citit și accept Termenii și Politica de confidențialitate.',
    submit: 'Preiau contul',
    working: 'Se preia…',

    mismatch: 'Cele două parole nu sunt la fel.',
    needTerms: 'Ca să continui, trebuie să accepți termenii.',

    invalid: 'Linkul nu mai este valabil',
    invalidBody: 'Fie a fost folosit deja, fie a expirat, fie nu a existat niciodată. Scrie-ne și îți trimitem altul.',

    /** Ce citește cineva care nu a cerut asta. */
    notYou: 'Nu ai cerut tu asta?',
    notYouBody: 'Nu se întâmplă nimic până nu alegi o parolă. Scrie-ne și ștergem tot ce am pregătit:',
    notYouLink: 'datele de contact',

    confirmEmail: 'Ți-am trimis un e-mail de confirmare. Deschide-l, apoi revino la linkul acesta ca să termini preluarea.',
  },

  /** Bannerul de pe tabloul de bord, după preluare. */
  banner: {
    title: `Contul a fost pregătit de echipa ${BRAND_NAME}`,
    filled: (staff: string) => `${staff} a completat pentru tine:`,
    company: 'datele firmei',
    documents: (n: number) => (n === 1 ? 'un document' : `${n} documente`),
    vehicles: (n: number) => (n === 1 ? 'un vehicul' : `${n} vehicule`),
    profile: 'profilul și acoperirea',
    editable: 'Poți schimba orice, ca și cum le-ai fi scris tu. Verifică-le când ai un minut — noi am completat ce ne-ai spus la telefon, și se mai strecoară o greșeală.',
    dismiss: 'Am verificat',
  },
} as const;
