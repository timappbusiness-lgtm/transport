/**
 * The data a contract is drawn from, as `order_contract_render_data()`
 * returns it.
 *
 * The snapshot is written once by `generate_order_contract()` and never
 * changes; this module only reads it. Every field is optional and
 * nullable on purpose: erasure redacts a party in place, and a snapshot
 * written by a later schema may carry fields this one does not know. A
 * contract that fails to draw because a phone number is missing is a
 * contract nobody can download on the day something goes wrong.
 *
 * Pure TypeScript, no Deno and no npm imports: the Next unit tests import
 * this file too.
 */

export type Side = 'carrier' | 'client';

export interface SnapshotCompany {
  kind: 'company';
  id?: string | null;
  legal_name?: string | null;
  display_name?: string | null;
  cui?: string | null;
  reg_com?: string | null;
  vat_payer?: boolean | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  legal_representative?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  verification_status?: string | null;
  verified_at?: string | null;
}

export interface SnapshotIndividual {
  kind: 'individual';
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export type SnapshotParty = SnapshotCompany | SnapshotIndividual;

export interface SnapshotDocument {
  kind?: string | null;
  label?: string | null;
  number?: string | null;
  issued_at?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  reviewed_at?: string | null;
}

export interface SnapshotPlace {
  city?: string | null;
  county?: string | null;
  country?: string | null;
}

export interface ContractSnapshot {
  schema?: number;
  template?: string | null;
  contract_number?: string | null;
  version?: number | null;
  generated_at?: string | null;
  generated_by?: { name?: string | null; side?: string | null } | null;
  operator?: {
    brand?: string | null;
    legal_name?: string | null;
    cui?: string | null;
    reg_com?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  order?: {
    id?: string | null;
    created_at?: string | null;
    status?: string | null;
    agreed_price?: number | string | null;
    currency?: string | null;
    payment_term_days?: number | null;
    pickup_from?: string | null;
    pickup_to?: string | null;
    delivery_from?: string | null;
    delivery_to?: string | null;
    cmr_number?: string | null;
  } | null;
  offer?: {
    id?: string | null;
    price_amount?: number | string | null;
    currency?: string | null;
    payment_term_days?: number | null;
    conditions?: string | null;
    estimated_pickup_date?: string | null;
    estimated_delivery_date?: string | null;
    accepted_at?: string | null;
  } | null;
  request?: {
    id?: string | null;
    title?: string | null;
    description?: string | null;
    service_type?: string | null;
    loading?: SnapshotPlace | null;
    unloading?: SnapshotPlace | null;
    loading_from?: string | null;
    loading_to?: string | null;
    unloading_from?: string | null;
    unloading_to?: string | null;
  } | null;
  cargo?: {
    category?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
    plate_number?: string | null;
    is_running?: boolean | null;
    wheels_turn?: boolean | null;
    steering_works?: boolean | null;
    brakes_work?: boolean | null;
    has_keys?: boolean | null;
    needs_winch?: boolean | null;
    is_damaged?: boolean | null;
    damage_notes?: string | null;
    weight_kg?: number | null;
  } | null;
  carrier?: SnapshotCompany | null;
  client?: SnapshotParty | null;
  credentials?: {
    company_documents?: SnapshotDocument[] | null;
    vehicle?: {
      source?: string | null;
      plate_number?: string | null;
      make?: string | null;
      model?: string | null;
      year?: number | null;
      vehicle_type?: string | null;
      copie_conforma_required?: boolean | null;
      documents?: SnapshotDocument[] | null;
    } | null;
  } | null;
}

export interface RenderAcceptance {
  version: number;
  side: Side;
  name?: string | null;
  company_name?: string | null;
  accepted_at: string;
  snapshot_hash?: string | null;
}

/** What `order_contract_render_data(p_contract_id)` returns. */
export interface RenderData {
  contract_id: string;
  order_id: string;
  version: number;
  contract_number: string;
  template_version: string;
  snapshot_hash: string;
  redacted: boolean;
  latest_version: number;
  snapshot: ContractSnapshot;
  acceptances: RenderAcceptance[];
}

/** A trimmed, non-empty string, or null. */
export function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** A finite number from a number or a numeric string (Postgres numeric arrives as either). */
export function amount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Checks the envelope the function receives before anything is drawn.
 * A shape that is wrong here is a bug on our side, not a user error, so
 * this throws rather than drawing half a contract.
 */
export function parseRenderData(value: unknown): RenderData {
  if (typeof value !== 'object' || value === null) throw new Error('render data: not an object');
  const v = value as Record<string, unknown>;
  const need = (key: string, kind: 'string' | 'number' | 'boolean' | 'object') => {
    if (typeof v[key] !== kind || v[key] === null) throw new Error(`render data: ${key} missing`);
  };
  need('contract_id', 'string');
  need('order_id', 'string');
  need('version', 'number');
  need('contract_number', 'string');
  need('template_version', 'string');
  need('snapshot_hash', 'string');
  need('latest_version', 'number');
  need('snapshot', 'object');
  const acceptances = Array.isArray(v.acceptances) ? v.acceptances : [];
  return {
    contract_id: v.contract_id as string,
    order_id: v.order_id as string,
    version: v.version as number,
    contract_number: v.contract_number as string,
    template_version: v.template_version as string,
    snapshot_hash: v.snapshot_hash as string,
    redacted: v.redacted === true,
    latest_version: v.latest_version as number,
    snapshot: v.snapshot as ContractSnapshot,
    acceptances: acceptances.filter(
      (a): a is RenderAcceptance =>
        typeof a === 'object' && a !== null &&
        typeof (a as RenderAcceptance).version === 'number' &&
        ((a as RenderAcceptance).side === 'carrier' || (a as RenderAcceptance).side === 'client') &&
        typeof (a as RenderAcceptance).accepted_at === 'string',
    ),
  };
}
