'use server';

import { revalidatePath } from 'next/cache';
import { updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import { getAccountContext } from '@/lib/auth/account';
import { DIRECTORY_TAG } from '@/lib/directory-source';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * The lists a firm picks its capabilities from.
 *
 * `set_equipment_option` and `set_service_option` are SECURITY DEFINER,
 * check staff membership themselves and write the before/after pair to
 * `audit_log`. There is no table grant that would let this action write a
 * row directly, so the check below produces a better message and is not
 * the rule.
 *
 * A code is written once and then frozen: it is stored in every company
 * row that ticked it, and renaming one would quietly unset them all.
 * Retiring an option is `is_active = false`, which stops it being offered
 * and leaves the firms that have it alone.
 */

export interface OptionActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

const NO_ACCESS = 'Doar echipa platformei poate modifica aceste liste.';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function setOption(
  kind: 'equipment' | 'service',
  formData: FormData,
): Promise<OptionActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: NO_ACCESS };

  const code = text(formData, 'code').trim().toLowerCase();
  const label = text(formData, 'label').trim();
  const description = text(formData, 'description').trim();
  const order = Number(text(formData, 'sortOrder').trim() || '100');

  const fieldErrors: Record<string, string> = {};
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(code)) {
    fieldErrors.code = 'Litere mici, cifre și liniuță de subliniere, între 2 și 41 de caractere.';
  }
  if (label.length < 2 || label.length > 60) {
    fieldErrors.label = 'Denumirea are între 2 și 60 de caractere.';
  }
  if (!Number.isInteger(order)) {
    fieldErrors.sortOrder = 'Ordinea este un număr întreg.';
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    kind === 'equipment' ? 'set_equipment_option' : 'set_service_option',
    {
      p_code: code,
      p_label_ro: label,
      p_description_ro: description === '' ? null : description,
      p_sort_order: order,
      p_is_active: formData.get('isActive') === 'on',
    },
  );

  if (error) return { error: toAppError(error, `admin.${kind}Option`).message };

  revalidatePath(ROUTES.adminOptions);
  revalidatePath(ROUTES.accountCompany);
  // A retired option disappears from every public profile that shows it.
  updateTag(DIRECTORY_TAG);
  return { notice: firmaCopy.admin.saved };
}

export async function setEquipmentOptionAction(
  _previous: OptionActionState,
  formData: FormData,
): Promise<OptionActionState> {
  return setOption('equipment', formData);
}

export async function setServiceOptionAction(
  _previous: OptionActionState,
  formData: FormData,
): Promise<OptionActionState> {
  return setOption('service', formData);
}
