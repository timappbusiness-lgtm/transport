import { BRAND_NAME } from '@/config/brand';
import { OPERATOR } from '@/config/company';
import { contractFileRoute } from '@/config/routes';
import { contractCopy } from '@/content/contract';
import { formatMoment } from '@/lib/orders';

/**
 * The transport contract as the application sees it: which versions an
 * order has, who may do what with them, and the two values the app hands
 * the database — the operator block and where an acceptance came from.
 *
 * Nothing here decides anything the database does not decide again.
 * `generate_order_contract()` and `accept_order_contract()` check the
 * caller, the order and the version themselves; this file only chooses
 * which buttons to draw, so nobody is offered one that always fails.
 */

export type ContractSide = 'carrier' | 'client' | 'staff';

export interface ContractVersion {
  contractId: string;
  version: number;
  contractNumber: string;
  templateVersion: string;
  snapshotHash: string;
  generatedAt: string;
  generatedByName: string | null;
  generatedBySide: string | null;
  isLatest: boolean;
  carrierAcceptedAt: string | null;
  carrierAcceptedBy: string | null;
  clientAcceptedAt: string | null;
  clientAcceptedBy: string | null;
}

/** The database refuses a 31st version; the button disappears one step earlier. */
export const MAX_CONTRACT_VERSIONS = 30;

export interface ContractCardState {
  mySide: ContractSide | null;
  latest: ContractVersion | null;
  earlier: ContractVersion[];
  canGenerate: boolean;
  canAccept: boolean;
  acceptedByMe: boolean;
  bothAccepted: boolean;
  cancelled: boolean;
}

export function isContractSide(value: unknown): value is ContractSide {
  return value === 'carrier' || value === 'client' || value === 'staff';
}

/**
 * What the card shows for this reader and these versions.
 *
 * A driver, or anybody the database gave no side, gets no card at all
 * (`mySide` null). A cancelled order keeps its versions readable and
 * offers nothing new.
 */
export function contractCardState(
  versions: readonly ContractVersion[],
  mySide: ContractSide | null,
  orderStatus: string,
): ContractCardState {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const latest = sorted[0] ?? null;
  const cancelled = orderStatus === 'cancelled';
  const acceptedByMe =
    latest !== null &&
    ((mySide === 'carrier' && latest.carrierAcceptedAt !== null) ||
      (mySide === 'client' && latest.clientAcceptedAt !== null));
  return {
    mySide,
    latest,
    earlier: sorted.slice(1),
    canGenerate: mySide !== null && !cancelled && sorted.length < MAX_CONTRACT_VERSIONS,
    canAccept: (mySide === 'carrier' || mySide === 'client') && latest !== null && !cancelled && !acceptedByMe,
    acceptedByMe,
    bothAccepted: latest !== null && latest.carrierAcceptedAt !== null && latest.clientAcceptedAt !== null,
    cancelled,
  };
}

/**
 * The operator's details as the contract prints them, from
 * `src/config/company.ts`. Blank fields are left out — the contract then
 * prints „[de completat]" rather than an empty line — and the database
 * keeps only these keys, trimmed, whatever else is sent.
 */
export function operatorBlock(): Record<string, string> {
  const block: Record<string, string> = { brand: BRAND_NAME };
  const fields: [string, string][] = [
    ['legal_name', OPERATOR.legalName],
    ['cui', OPERATOR.cui],
    ['reg_com', OPERATOR.regCom],
    ['address', OPERATOR.address],
    ['email', OPERATOR.email],
    ['phone', OPERATOR.phone],
  ];
  for (const [key, value] of fields) {
    if (value.trim() !== '') block[key] = value.trim();
  }
  return block;
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

/**
 * The address an acceptance came from.
 *
 * On Vercel the first entry of `x-forwarded-for` is the client; the ones
 * after it are proxies. Anything that does not look like an address is
 * dropped rather than stored: the column is `inet`, and a value somebody
 * typed into a header is not evidence of anything.
 */
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const candidates = [
    headers.get('x-forwarded-for')?.split(',')[0],
    headers.get('x-real-ip'),
  ];
  for (const raw of candidates) {
    const value = raw?.trim() ?? '';
    if (value === '' || value.length > 45) continue;
    if (IPV4.test(value) && value.split('.').every((part) => Number(part) <= 255)) return value;
    if (value.includes(':') && IPV6.test(value)) return value;
  }
  return null;
}

/** The browser, as it described itself, cut to what the column keeps. */
export function clientUserAgent(headers: Pick<Headers, 'get'>): string | null {
  const value = headers.get('user-agent')?.trim() ?? '';
  return value === '' ? null : value.slice(0, 400);
}

/**
 * The versions as entries in the order's documents list, newest first,
 * each with where it stands: accepted by both, by one, or by neither.
 */
export function contractDocuments(
  orderId: string,
  versions: readonly ContractVersion[],
): { key: string; label: string; detail: string; href: string; downloadHref: string }[] {
  return [...versions]
    .sort((a, b) => b.version - a.version)
    .map((v) => {
      const state =
        v.carrierAcceptedAt !== null && v.clientAcceptedAt !== null
          ? 'acceptat de ambele părți'
          : v.carrierAcceptedAt !== null
            ? 'acceptat de transportator'
            : v.clientAcceptedAt !== null
              ? 'acceptat de beneficiar'
              : 'neacceptat';
      return {
        key: v.contractId,
        label: contractCopy.document(v.version),
        detail: `${v.contractNumber} · ${formatMoment(v.generatedAt)} · ${state}`,
        href: contractFileRoute(orderId, v.contractId),
        downloadHref: contractFileRoute(orderId, v.contractId, true),
      };
    });
}
