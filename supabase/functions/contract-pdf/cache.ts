/**
 * Where a drawn contract is kept, what it is called when downloaded, and
 * how a request for one is read. No I/O here, so it is tested without a
 * network (`cache_test.ts`).
 */

import type { RenderData } from './snapshot.ts';

/**
 * Bumped when the renderer changes what it draws — a layout fix, a
 * footer line — so that PDFs drawn before are not served again. The
 * snapshot and the template do not need it: they are already in the path.
 */
export const RENDERER_REVISION = 'r1';

/** How long a download link lives. Long enough to open, too short to forward. */
export const SIGNED_URL_SECONDS = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * `<order>/<contract>/v2-of3-t1.0-a3-r1.pdf`.
 *
 * The first folder is the order: the bucket's read policy asks
 * `can_see_order_contract()` about it. Everything that changes the pages
 * is in the name — the version (the snapshot), the newest version there
 * is (an older one says it was replaced), the template, how many
 * acceptances the footer shows, whether the parties were anonymised, and
 * the renderer — so a cached file is always the file this request would
 * draw. The snapshot itself never changes, which is why this is a cache
 * and not a guess.
 */
export function objectPath(data: RenderData): string {
  const acceptances = data.acceptances.filter((a) => a.version <= data.version).length;
  const redacted = data.redacted ? '-x' : '';
  return `${data.order_id}/${data.contract_id}/v${data.version}-of${data.latest_version}-t${data.template_version}-a${acceptances}${redacted}-${RENDERER_REVISION}.pdf`;
}

/** `contract-CT-2026-A1B2C3D4-v2.pdf`. */
export function downloadName(data: Pick<RenderData, 'contract_number' | 'version'>): string {
  const number = data.contract_number.replace(/[^A-Za-z0-9-]/g, '');
  return `contract-${number}-v${data.version}.pdf`;
}

export interface ContractRequest {
  contractId: string;
  /** `attachment` downloads; `inline` opens in the browser's viewer. */
  disposition: 'inline' | 'attachment';
}

export function readRequest(body: unknown): ContractRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!isUuid(b.contract_id)) return null;
  return {
    contractId: b.contract_id,
    disposition: b.disposition === 'attachment' ? 'attachment' : 'inline',
  };
}

/**
 * The database answers „not there" and „not yours" with the same P0002,
 * on purpose: a stranger learns nothing from the difference. The function
 * keeps it that way — both become 404.
 */
export function statusForRpcError(error: { code?: string | null } | null): number {
  if (!error) return 200;
  if (error.code === 'P0002') return 404;
  if (error.code === '28000' || error.code === '42501' || error.code === 'PGRST301') return 404;
  return 500;
}
