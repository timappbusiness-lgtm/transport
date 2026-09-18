/**
 * Notifications, in Romanian.
 *
 * The rule `tests/unit/notificari-content.test.ts` holds: nothing here
 * promises a channel we do not send, and nothing here pressures anybody
 * into accepting notifications. A permission prompt is a one-shot: refused
 * once, it never appears again, so the card has to earn the tap by saying
 * what arrives rather than by nagging.
 */

export const pushCopy = {
  card: {
    title: 'Vrei să afli imediat?',
    /** Carrier-facing, after publishing a route or opening a match. */
    carrierBody:
      'Îți trimitem o notificare când apare o cerere care se potrivește cu firma ta. Poți opri oricând, din setări.',
    /** Client-facing, after publishing a request. */
    clientBody:
      'Îți trimitem o notificare când se întâmplă ceva cu cererea ta. Poți opri oricând, din setări.',
    accept: 'Activează notificările',
    later: 'Mai târziu',
    /** iOS Safari, before the site is installed. */
    iosTitle: 'Pe iPhone, mai întâi instalează aplicația',
    iosBody:
      'Apasă butonul de partajare din Safari, alege „Adaugă la ecranul principal”, apoi deschide Coridor de acolo și activează notificările.',
    iosDismiss: 'Am înțeles',
  },

  install: {
    action: 'Instalează aplicația',
    hint: 'Se deschide ca o aplicație, fără bara browserului.',
  },

  settings: {
    title: 'Notificări',
    lede:
      'Ce îți trimitem și pe ce cale. Notificările despre starea contului rămân pornite în aplicație și pe e-mail.',

    devices: {
      title: 'Dispozitivul acesta',
      on: 'Notificările sunt pornite pe acest dispozitiv.',
      off: 'Notificările nu sunt pornite pe acest dispozitiv.',
      enable: 'Activează pe acest dispozitiv',
      disable: 'Dezactivează pe acest dispozitiv',
      test: 'Trimite o notificare de test',
      testHint: 'Ajunge imediat, chiar și în orele liniștite.',
      others: 'Alte dispozitive',
      /** Takes "Chrome pe Android". */
      lastSeen: (when: string) => `Ultima dată activ: ${when}`,
      disabled: 'Nu mai primește notificări. Activează din nou de pe acel dispozitiv.',
      remove: 'Șterge',
      none: 'Niciun alt dispozitiv.',
      unsupported:
        'Browserul acesta nu poate primi notificări. Restul canalelor funcționează normal.',
      notConfigured:
        'Notificările pe dispozitiv nu sunt încă pornite pe platformă. Restul canalelor funcționează normal.',
    },

    channels: {
      title: 'Ce îți trimitem',
      inapp: 'În aplicație',
      email: 'E-mail',
      push: 'Pe dispozitiv',
      locked: 'Nu poate fi oprit',
      lockedHint:
        'Notificările despre suspendarea sau reactivarea contului rămân pornite în aplicație și pe e-mail. Pe dispozitiv le poți opri.',
    },

    quiet: {
      title: 'Ore liniștite',
      lede:
        'Notificările pe dispozitiv se rețin în intervalul acesta și ajung dimineața. Suspendarea contului și rezervările ajung oricând.',
      enable: 'Reține notificările noaptea',
      from: 'De la',
      to: 'Până la',
      zone: 'Ora României.',
      cap: 'Cel mult atâtea notificări pe oră',
      capHint:
        'Peste această limită, restul orei ajunge ca o singură notificare cu numărul lor.',
    },

    saved: 'Setările au fost salvate.',
  },
};
