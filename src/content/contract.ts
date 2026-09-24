/**
 * The words on the „Contract de transport" card, on the order page and
 * on the staff screen.
 *
 * One rule runs through all of them: the acceptance is called what it
 * is. „Acceptare electronică în platformă", with what it records, and
 * never a qualified electronic signature. „Semnat de" is the short form
 * the card uses once somebody has accepted, and the line under it says
 * what that word means here.
 */
export const contractCopy = {
  title: 'Contract de transport',
  lede:
    'Completat din datele comenzii și din documentele verificate ale transportatorului. Fiecare parte îl acceptă din contul ei.',
  none: 'Contractul nu a fost generat încă.',
  generate: 'Generează contractul',
  generating: 'Se generează…',
  generated: (version: number) => `Versiunea ${version} a fost generată.`,
  regenerate: 'Generează o versiune nouă',
  regenerateHint:
    'Pentru când s-a schimbat ceva după generare: vehiculul alocat, un document, reprezentantul legal. Versiunile de până acum rămân, neschimbate; se acceptă numai ultima.',
  preview: 'Previzualizează',
  download: 'Descarcă PDF',
  versionLine: (version: number, number: string) => `Versiunea ${version} · ${number}`,
  generatedLine: (when: string, who: string | null) =>
    who ? `Generată la ${when} de ${who}` : `Generată la ${when}`,
  sides: {
    carrier: 'Transportatorul',
    client: 'Beneficiarul',
  },
  signedBy: (name: string, when: string) => `Semnat de ${name} la ${when}`,
  notYet: 'Neacceptat încă',
  bothAccepted: 'Acceptat de ambele părți. Contractul este încheiat.',
  whatSigned:
    '„Semnat" înseamnă aici acceptare electronică în platformă, nu semnătură electronică calificată.',
  accept: {
    submit: 'Accept contractul',
    submitting: 'Se înregistrează…',
    confirm: (version: number) => `Am citit versiunea ${version} a contractului și o accept.`,
    confirmMissing: 'Bifează că ai citit contractul.',
    explain:
      'Acceptarea electronică în platformă înregistrează contul tău, numele, data și ora, adresa IP și browserul, împreună cu amprenta versiunii acceptate. Nu mai poate fi schimbată și nu este o semnătură electronică calificată.',
    done: 'Ai acceptat contractul. Cealaltă parte a primit un e-mail.',
    mine: 'Ai acceptat această versiune.',
  },
  staffNote: 'Echipa poate genera și citi contractul, dar nu îl acceptă în numele părților.',
  cancelled: 'Comanda a fost anulată. Versiunile generate rămân disponibile.',
  history: 'Versiuni anterioare',
  unavailable: 'Contractul nu a putut fi deschis acum. Încearcă din nou în câteva momente.',
  document: (version: number) => `Contract de transport, versiunea ${version}`,
  admin: {
    title: 'Contract de transport',
    none: 'Nicio versiune generată.',
    generatedBy: 'Generată de',
    template: 'Model',
    hash: 'Amprentă SHA-256',
    redacted: 'Anonimizată la',
    acceptances: 'Acceptări',
    noAcceptances: 'Nicio acceptare.',
    ip: 'IP',
    userAgent: 'Browser',
    user: 'Cont',
    side: 'Parte',
    who: 'Nume și firmă',
    when: 'Data',
  },
} as const;
