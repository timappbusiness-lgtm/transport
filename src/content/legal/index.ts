import { CONFIDENTIALITATE_1_0 } from './confidentialitate-1.0';
import { COOKIES_1_0 } from './cookies-1.0';
import { TERMENI_1_0 } from './termeni-1.0';
import type { LegalDocument } from './document';

/**
 * The version of each document that is in force today.
 *
 * Adding a version means adding a file next to the old one and changing
 * the import here. The old file stays: `terms_acceptances` stores version
 * strings, and a stored version that points at nothing is a consent
 * record that cannot be read back.
 */
export const LEGAL_DOCUMENTS = {
  termeni: TERMENI_1_0,
  confidentialitate: CONFIDENTIALITATE_1_0,
  cookies: COOKIES_1_0,
} as const satisfies Record<string, LegalDocument>;

/**
 * The version somebody has to have accepted to use the account area.
 *
 * Only the terms are gated. Changing the privacy notice informs people;
 * it does not ask them to agree to something, and a modal that blocks the
 * screen for a document nobody has to accept teaches people to click
 * through modals.
 */
export const CURRENT_TERMS_VERSION = LEGAL_DOCUMENTS.termeni.version;

/** Whether this account has to be asked again before it can carry on. */
export function needsTermsAcceptance(accepted: string | null | undefined): boolean {
  return (accepted ?? '') !== CURRENT_TERMS_VERSION;
}

export type { LegalDocument, LegalSection } from './document';
export { DRAFT_NOTICE, LEGAL_REVIEWED } from './document';
