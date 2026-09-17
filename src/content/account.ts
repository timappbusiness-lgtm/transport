/** Romanian copy for the account area. */
export const accountCopy = {
  nav: {
    dashboard: 'Contul meu',
    profile: 'Profil',
    company: 'Firma',
    members: 'Membri',
    documents: 'Documente',
    fleet: 'Flotă',
    departures: 'Trasee',
    invitations: 'Invitații',
    admin: 'Administrare',
    signOut: 'Ieșire',
  },
  banners: {
    draft: {
      title: 'Completează datele firmei',
      body: 'Completează datele firmei pentru a trimite documentele la verificare.',
      action: 'Completează datele',
    },
    pending: {
      title: 'Documentele sunt în verificare',
      body: 'Te anunțăm pe e-mail când firma este aprobată. De obicei durează până la 24 de ore în zilele lucrătoare.',
    },
    rejected: {
      title: 'Înregistrarea a fost respinsă',
      fallback:
        'Verificarea firmei nu a putut fi finalizată. Scrie-ne și rezolvăm împreună.',
      action: 'Contactează-ne',
    },
    suspended: {
      title: 'Cont suspendat',
      fallback: 'Un document obligatoriu a expirat.',
      since: 'Suspendat din',
      action: 'Încarcă documentul nou',
      stillWorks:
        'Te poți autentifica și vedea tot. Nu poți publica anunțuri și nu poți vedea date de contact până la revalidare.',
    },
  },
  individual: {
    welcome: 'Bine ai venit',
    lede: 'De aici îți publici cererile de transport și urmărești ofertele primite.',
    phoneStep: {
      title: 'Confirmă numărul de telefon',
      body: 'Transportatorii te sună pe acest număr. Îl confirmăm o singură dată, printr-un cod SMS.',
      bodyDone: 'Numărul tău este confirmat.',
      action: 'Confirmă numărul',
      why: 'Îți cerem confirmarea abia când publici o cerere sau ceri datele de contact ale unui transportator.',
    },
    requests: {
      title: 'Cererile mele',
      empty: 'Nu ai nicio cerere publicată.',
      emptyHint: 'Publicarea cererilor vine în etapa următoare.',
    },
  },
  checklist: {
    carrier: {
      title: 'Pași până la primul traseu publicat',
      steps: [
        { key: 'company', label: 'Date firmă' },
        { key: 'documents', label: 'Documente firmă' },
        { key: 'vehicles', label: 'Vehicule și documente' },
        { key: 'verification', label: 'Verificare' },
        { key: 'publish', label: 'Publică primul traseu' },
      ],
    },
    forwarder: {
      title: 'Pași până la prima cerere publicată',
      steps: [
        { key: 'company', label: 'Date firmă' },
        { key: 'documents', label: 'Documente firmă' },
        { key: 'verification', label: 'Verificare' },
        { key: 'publish', label: 'Publică prima cerere' },
      ],
    },
    soon: 'în curând',
    done: 'gata',
  },
  needsCompany: {
    title: 'Adaugă-ți firma',
    lede: 'Contul tău este activ. Mai rămâne pasul doi: datele firmei, ca să poți oferta.',
    action: 'Adaugă firma',
  },
  profile: {
    title: 'Profil',
    name: 'Nume și prenume',
    email: 'Adresă de e-mail',
    phone: 'Telefon',
    phoneUnverified: 'neconfirmat',
    phoneVerified: 'confirmat',
    save: 'Salvează',
    saved: 'Modificările au fost salvate.',
    changePassword: 'Schimbă parola',
    currentPassword: 'Parola actuală',
    newPassword: 'Parolă nouă',
    changeEmail: 'Schimbă adresa de e-mail',
    changeEmailHint:
      'Îți trimitem un link de confirmare pe adresa nouă. Până confirmi, rămâne cea veche.',
    newEmail: 'Adresa nouă de e-mail',
    signOutEverywhere: 'Ieși de pe toate dispozitivele',
    signOutEverywhereHint:
      'Închide sesiunea pe toate telefoanele și calculatoarele pe care ești autentificat.',
  },
  company: {
    title: 'Firma',
    cui: 'CUI',
    legalName: 'Denumire',
    type: 'Tip activitate',
    county: 'Județ',
    city: 'Localitate',
    contactEmail: 'E-mail de contact',
    contactPhone: 'Telefon de contact',
    status: 'Stare verificare',
    lockedHint:
      'Datele de identificare nu mai pot fi modificate după verificare. Scrie-ne dacă s-a schimbat ceva.',
  },
  documents: {
    title: 'Documentele firmei',
    lede: 'Un document nou nu îl înlocuiește pe cel valabil până când nu este aprobat.',
    vehicleHint: 'Documentele vehiculelor se încarcă din pagina fiecărui vehicul.',
    required: 'Ce se cere',
    upload: 'Încarcă un document',
    history: 'Istoric',
  },
  fleet: {
    title: 'Flotă',
    lede: 'Un vehicul apare pe bursă doar cu ITP, RCA și copia conformă aprobate și valabile.',
    vehicles: 'Vehicule',
    noVehicles: 'Niciun vehicul încă.',
    addVehicle: 'Adaugă un vehicul',
    drivers: 'Șoferi',
    compliant: 'Documente în regulă',
    notCompliant: 'Documente lipsă',
    backToFleet: 'Înapoi la flotă',
    specs: 'Date și șofer',
    routes: 'Rute uzuale',
    noRoutes: 'Nicio rută adăugată.',
    addRoute: 'Adaugă o rută',
    removeRoute: 'Șterge',
    vehicleDocuments: 'Documentele vehiculului',
  },
  members: {
    title: 'Membri',
    lede: 'Cine are acces la contul firmei și ce poate face.',
    role: 'Rol',
    invite: 'Invită un coleg',
    inviteEmail: 'Adresa de e-mail',
    inviteRole: 'Rol',
    inviteAction: 'Trimite invitația',
    pending: 'Invitații în așteptare',
    revoke: 'Anulează',
    remove: 'Elimină',
    transfer: 'Transferă proprietatea',
    transferHint:
      'Vei rămâne în firmă ca administrator. Acțiunea nu poate fi anulată de tine.',
    transferConfirm: 'Transferă proprietatea către',
    onlyManagers: 'Doar proprietarul și administratorii pot invita sau schimba roluri.',
    empty: 'Deocamdată ești singurul membru.',
  },
  invitations: {
    title: 'Invitații',
    lede: 'Invitații primite de la alte firme.',
    empty: 'Nu ai nicio invitație în așteptare.',
    accept: 'Acceptă',
    decline: 'Refuză',
    invitedAs: 'Invitat ca',
    expires: 'Expiră',
  },
  switcher: {
    label: 'Firma activă',
  },
} as const;

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietar',
  admin: 'Administrator',
  dispatcher: 'Dispecer',
  driver: 'Șofer',
};

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  transport: 'Firmă de transport',
  expeditie: 'Casă de expediții',
  both: 'Transport și expediții',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  draft: 'Date incomplete',
  pending: 'În verificare',
  verified: 'Verificată',
  rejected: 'Respinsă',
  suspended: 'Suspendată',
};
