/**
 * Who we are, legally.
 *
 * The legal pages name an operator, and an operator has to be a real
 * company with a real registration number and a real address. Nothing
 * here is invented: every value that is not yet known is an empty string,
 * and `isComplete()` is what the pages use to decide between printing the
 * detail and printing „de completat înainte de lansare".
 *
 * A placeholder that looks like a CUI is worse than a blank. Somebody
 * reads it, believes it, and we have published a false identification for
 * a company on a page that is a contract.
 *
 * Filled in by Edi before launch. `docs/09-verificare-juridica.md` lists
 * what else has to be true before these pages stop being drafts.
 */
export interface LegalEntity {
  /** Full legal name, as at the trade register. */
  legalName: string;
  /** CUI / VAT identifier, digits only, without the RO prefix. */
  cui: string;
  /** Trade register number, e.g. J40/1234/2020. */
  regCom: string;
  /** Registered office, one line. */
  address: string;
  /** Where somebody writes about the contract. */
  email: string;
  /** Where somebody writes about their personal data. */
  privacyEmail: string;
  phone: string;
}

export const OPERATOR: LegalEntity = {
  legalName: '',
  cui: '',
  regCom: '',
  address: '',
  email: '',
  privacyEmail: '',
  phone: '',
};

/** True when a field has a real value rather than the blank it starts as. */
export function has(field: keyof LegalEntity): boolean {
  return OPERATOR[field].trim() !== '';
}

/** Every field the legal pages need before they stop being drafts. */
export const REQUIRED_FIELDS: readonly (keyof LegalEntity)[] = [
  'legalName',
  'cui',
  'regCom',
  'address',
  'email',
  'privacyEmail',
];

export function missingLegalFields(): (keyof LegalEntity)[] {
  return REQUIRED_FIELDS.filter((field) => !has(field));
}

/** What the page prints where a value is not known yet. */
export const TO_BE_FILLED = '[de completat]';

export function operatorField(field: keyof LegalEntity): string {
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
    `cu sediul în ${operatorField('address')}`,
  ];
  return parts.join(', ');
}
