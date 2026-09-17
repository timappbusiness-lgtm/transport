/**
 * Romanian copy for the staff review screen.
 *
 * The audience is three people who will read these words a hundred times a
 * week, so the labels are short and the refusals say what to do next.
 */
export const adminReviewCopy = {
  title: 'Documente de verificat',
  lede:
    'Aici se decid două lucruri: fiecare document în parte și, la final, firma. Nimic nu se schimbă în afara acestui ecran — RPC-urile verifică din nou cine ești.',

  companies: {
    title: 'Firme care așteaptă decizia',
    empty: 'Nicio firmă în așteptare.',
    submitted: (when: string) => `Trimisă la ${when}`,
    documents: (uploaded: string, total: string) => `${uploaded} din ${total} documente încărcate`,
    vehicles: (n: string) => `${n} în flotă`,
    noVehicles: 'Fără vehicule',
    stillMissing: 'Mai lipsesc documente obligatorii',
    ready: 'Toate documentele obligatorii sunt încărcate',
    approve: 'Aprobă firma',
    reject: 'Respinge',
    rejectReason: 'Motivul respingerii',
    rejectHint: 'Îl citește firma, așa că scrie ce anume trebuie corectat.',
    rejectSubmit: 'Trimite respingerea',
    cancel: 'Renunță',
    approved: 'Firmă aprobată.',
    rejected: 'Firmă respinsă. Am trimis motivul pe e-mail.',
    missingReason: 'Scrie motivul respingerii.',
  },

  documents: {
    title: 'Documente în așteptare',
    empty: 'Nu există documente în așteptare.',
    company: 'Firmă',
    vehicle: 'Vehicul',
    uploaded: (when: string) => `Încărcat la ${when}`,
    extracted: 'Data citită automat',
    noExtracted: 'Nu s-a citit nicio dată',
    validUntil: 'Valabil până la',
    validUntilHint: 'Confirmă data citită sau corecteaz-o după document.',
    approve: 'Aprobă',
    reject: 'Respinge',
    rejectReason: 'Motivul respingerii',
    rejectSubmit: 'Trimite respingerea',
    cancel: 'Renunță',
    approved: 'Document aprobat.',
    rejected: 'Document respins.',
    missingDate: 'Completează data de valabilitate.',
    missingReason: 'Scrie motivul respingerii.',
  },

  noAccess: 'Nu ai drepturi pentru această acțiune.',
} as const;
