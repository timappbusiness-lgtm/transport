import 'server-only';

import { cache } from 'react';
import type { AccountContext } from './auth/account';
import { carries, journeyStage, uploadMinutes, type JourneyStage } from './carrier-journey';
import { countChecklist, type RequirementRow } from './document-checklist';
import { isRequirementState } from './documents';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';
import type { CompanyType } from './validation/auth';

/**
 * Everything the journey needs to know about the signed-in firm, in one
 * round trip per table: its vehicles and what each requirement's state is.
 *
 * Read through the same views the documents screen and the review use
 * (`v_company_missing_documents`, `v_vehicle_missing_documents`), so the
 * banner, the screen and `company_review_readiness()` count the same rows.
 */

export interface JourneyVehicle {
  id: string;
  plate: string;
  type: string;
}

export interface Journey {
  stage: JourneyStage;
  companyType: CompanyType | null;
  vehicles: JourneyVehicle[];
  rows: RequirementRow[];
  /** „Durează aproximativ X minute să le încarci" — for what is still missing. */
  minutes: number;
}

/**
 * The documents a new carrier will be asked for, before there is a firm to
 * read them from: the blocking ones for a transport firm with one car
 * transporter, which is who signs up. Read from `document_requirements`,
 * not written down here, so a requirement added there shows up here.
 */
const newCarrierDocumentCount = cache(async (): Promise<number> => {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data } = await supabase
    .from('document_requirements')
    .select('scope, for_company_types, for_vehicle_types, excluded_vehicle_types')
    .eq('is_active', true)
    .eq('is_blocking', true)
    .in('scope', ['company', 'vehicle']);
  let count = 0;
  for (const row of data ?? []) {
    if (row.scope === 'company') {
      const types = row.for_company_types as string[] | null;
      if (types === null || types.length === 0 || types.includes('transport')) count += 1;
    } else {
      const included = row.for_vehicle_types as string[] | null;
      const excluded = row.excluded_vehicle_types as string[] | null;
      const applies =
        (included === null || included.length === 0 || included.includes('platforma_auto')) &&
        !(excluded ?? []).includes('platforma_auto');
      if (applies) count += 1;
    }
  }
  return count;
});

export const loadJourney = cache(async (context: AccountContext): Promise<Journey> => {
  const company = context.activeCompany;
  if (company === null) {
    return {
      stage: 'no_company',
      companyType: null,
      vehicles: [],
      rows: [],
      minutes: uploadMinutes(await newCarrierDocumentCount()),
    };
  }

  if (!isSupabaseConfigured()) {
    return { stage: 'documents', companyType: company.company_type as CompanyType, vehicles: [], rows: [], minutes: 0 };
  }
  const supabase = await createClient();
  const [vehicles, companyDocs, vehicleDocs] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .order('created_at'),
    supabase
      .from('v_company_missing_documents')
      .select('kind, label_ro, is_blocking, state, valid_until')
      .eq('company_id', company.id),
    supabase
      .from('v_vehicle_missing_documents')
      .select('vehicle_id, kind, label_ro, is_blocking, state, valid_until')
      .eq('company_id', company.id),
  ]);

  const rows: RequirementRow[] = [];
  for (const row of companyDocs.data ?? []) {
    if (row.kind === null || !isRequirementState(row.state)) continue;
    rows.push({
      scope: 'company',
      kind: row.kind,
      label: row.label_ro ?? row.kind,
      isBlocking: row.is_blocking === true,
      state: row.state,
      validUntil: row.valid_until,
    });
  }
  for (const row of vehicleDocs.data ?? []) {
    if (row.kind === null || row.vehicle_id === null || !isRequirementState(row.state)) continue;
    rows.push({
      scope: 'vehicle',
      kind: row.kind,
      label: row.label_ro ?? row.kind,
      isBlocking: row.is_blocking === true,
      state: row.state,
      validUntil: row.valid_until,
      vehicleId: row.vehicle_id,
    });
  }

  const list: JourneyVehicle[] = (vehicles.data ?? []).map((v) => ({
    id: v.id,
    plate: v.plate_number,
    type: v.vehicle_type,
  }));
  const companyType = company.company_type as CompanyType;
  const { blockingMissing } = countChecklist(rows);
  const stage = journeyStage({
    company: {
      companyType,
      verificationStatus: company.verification_status,
      isSuspended: company.is_suspended,
    },
    vehicleCount: list.length,
    blockingMissing,
  });

  // A carrier with no vehicle yet will also owe the first vehicle's
  // documents: count them in, or the estimate is short by half.
  let owed = blockingMissing;
  if (carries(companyType) && list.length === 0) {
    owed += Math.max(0, (await newCarrierDocumentCount()) - countChecklist(rows.filter((r) => r.scope === 'company')).blockingTotal);
  }

  return { stage, companyType, vehicles: list, rows, minutes: uploadMinutes(owed) };
});
