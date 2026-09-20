/**
 * The contact page.
 *
 * Written so it reads correctly before and after somebody fills in
 * `src/config/company.ts`: every detail that is missing is shown as
 * missing rather than left out, because a contact page with a blank where
 * the address should be looks broken, and one that quietly omits it looks
 * finished when it is not.
 *
 * The response time is a promise, so it is stated once, here, and it is
 * the cautious version — 48 hours on working days. `docs/04-roadmap.md`
 * warns that a 24-hour promise needs a named person, and until there is
 * one the slower promise is the honest one.
 */
export const contactCopy = {
  meta: {
    title: 'Contact',
    description:
      'Cum ne scrii: adresa de e-mail pentru platformă, adresa pentru date personale și datele firmei care operează Coridor.',
  },
  hero: {
    eyebrow: 'Contact',
    title: 'Scrie-ne',
    lede: 'Răspundem la fiecare mesaj. Mai jos sunt adresele pe care le citim și cât durează de obicei până primești răspuns.',
  },
  response: {
    title: 'Cât durează',
    body: 'Răspundem în cel mult două zile lucrătoare. Dacă e ceva urgent — un cont suspendat, un document respins înainte de o cursă — scrie „urgent” în subiect și îl luăm primul.',
  },
  channels: {
    title: 'Unde ne scrii',
    platform: {
      label: 'Pentru platformă',
      hint: 'Cont, anunțuri, abonament, documente, orice nu merge.',
    },
    privacy: {
      label: 'Pentru date personale',
      hint: 'Ștergere, export, rectificare — cererile GDPR. Le poți face și singur din cont, la Date personale.',
    },
    phone: { label: 'Telefon', hint: 'În timpul programului.' },
  },
  operator: {
    title: 'Firma care operează platforma',
    lede: 'Datele de identificare, ca să știi cu cine ai de-a face.',
    legalName: 'Denumire',
    cui: 'CUI',
    regCom: 'Registrul comerțului',
    address: 'Sediu',
  },
  missing: {
    title: 'Încă nu sunt completate',
    body: 'Câmpurile marcate mai jos se completează înainte de lansare. Le lăsăm vizibile ca să se vadă ce lipsește, în loc să dispară dintr-o pagină care pare gata.',
  },
  selfService: {
    title: 'Poate nu e nevoie să ne scrii',
    items: [
      { label: 'Întrebări frecvente', hint: 'Cum verificăm firmele, ce costă, cum funcționează.' },
      { label: 'Datele tale', hint: 'Descarcă-ți datele sau șterge-ți contul, fără să ceri voie.' },
      { label: 'Cum verificăm', hint: 'Ce documente cerem și ce se întâmplă când expiră.' },
    ],
  },
} as const;
