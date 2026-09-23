/**
 * The carrier's first ten minutes, in Romanian.
 *
 * Written after a dispatcher said the platform was hard to connect. Two
 * rules held throughout: say what happens next in the words somebody
 * uses on the telephone, and never promise a duration or an outcome that
 * nothing measures. „Durează aproximativ" is a promise about the form,
 * which we control; there is no sentence here about how long a
 * verification takes, because nothing on the platform measures that.
 */
export const onboardingCopy = {
  /** The screen before anything is asked. */
  intro: {
    title: 'Înscriere transportator',
    lede: 'Vezi ce urmează înainte să completezi ceva.',
    steps: [
      {
        title: 'Faci cont',
        body: 'E-mail și parolă. Sub un minut.',
      },
      {
        title: 'Vezi cererile',
        body: 'Panoul se deschide imediat, fără să aștepți verificarea.',
      },
      {
        title: 'Completezi dosarul firmei',
        body: 'CUI, unde circuli, ce transporți, documentele. Apoi poți trimite oferte.',
      },
    ],
    /** Honest, and about the part we control: the typing. */
    duration: 'Completarea dosarului durează aproximativ 10 minute.',
    durationNote:
      'Verificarea o facem noi, după ce trimiți dosarul. Îți scriem pe e-mail când e gata.',
    cta: 'Fă-ți cont de transportator',
    hasAccount: 'Am deja cont',
    signIn: 'Intră în cont',
    /** For somebody who is only looking around. */
    browse: 'Vezi întâi cererile',
  },

  /**
   * The banner above the boards, for a carrier who is signed in but not
   * yet able to send offers. Calm on purpose: nothing is wrong, there is
   * simply a step left, and the board is usable meanwhile.
   */
  banner: {
    no_company: {
      title: 'Poți vedea toate cererile',
      body: 'Ca să trimiți oferte, adaugă firma cu care transporți.',
      action: 'Adaugă firma',
    },
    draft: {
      title: 'Poți vedea toate cererile',
      body: 'Mai ai de completat dosarul firmei. Îl poți lăsa și relua oricând.',
      action: 'Continuă dosarul',
    },
    pending: {
      title: 'Dosarul este la verificat',
      body: 'Poți vedea toate cererile. Îți scriem pe e-mail când firma este verificată.',
      action: 'Vezi dosarul',
    },
    rejected: {
      title: 'Mai e ceva de corectat în dosar',
      body: 'Îți scrie exact ce, în dosarul firmei. Până atunci poți vedea toate cererile.',
      action: 'Vezi ce lipsește',
    },
    suspended: {
      title: 'Contul firmei este suspendat',
      body: 'Nu poți trimite oferte până se ridică suspendarea. Cererile rămân vizibile.',
      action: 'Vezi contul firmei',
    },
  },

  /**
   * One line per step of the company file, saying why the question is
   * asked. A field with a reason gets filled in; a field without one
   * gets a closed tab.
   */
  why: {
    identitate: 'Ca să știm cine ești și pe ce număr te caută clientul.',
    acoperire: 'Ca să primești numai cererile de pe rutele tale.',
    dotari: 'Ca să nu primești cereri pe care platforma ta nu le poate lua.',
    alerte: 'Ca să afli de o cerere potrivită fără să stai pe panou.',
    public: 'Ca să te găsească un client care caută direct un transportator.',
  },

  /** The documents step, one document at a time. */
  documents: {
    stepOf: (current: number, total: number) => `Documentul ${current} din ${total}`,
    example: 'Așa arată o poză bună',
    exampleBody:
      'Documentul întreg în cadru, pe o masă, fără degete peste scris. Se citește și de pe telefon.',
    camera: 'Fă o poză',
    file: 'Sau alege un fișier',
    later: 'Îl adaug mai târziu',
    laterNote: 'Rămâne în listă și îl poți încărca oricând.',
    blocking: 'Fără el nu putem verifica firma.',
    optional: 'Îl poți adăuga și după verificare.',
  },
} as const;
