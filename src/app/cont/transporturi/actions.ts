'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES, transportRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { validateChecklist, type ChecklistValues } from '@/lib/orders';
import { CONDITION_CHECKLIST } from '@/lib/orders';
import { createClient } from '@/lib/supabase/server';

export interface OrderState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/** Both screens that show an order, so neither goes stale after an action. */
function refresh(orderId: string) {
  revalidatePath(transportRoute(orderId));
  revalidatePath(ROUTES.accountTransports);
}

/**
 * Moving the order one step.
 *
 * Nothing is decided here. `transition_order()` checks from, to, the
 * caller and the evidence, and refuses with a written Romanian sentence
 * that says what is missing — which is shown exactly as written, because
 * „mai ai nevoie de 2 fotografii la ridicare" is more useful than
 * anything this file could invent.
 */
export async function transitionOrderAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  const to = text(formData, 'to');
  if (orderId === '' || to === '') return { error: 'Lipsește comanda.' };

  const payload: Record<string, string> = {};
  for (const key of ['pickup_from', 'pickup_to', 'delivery_from', 'delivery_to', 'note', 'code']) {
    const value = text(formData, key);
    if (value !== '') payload[key] = key === 'code' ? value.replace(/\D/g, '') : value;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_to: to as never,
    p_payload: payload,
  });
  if (error) return { error: toAppError(error, 'orders.transition').message };

  refresh(orderId);
  return {};
}

/** Choosing who drives it, and in what. */
export async function assignCrewAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  const driverId = text(formData, 'driver_id');
  const vehicleId = text(formData, 'vehicle_id');
  if (orderId === '') return { error: 'Lipsește comanda.' };

  const fieldErrors: Record<string, string> = {};
  if (driverId === '') fieldErrors.driver_id = 'Alege șoferul.';
  if (vehicleId === '') fieldErrors.vehicle_id = 'Alege vehiculul.';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_order_crew', {
    p_order_id: orderId,
    p_driver_id: driverId,
    p_vehicle_id: vehicleId,
  });
  if (error) return { error: toAppError(error, 'orders.assign').message };

  refresh(orderId);
  return {};
}

export async function cancelOrderAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  const reason = text(formData, 'reason');
  const relist = formData.get('relist') !== null;
  if (orderId === '') return { error: 'Lipsește comanda.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce anulezi.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
    p_relist: relist,
  });
  if (error) return { error: toAppError(error, 'orders.cancel').message };

  refresh(orderId);
  return { notice: ordersCopy.cancel.done };
}

export async function openDisputeAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  const category = text(formData, 'category');
  const reason = text(formData, 'reason');
  if (orderId === '') return { error: 'Lipsește comanda.' };

  const fieldErrors: Record<string, string> = {};
  if (category === '') fieldErrors.category = 'Alege ce s-a întâmplat.';
  if (reason === '') fieldErrors.reason = 'Scrie pe scurt ce s-a întâmplat.';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('open_order_dispute', {
    p_order_id: orderId,
    p_category: category,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'orders.dispute').message };

  refresh(orderId);
  return { notice: ordersCopy.dispute.done };
}

/**
 * The condition report.
 *
 * Validated here as well as refused there: `transition_order()` only
 * counts that a report exists, because a checklist is a shape rather
 * than a rule and putting nine field names in plpgsql would be nine
 * more things to keep in step. What the database does guarantee is that
 * once written it never changes.
 */
export async function saveChecklistAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  const context = await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  if (orderId === '') return { error: 'Lipsește comanda.' };

  const values: ChecklistValues = {};
  for (const item of CONDITION_CHECKLIST) values[item.key] = text(formData, item.key);

  const fieldErrors = validateChecklist(values);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from('order_evidence').insert({
    order_id: orderId,
    kind: 'condition_report',
    note: text(formData, 'note') || null,
    payload: values,
    uploaded_by: context.user.id,
    company_id: context.activeCompany?.id ?? null,
  });
  if (error) return { error: toAppError(error, 'orders.checklist').message };

  refresh(orderId);
  return { notice: ordersCopy.checklist.saved };
}

/** An incident, at any time after pickup. */
export async function addIncidentAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  const context = await requireAccountContext(ROUTES.accountTransports);

  const orderId = text(formData, 'order_id');
  const note = text(formData, 'note');
  if (orderId === '') return { error: 'Lipsește comanda.' };
  if (note === '') return { fieldErrors: { note: 'Scrie ce s-a întâmplat.' } };

  const supabase = await createClient();
  const { error } = await supabase.from('order_evidence').insert({
    order_id: orderId,
    kind: 'incident_note',
    note,
    uploaded_by: context.user.id,
    company_id: context.activeCompany?.id ?? null,
  });
  if (error) return { error: toAppError(error, 'orders.incident').message };

  refresh(orderId);
  return { notice: ordersCopy.evidence.incidentSaved };
}

// Photographs (pickup, delivery, the signature) go through
// `/api/incarcare/dovada`: a route, so the phone can show the progress,
// and idempotent on the id the phone chose, so a retry never adds a
// second row. There, as here before, sharp re-encodes every file — the
// EXIF block, with the coordinates of somebody's address, does not
// survive — and coordinates come only from the browser, when the driver
// allowed them, into two columns that can be seen and deleted.

/** Staff hiding one piece of evidence, with a reason that lands in the audit. */
export async function hideEvidenceAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.adminOrders);

  const evidenceId = text(formData, 'evidence_id');
  const orderId = text(formData, 'order_id');
  const reason = text(formData, 'reason');
  if (evidenceId === '') return { error: 'Lipsește dovada.' };
  if (reason === '') return { error: 'Scrie de ce o ascunzi. Motivul rămâne în jurnal.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_order_evidence', {
    p_evidence_id: evidenceId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.orders.hide').message };

  if (orderId !== '') revalidatePath(`${ROUTES.adminOrders}/${orderId}`);
  return { notice: ordersCopy.evidence.hidden_ok };
}

/** Staff closing a dispute, with a decision both parties read. */
export async function resolveDisputeAction(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  await requireAccountContext(ROUTES.adminOrders);

  const orderId = text(formData, 'order_id');
  const outcome = text(formData, 'outcome');
  const note = text(formData, 'note');
  if (orderId === '') return { error: 'Lipsește comanda.' };
  if (outcome !== 'order_completed' && outcome !== 'cancelled') {
    return { error: 'Alege cum se închide disputa.' };
  }
  if (note === '') return { fieldErrors: { note: 'Scrie decizia.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_order_dispute', {
    p_order_id: orderId,
    p_outcome: outcome as never,
    p_note: note,
  });
  if (error) return { error: toAppError(error, 'admin.orders.resolve').message };

  revalidatePath(`${ROUTES.adminOrders}/${orderId}`);
  revalidatePath(ROUTES.adminOrders);
  return { notice: ordersCopy.admin.resolve.done };
}
