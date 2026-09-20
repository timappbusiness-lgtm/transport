/**
 * „Echipa platformei" — who may act on everybody else's data.
 *
 * The tone is plainer than the rest of the staff area on purpose: this
 * is the screen where a mistake gives somebody the run of the platform,
 * so every control says exactly what it does and every action asks why.
 */
export const teamCopy = {
  meta: { title: 'Echipa platformei' },
  hero: {
    eyebrow: 'Staff',
    title: 'Echipa platformei',
    lede: 'Cine are drepturi de administrare, de când și pe baza cui. Orice schimbare de aici trece prin set_platform_staff() și rămâne în jurnal, cu motivul scris.',
  },
  list: {
    title: 'Cine are acces',
    role: 'Rol',
    grantedAt: 'De când',
    grantedBy: 'Acordat de',
    grantedByUnknown: 'necunoscut (înainte de jurnal)',
    you: 'tu',
    revoke: 'Scoate din echipă',
    revoking: 'Se scoate…',
    lastAdmin: 'Ultimul administrator nu poate fi scos. Adaugă pe altcineva întâi.',
    empty: 'Nimeni. Asta nu ar trebui să se întâmple — un administrator există întotdeauna.',
  },
  abilities: {
    title: 'Ce poate face un administrator',
    lede: 'Fiecare rând de mai jos este o regulă pe care baza de date o verifică, nu o intenție.',
    oneRole:
      'Momentan există un singur rol, „Administrator”. Schema are o singură valoare în staff_role, așa că un al doilea rol ar fi o etichetă pe care nimic nu o aplică.',
  },
  add: {
    title: 'Adaugă pe cineva',
    lede: 'Persoana trebuie să aibă deja cont pe platformă, cu e-mailul confirmat. Nu creăm conturi de aici.',
    email: 'E-mailul contului',
    role: 'Rolul',
    reason: 'De ce',
    reasonHint: 'Obligatoriu. Rămâne în jurnal lângă numele tău.',
    submit: 'Dă acces',
    submitting: 'Se acordă…',
    missingEmail: 'Scrie adresa de e-mail a contului.',
    missingReason: 'Scrie de ce îi dai acces. Motivul rămâne în jurnal.',
    notFound: 'Nu există niciun cont cu adresa asta. Roagă-l să își facă întâi cont.',
    notConfirmed:
      'Contul există, dar e-mailul nu este confirmat. Până nu îl confirmă, nu îi putem da acces.',
    /** Takes a name. */
    granted: (name: string) => `${name} are acum acces de administrare.`,
  },
  revoke: {
    reason: 'De ce îl scoți',
    confirm: 'Sigur îi scoți accesul de administrare?',
    /** Takes a name. */
    revoked: (name: string) => `${name} nu mai are acces de administrare.`,
  },
} as const;
