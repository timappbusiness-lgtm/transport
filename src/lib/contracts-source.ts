import 'server-only';
import { isContractSide, type ContractSide, type ContractVersion } from './contracts';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the contract card and the staff screen read.
 *
 * `order_contract_versions()` answers only a party to the order or staff
 * and returns nothing to anybody else — a driver included — so an empty
 * list with no side is the answer for „not yours", and the card is not
 * drawn. `admin_order_contracts()` refuses everybody but staff.
 */

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export async function loadContractVersions(
  orderId: string,
): Promise<{ mySide: ContractSide | null; versions: ContractVersion[] }> {
  if (!isSupabaseConfigured()) return { mySide: null, versions: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_contract_versions', { p_order_id: orderId });
  if (error || !Array.isArray(data)) return { mySide: null, versions: [] };
  const first = data[0] as { my_side?: unknown } | undefined;
  const versions = data.map((row) => ({
    contractId: row.contract_id,
    version: row.version,
    contractNumber: row.contract_number,
    templateVersion: row.template_version,
    snapshotHash: row.snapshot_hash,
    generatedAt: row.generated_at,
    generatedByName: str(row.generated_by_name),
    generatedBySide: str(row.generated_by_side),
    isLatest: row.is_latest,
    carrierAcceptedAt: str(row.carrier_accepted_at),
    carrierAcceptedBy: str(row.carrier_accepted_by),
    clientAcceptedAt: str(row.client_accepted_at),
    clientAcceptedBy: str(row.client_accepted_by),
  }));
  return { mySide: isContractSide(first?.my_side) ? first.my_side : null, versions };
}

export interface AdminAcceptance {
  side: 'carrier' | 'client';
  userId: string | null;
  name: string | null;
  companyName: string | null;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
  snapshotHash: string | null;
}

export interface AdminContractVersion {
  contractId: string;
  version: number;
  contractNumber: string;
  templateVersion: string;
  snapshotHash: string;
  generatedAt: string;
  generatedBy: string | null;
  generatedByName: string | null;
  generatedBySide: string | null;
  redactedAt: string | null;
  acceptances: AdminAcceptance[];
}

function acceptances(value: unknown): AdminAcceptance[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): AdminAcceptance[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const a = raw as Record<string, unknown>;
    if ((a.side !== 'carrier' && a.side !== 'client') || typeof a.accepted_at !== 'string') return [];
    return [
      {
        side: a.side,
        userId: str(a.user_id),
        name: str(a.name),
        companyName: str(a.company_name),
        acceptedAt: a.accepted_at,
        ip: str(a.ip),
        userAgent: str(a.user_agent),
        snapshotHash: str(a.snapshot_hash),
      },
    ];
  });
}

export async function loadAdminContracts(orderId: string): Promise<AdminContractVersion[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_order_contracts', { p_order_id: orderId });
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    contractId: row.contract_id,
    version: row.version,
    contractNumber: row.contract_number,
    templateVersion: row.template_version,
    snapshotHash: row.snapshot_hash,
    generatedAt: row.generated_at,
    generatedBy: str(row.generated_by),
    generatedByName: str(row.generated_by_name),
    generatedBySide: str(row.generated_by_side),
    redactedAt: str(row.redacted_at),
    acceptances: acceptances(row.acceptances),
  }));
}
