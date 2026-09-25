/**
 * Who we are, legally.
 *
 * The legal pages, /contact, the footer, every e-mail and the transport
 * contract name the operator, and an operator has to be a real company
 * with a real registration number and a real address. Nothing here is
 * invented: a value that is not known is an empty string, and the pages
 * print „[de completat]" in its place rather than something that looks
 * like a CUI. A placeholder that looks real is worse than a blank.
 *
 * Filled in on 25 September 2026 with the details the owner gave. A check
 * against ANAF runs in CI (`scripts/ci/check-anaf.sh`, the „Company lookup
 * (ANAF), live" job) and reports any difference; it never changes these.
 * `docs/09-verificare-juridica.md` lists what else has to be true before
 * the legal pages stop being drafts.
 */
export interface LegalEntity {
  /** Full legal name, as at the trade register. */
  legalName: string;
  /** Fiscal identification code (CUI), digits only, without the RO prefix. */
  cui: string;
  /** Registered for VAT: the code is then written with the RO prefix. */
  vatPayer: boolean;
  /** Trade register number, e.g. J40/1234/2020. */
  regCom: string;
  /** European unique identifier, as the trade register issues it. */
  euid: string;
  /** Registered office, one line. */
  address: string;
  /** Where somebody writes about the platform and the contract. */
  email: string;
  /** Where somebody writes about their personal data. */
  privacyEmail: string;
  phone: string;
}

export const OPERATOR: LegalEntity = {
  legalName: 'MRO WEMAX SRL',
  cui: '41150110',
  vatPayer: true,
  regCom: 'J16/1561/2019',
  euid: 'ROONRC.J16/1561/2019',
  address: 'Str. Brăila 230, Craiova, jud. Dolj, cod poștal 200641, România',
  // TEMPORARY: both addresses are a Gmail mailbox until the platform's own
  // domain is registered. Replace them with addresses on that domain (for
  // example contact@ and date-personale@) as soon as it exists, and set
  // the same address as MAIL_REPLY_TO on the Edge Functions; e-mail itself
  // cannot be sent from a Gmail address. docs/configurare-externa.md §6.
  email: 'transautobursa@gmail.com',
  privacyEmail: 'transautobursa@gmail.com',
  phone: '0771 502 007',
};

/** The fields that hold text, as opposed to the VAT flag. */
export type TextField = Exclude<keyof LegalEntity, 'vatPayer'>;

/** True when a field has a real value rather than the blank it starts as. */
export function has(field: TextField): boolean {
  return OPERATOR[field].trim() !== '';
}

/** Every field the legal pages need before they stop being drafts. */
export const REQUIRED_FIELDS: readonly TextField[] = [
  'legalName',
  'cui',
  'regCom',
  'address',
  'email',
  'privacyEmail',
];

export function missingLegalFields(): TextField[] {
  return REQUIRED_FIELDS.filter((field) => !has(field));
}

/** What the page prints where a value is not known yet. */
export const TO_BE_FILLED = '[de completat]';

/**
 * The fiscal code as it is written on documents: with the RO prefix for a
 * VAT payer, digits alone otherwise.
 */
export function fiscalCode(): string {
  if (!has('cui')) return TO_BE_FILLED;
  return OPERATOR.vatPayer ? `RO ${OPERATOR.cui}` : OPERATOR.cui;
}

export function operatorField(field: TextField): string {
  if (field === 'cui') return fiscalCode();
  return has(field) ? OPERATOR[field] : TO_BE_FILLED;
}

/**
 * The operator, as one sentence, for the places that name it in passing.
 *
 * Reads correctly whether or not the details are filled in, which is the
 * point: a page that becomes ungrammatical when a value is missing is a
 * page nobody can review before the values arrive.
 */
export function operatorLine(): string {
  const parts = [
    operatorField('legalName'),
    `CUI ${operatorField('cui')}`,
    `înregistrată la registrul comerțului sub ${operatorField('regCom')}`,
    ...(has('euid') ? [`EUID ${OPERATOR.euid}`] : []),
    `cu sediul în ${operatorField('address')}`,
  ];
  return parts.join(', ');
}

/**
 * The same, short, for the footer and the bottom of every e-mail: the
 * identification a visitor or a recipient is owed on every page and
 * message, without the sentence around it.
 */
export function operatorShortLine(): string {
  return [
    operatorField('legalName'),
    `CUI ${operatorField('cui')}`,
    operatorField('regCom'),
    ...(has('euid') ? [`EUID ${OPERATOR.euid}`] : []),
    operatorField('address'),
  ].join(' · ');
}
