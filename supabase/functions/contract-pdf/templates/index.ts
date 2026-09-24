/**
 * Every contract model the platform has ever generated from, by version.
 *
 * A contract is drawn with the model it was generated with — the one its
 * row records in `template_version` — never with the newest. So a model
 * is added here and never removed: a version generated from 1.0 in 2026
 * still has to open in 2030.
 */

import type { ContractTemplate } from '../document.ts';
import { CONTRACT_1_0 } from './contract-1.0.ts';

export const TEMPLATES: Readonly<Record<string, ContractTemplate>> = {
  [CONTRACT_1_0.version]: CONTRACT_1_0,
};

/** The model new versions are generated with; `contract_template_version()` in SQL returns the same. */
export const CURRENT_TEMPLATE = CONTRACT_1_0.version;

export function templateFor(version: string): ContractTemplate {
  const template = TEMPLATES[version];
  if (!template) throw new Error(`no contract template ${version}`);
  return template;
}
