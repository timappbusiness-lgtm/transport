/**
 * The shape of a legal document, and the rules about versions.
 *
 * Documents are data rather than JSX for one reason: a version has to be
 * keepable. `termeni-1.0.ts` stays in the repository when `termeni-1.1.ts`
 * arrives, because „what did I agree to in September" is the question a
 * consent record exists to answer, and an answer that points at a file
 * that has since been edited is not an answer.
 *
 * Every document carries a version and a date, and the version is what
 * `terms_acceptances` stores. Bump the minor number for wording, the
 * major for anything that changes what somebody is agreeing to — and when
 * you bump either, everybody is asked again on their next page load.
 */

export interface LegalSection {
  /** Numbered on the page; the number is positional, not stored here. */
  title: string;
  /** Paragraphs. Plain strings: no markup, no links inside the text. */
  body: string[];
  /** Bullets under the paragraphs, when a list is the honest shape. */
  list?: string[];
  /** One link under the section, when there is exactly one thing to open. */
  link?: { href: string; label: string };
}

export interface LegalDocument {
  slug: 'termeni' | 'confidentialitate' | 'cookies';
  title: string;
  /** `major.minor`, matching the check in `terms_acceptances.version`. */
  version: string;
  /** ISO date the version takes effect. */
  effectiveFrom: string;
  /** One paragraph under the title, before the sections. */
  lede: string;
  sections: LegalSection[];
}

/**
 * The warning that sits at the top of every one of these until a lawyer
 * has read them.
 *
 * It is not a disclaimer for us, it is a fact for the reader: these are
 * drafts written by the people who built the platform, and they describe
 * how the platform actually works. A lawyer has not yet checked that what
 * they say is what Romanian law requires them to say.
 */
export const DRAFT_NOTICE = {
  title: 'Document în lucru',
  body:
    'Textul de mai jos descrie corect cum funcționează platforma, dar nu a fost încă verificat de un avocat. Îl publicăm pentru că un document care spune ce facem este mai util decât o pagină goală. Versiunea finală poate diferi.',
} as const;

/** True while the draft notice still has to be shown. */
export const LEGAL_REVIEWED = false;
