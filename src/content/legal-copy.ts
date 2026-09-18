/**
 * The Romanian around the legal documents — the gate, the footer note and
 * the links elsewhere on the site. The documents themselves are in
 * `src/content/legal/`.
 */
export const legalCopy = {
  gate: {
    title: 'Termenii s-au schimbat',
    body: (version: string) =>
      `Am publicat versiunea ${version} a termenilor și condițiilor. Ca să mergi mai departe, citește-i și confirmă că îi accepți.`,
    why: 'Îți cerem asta o singură dată, la fiecare versiune nouă. Păstrăm versiunea pe care ai acceptat-o și data, ca să putem răspunde oricând la întrebarea „cu ce am fost de acord".',
    accept: 'Accept termenii',
    accepting: 'Se salvează…',
    read: 'Citește termenii',
    leave: 'Dacă nu ești de acord, îți poți șterge contul din',
    leaveLink: 'pagina Date personale',
  },
  verification: {
    title: 'Ce scrie în documentele noastre',
    body: 'Verificarea este o verificare de documente, făcută de oameni, la un moment dat. Ce înseamnă exact — și ce nu înseamnă — scrie în termeni, la punctul 6.',
    terms: 'Termeni și condiții',
    privacy: 'Politica de confidențialitate',
    cookies: 'Cookie-uri',
  },
} as const;
