'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { reportsCopy } from '@/content/sesizari';
import { toAppError } from '@/lib/errors';
import { isClosing, type ReportStatus } from '@/lib/reports';
import { createClient } from '@/lib/supabase/server';

export interface ReportAdminState {
  error?: string;
  notice?: string;
}

const STATUSES: readonly ReportStatus[] = ['open', 'investigating', 'resolved', 'dismissed'];

function status(value: FormDataEntryValue | null): ReportStatus | null {
  const text = String(value ?? '');
  return (STATUSES as readonly string[]).includes(text) ? (text as ReportStatus) : null;
}

/**
 * Moving a report along.
 *
 * Everything goes through `handle_report`, which is SECURITY DEFINER and
 * holds the whole rule: staff only, a written resolution before closing,
 * an `audit_log` row for every transition, and one e-mail to the person
 * who reported it. Nothing is decided here — the early refusal below
 * exists so somebody does not lose what they typed, not to enforce
 * anything.
 */
export async function handleReportAction(
  _previous: ReportAdminState,
  formData: FormData,
): Promise<ReportAdminState> {
  const id = String(formData.get('report_id') ?? '').trim();
  const next = status(formData.get('status'));
  const resolution = String(formData.get('resolution') ?? '').trim();
  const notes = String(formData.get('internal_notes') ?? '').trim();
  const takeIt = formData.get('assign_to_me') !== null;

  if (id === '') return { error: 'Lipsește sesizarea.' };
  if (next === null) return { error: 'Stare necunoscută pentru o sesizare.' };
  if (isClosing(next) && resolution === '') {
    return { error: reportsCopy.form.missingResolution };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('handle_report', {
    p_report_id: id,
    p_status: next,
    p_resolution: resolution === '' ? undefined : resolution,
    p_internal_notes: notes === '' ? undefined : notes,
    p_assign_to_me: takeIt,
  });

  if (error) return { error: toAppError(error, 'reports.handle').message };

  revalidatePath(ROUTES.adminReports);

  if (!isClosing(next)) return { notice: reportsCopy.notice.updated };

  // `handle_report` writes `reporter_notified_at` only when it found a
  // deliverable address, so the row is the honest answer to „did they
  // hear about it" — better than a cheerful message either way.
  const row = data as { reporter_notified_at: string | null } | null;
  return {
    notice:
      row?.reporter_notified_at == null
        ? reportsCopy.notice.closedNoEmail
        : reportsCopy.notice.closed,
  };
}
