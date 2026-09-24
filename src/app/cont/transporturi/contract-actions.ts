'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ROUTES, transportRoute } from '@/config/routes';
import { contractCopy } from '@/content/contract';
import { requireAccountContext } from '@/lib/auth/account';
import { clientIp, clientUserAgent, operatorBlock } from '@/lib/contracts';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface ContractState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function refresh(orderId: string) {
  revalidatePath(transportRoute(orderId));
  revalidatePath(`${ROUTES.adminOrders}/${orderId}`);
}

/**
 * A new version of the contract, from the order as it is now.
 *
 * The database builds the snapshot from its own tables; the only thing
 * sent from here is the operator's block from `src/config/company.ts`,
 * which lives in the application rather than in a table. Who may do it,
 * whether the order still allows it and how many versions it may have
 * are `generate_order_contract()`'s to decide, in Romanian.
 */
export async function generateContractAction(
  _previous: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const orderId = text(formData, 'order_id');
  await requireAccountContext(orderId === '' ? ROUTES.accountTransports : transportRoute(orderId));
  if (orderId === '') return { error: 'Lipsește comanda.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('generate_order_contract', {
    p_order_id: orderId,
    p_operator: operatorBlock(),
  });
  if (error) return { error: toAppError(error, 'contracts.generate').message };

  refresh(orderId);
  const version = Array.isArray(data) ? data[0]?.version : undefined;
  return typeof version === 'number' ? { notice: contractCopy.generated(version) } : {};
}

/**
 * One party accepting one version.
 *
 * The IP address and the browser are read here, from the request, and
 * never from the form: a value the person could type is not a record of
 * where they were. The database refuses a version that is no longer the
 * latest, a side that already accepted and staff acting for a party.
 */
export async function acceptContractAction(
  _previous: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const orderId = text(formData, 'order_id');
  const contractId = text(formData, 'contract_id');
  await requireAccountContext(orderId === '' ? ROUTES.accountTransports : transportRoute(orderId));
  if (orderId === '' || contractId === '') return { error: 'Lipsește contractul.' };
  if (formData.get('confirm') === null) {
    return { fieldErrors: { confirm: contractCopy.accept.confirmMissing } };
  }

  const requestHeaders = await headers();
  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_order_contract', {
    p_contract_id: contractId,
    p_ip: clientIp(requestHeaders) ?? undefined,
    p_user_agent: clientUserAgent(requestHeaders) ?? undefined,
  });
  if (error) return { error: toAppError(error, 'contracts.accept').message };

  refresh(orderId);
  return { notice: contractCopy.accept.done };
}
