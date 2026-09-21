/**
 * The pilot dashboard, in the words the team uses.
 *
 * Deliberately plain about what the numbers are not: a criterion that
 * reads as met because our own test firms are inside it is worse than no
 * criterion, so the page says out loud that they are excluded.
 */
export const pilotCopy = {
  meta: { title: 'Pilot' },
  hero: {
    eyebrow: 'Staff',
    title: 'Pilotul',
    lede: 'Cele două criterii de ieșire din roadmap și cât mai avem până la ele. Conturile noastre de test sunt scoase din toate numerele de aici.',
  },
  range: { from: 'De la', to: 'Până la', submit: 'Arată', reset: 'Ultimele 8 săptămâni' },
  criteria: {
    title: 'Criteriile de ieșire',
    lede: 'Din `docs/04-roadmap.md`: 20 de transportatori verificați și 5 case de expediții care folosesc platforma săptămânal, fără noi în buclă.',
    carriers: 'Transportatori activi săptămâna trecută',
    forwarders: 'Case de expediții active săptămâna trecută',
    met: 'Îndeplinit',
    remaining: (n: number, what: string) => `Mai sunt ${n} până la țintă (${what}).`,
    definition:
      '„Activ" înseamnă că firma a publicat, a deschis un contact, a rezervat un loc sau cineva din ea s-a autentificat în săptămâna aceea.',
  },
  verified: {
    title: 'Câți sunt înscriși',
    carriers: 'Transportatori verificați',
    forwarders: 'Case de expediții verificate',
    note: 'Verificat și nesuspendat, adică firme care chiar pot publica azi.',
  },
  flow: {
    title: 'Cum merge fluxul',
    pending: 'Documente în așteptare',
    oldest: 'Cel mai vechi așteaptă de',
    median: 'De la publicare la primul contact (mediană)',
    medianNote:
      'Cât așteaptă un client până îi deschide cineva datele de contact. Singurul lucru apropiat de „platforma a făcut ceva pentru el" până când există oferte.',
    failed: 'Notificări eșuate în 24 h',
    staff: 'Intervenții manuale ale echipei',
    staffNote:
      'Orice a făcut echipa în afară de aprobarea documentelor. „Fără noi în buclă" înseamnă că numărul ăsta scade.',
  },
  assisted: {
    title: 'Înscrieri asistate',
    lede: 'Conturile pe care le-am pregătit noi pentru firme care au fost de acord.',
    started: 'Începute',
    sent: 'Așteaptă preluarea',
    claimed: 'Preluate',
    expired: 'Expirate',
    verified: 'Ajunse firme verificate',
    median: 'De la primul contact la firmă verificată',
    medianNote: 'Mediană. Se socotește de la deschiderea înscrierii, pentru că înainte de ea nu există nimic de măsurat.',
    solo: 'Documente verificate de cine le-a încărcat',
    soloNote: 'Excepția de la regula celor patru ochi, permisă doar cu o notă scrisă și numai cât echipa are un singur om.',
  },

  weekly: {
    title: 'Săptămână de săptămână',
    carriers: 'Transportatori',
    forwarders: 'Case de expediții',
    requests: 'Cereri publicate',
    departures: 'Trasee publicate',
    tooShort:
      'Prea puține săptămâni cu activitate ca să se vadă o tendință. Graficul apare oricum, dar nu trageți o concluzie din el încă.',
    empty: 'Nicio activitate în perioada aleasă.',
  },
  error: 'Nu se pot citi numerele pilotului.',
} as const;
