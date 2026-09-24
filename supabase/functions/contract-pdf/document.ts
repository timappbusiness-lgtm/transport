/**
 * A contract as the renderer sees it: a title, a few lines of record
 * under it, a list of blocks, and a footer. A template turns facts into
 * this; the renderer turns this into pages. Neither knows about the other,
 * which is what lets a template version stay in the repository unchanged
 * while the renderer improves.
 */

import type { ContractFacts, Row } from './model.ts';

export type Block =
  /** A numbered section: „4. Transportatorul: date verificate". */
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; text: string; muted?: boolean }
  /** Label and value, two columns. */
  | { kind: 'rows'; rows: Row[] }
  /** A table with a header row; widths are fractions of the text width. */
  | { kind: 'table'; columns: string[]; widths: number[]; rows: string[][] }
  | { kind: 'list'; items: string[] }
  /** A framed paragraph for something the reader must not miss: the draft state, a superseded version. */
  | { kind: 'notice'; title: string; text: string };

export interface ContractDocument {
  title: string;
  subtitle: string;
  /** The record under the title: number, version, when and by whom, template, fingerprint. */
  meta: Row[];
  blocks: Block[];
  footer: {
    /** First line, left: „Contract CT-2026-… · versiunea 2 · generat la …". */
    left: string;
    /** Further lines: the acceptances this version and the previous one carry. */
    lines: string[];
  };
  info: {
    title: string;
    subject: string;
    author: string;
    keywords: string;
    /** When the version was generated — the PDF says so, not when it was drawn. */
    createdAt: string | null;
  };
}

export interface ContractTemplate {
  /** `major.minor`, as `contract_template_version()` returns it. */
  version: string;
  build(facts: ContractFacts, createdAt: string | null): ContractDocument;
}
