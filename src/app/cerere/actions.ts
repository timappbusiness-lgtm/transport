'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES, requestRoute } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { signInUrlFor } from '@/lib/auth/next-path';
import { toAppError } from '@/lib/errors';
import { countyCodeForCity } from '@/lib/counties';
import {
  coordinatesFor,
  isoToday,
  parseDraft,
  validateDraft,
  type RequestField,
} from '@/lib/request-form';
import { cacheKey, readCache, writeCache } from '@/lib/carrier-count';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import type { FieldErrors } from '@/lib/validation/auth';
import type { ListingStatus } from '@/lib/requests';

/**
 * Publishing a request.
 *
 * The form is open to everyone, including a visitor with no account, and
 * only this step needs one — which is why the draft lives in the browser
 * until here. What arrives is re-read from scratch: the client's copy of
 * the rules is a courtesy, this is the check, and `create_cargo_request` is
 * the boundary behind it.
 */

export interface PublishRequestState {
  error?: string;
  fieldErrors?: FieldErrors<RequestField>;
  /** Set when the visitor has no session yet. The form then asks for one. */
  needsAccount?: boolean;
  requestId?: string;
  status?: ListingStatus;
  /**
   * Why the request is still a draft: an unconfirmed telephone number, a
   * firm in review, the plan's limit. Written Romanian from the database,
   * shown as it is.
   */
  publishError?: string;
  /**
   * How many verified carriers cover this route in these dates.
   *
   * Null when the request did not go on the board, or when the count
   * itself failed: a missing number is shown as nothing at all, never as
   * a zero. „Nobody yet" and „we could not tell" are different sentences
   * and only one of them is reassuring to say wrongly.
   */
  matchingCarriers?: number | null;
}

export async function publishRequestAction(
  _previous: PublishRequestState,
  formData: FormData,
): Promise<PublishRequestState> {
  const draft = parseDraft(String(formData.get('draft') ?? ''));
  if (draft === null) return { error: 'Formularul s-a pierdut pe drum. Ia-o de la capăt.' };

  // A photo the person chose to attach, already in our own bucket under
  // their own folder. Re-checked here rather than trusted: the field is
  // in the form, so it is a path a browser could put anything into, and
  // the storage policy already refuses a folder that is not theirs.
  const photoPath = String(formData.get('photo_path') ?? '').trim();

  const errors = validateDraft(draft, isoToday(new Date()));
  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const context = await getAccountContext();
  if (context === null) return { needsAccount: true };

  if (!isSupabaseConfigured()) {
    return { error: 'Nu avem legătură cu baza de date. Cererea nu a fost salvată.' };
  }

  // A dispatcher posting from a firm's account posts for the firm; a
  // private person posts for themselves. Neither is asked which — the
  // session says it, and the database checks membership anyway.
  const companyId = context.activeCompany?.id ?? null;

  const from = coordinatesFor(draft.fromCity, draft.fromCountry);
  const to = coordinatesFor(draft.toCity, draft.toCountry);

  // Resolved here for the same reason as the coordinates: from the city
  // list on the server, never from the form. The county is what a
  // county-only carrier's coverage is matched against, so a browser that
  // could choose it could put a request in front of a firm that does not
  // serve it.
  const fromCounty = countyCodeForCity(draft.fromCity, draft.fromCountry);
  const toCounty = countyCodeForCity(draft.toCity, draft.toCountry);

  const photoPaths = photoPath !== '' && photoPath.startsWith(`${context.user.id}/`)
    ? [photoPath]
    : [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('create_cargo_request', {
      p_from_city: draft.fromCity.trim(),
      p_from_country: draft.fromCountry.toUpperCase(),
      p_to_city: draft.toCity.trim(),
      p_to_country: draft.toCountry.toUpperCase(),
      p_loading_from: draft.loadingFrom,
      p_loading_to: draft.loadingTo === '' ? null : draft.loadingTo,
      p_category: draft.category,
      p_make: draft.make.trim(),
      p_model: draft.model.trim(),
      p_year: Number(draft.year),
      p_is_running: draft.isRunning,
      p_wheels_turn: draft.wheelsTurn,
      p_steering_works: draft.steeringWorks,
      p_has_keys: draft.hasKeys,
      p_is_damaged: draft.isDamaged,
      p_damage_notes: draft.isDamaged ? draft.damageNotes.trim() : null,
      p_weight_kg: draft.weightKg.trim() === '' ? null : Number(draft.weightKg),
      p_service_type: draft.serviceType,
      p_description: draft.description.trim() === '' ? null : draft.description.trim(),
      p_contact_name: draft.contactName.trim(),
      p_contact_phone: draft.contactPhone.trim(),
      p_contact_email: draft.contactEmail.trim(),
      p_company_id: companyId,
      p_photo_paths: photoPaths,
      p_publish: true,
      p_from_lat: from?.lat ?? null,
      p_from_lng: from?.lng ?? null,
      p_to_lat: to?.lat ?? null,
      p_to_lng: to?.lng ?? null,
      p_from_county: fromCounty,
      p_to_county: toCounty,
    });

  // A function returning a table comes back as an array of one. `.single()`
  // would say the same thing and lose the row's type on the way.
  const created = data?.[0];
  if (error || !created) {
    return { error: toAppError(error, 'requests.create').message };
  }

  revalidatePath(ROUTES.requests);
  revalidatePath(ROUTES.accountRequests);
  revalidatePath(ROUTES.home);

  // Only for a request that actually went on the board. A draft that the
  // database refused to publish has nothing to be reassured about yet.
  const matchingCarriers =
    created.request_status === 'active'
      ? await countCarriersFor(supabase, created.request_id)
      : null;

  return {
    requestId: created.request_id,
    status: created.request_status,
    matchingCarriers,
    // Null when it went on the board. The generated types cannot say so:
    // Postgres does not declare a column of a returned table nullable.
    ...(created.publish_error ? { publishError: created.publish_error } : {}),
  };
}

/**
 * The count for one request, or null.
 *
 * `count_matching_carriers` refuses a request that is not the caller's,
 * which is the whole access rule; there is nothing to check here. A
 * failure returns null rather than zero, because the screen has a
 * sentence for „nobody yet" and it is not the one to show when the
 * question could not be asked.
 */
async function countCarriersFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('count_matching_carriers', {
    p_listing_id: requestId,
  });
  if (error || typeof data !== 'number') return null;
  return data;
}

/** What `/cont/cereri` needs, kept next to the action that creates a request. */
export interface RequestActionState {
  error?: string;
  notice?: string;
}

async function requireSession() {
  const context = await getAccountContext();
  if (context === null) return null;
  return context;
}

function revalidateRequestPages(): void {
  revalidatePath(ROUTES.accountRequests);
  revalidatePath(ROUTES.requests);
  revalidatePath(ROUTES.account);
  revalidatePath(ROUTES.home);
}

/** Put a draft, or a request that expired, back on the board. */
export async function publishExistingRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requireSession();
  if (context === null) return { error: 'Intră în cont ca să publici cererea.' };

  const id = String(formData.get('request_id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.rpc('publish_cargo_request', { p_id: id });

  if (error) return { error: toAppError(error, 'requests.publish').message };
  revalidateRequestPages();
  return { notice: 'Cererea este pe panou.' };
}

/** Take it off the board. The row stays; only its status changes. */
export async function cancelRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requireSession();
  if (context === null) return { error: 'Intră în cont ca să retragi cererea.' };

  const id = String(formData.get('request_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_cargo_request', {
    p_id: id,
    p_reason: reason === '' ? null : reason,
  });

  if (error) return { error: toAppError(error, 'requests.cancel').message };
  revalidateRequestPages();
  return { notice: 'Cererea a fost retrasă de pe panou.' };
}

/**
 * Back on the board with new dates.
 *
 * New dates are required rather than optional: reopening on the old ones is
 * how a board fills with requests nobody can serve.
 */
export async function reopenRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requireSession();
  if (context === null) return { error: 'Intră în cont ca să republici cererea.' };

  const id = String(formData.get('request_id') ?? '');
  const loadingFrom = String(formData.get('loading_from') ?? '');
  const loadingTo = String(formData.get('loading_to') ?? '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(loadingFrom)) {
    return { error: 'Alege data de la care poate fi încărcat.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_cargo_request', {
    p_id: id,
    p_loading_from: loadingFrom,
    p_loading_to: /^\d{4}-\d{2}-\d{2}$/.test(loadingTo) ? loadingTo : null,
  });

  if (error) return { error: toAppError(error, 'requests.reopen').message };
  revalidateRequestPages();
  return { notice: 'Cererea este din nou pe panou.' };
}

// ---------------------------------------------------------------------
// The contact on a request
// ---------------------------------------------------------------------

export interface RevealRequestState {
  error?: string;
  contact?: { name: string | null; phone: string | null; email: string | null };
}

/**
 * Opening the client's telephone number.
 *
 * The decision is entirely `reveal_contact`'s: it checks the caller's
 * company, its compliance, that the listing is active and that the plan has
 * a contact left this month, spends one, and logs the opening. It refuses
 * with a written Romanian message saying what to do next, which is shown as
 * it is rather than replaced with something generic.
 */
export async function revealRequestContactAction(
  _previous: RevealRequestState,
  formData: FormData,
): Promise<RevealRequestState> {
  const id = String(formData.get('request_id') ?? '');

  const context = await getAccountContext();
  if (context === null) redirect(signInUrlFor(requestRoute(id)));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reveal_contact', {
    p_cargo_listing_id: id,
    p_truck_listing_id: undefined,
  });

  if (error) return { error: toAppError(error, 'cereri.revealContact').message };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { error: 'Cererea nu are date de contact.' };

  return {
    contact: {
      name: row.contact_name ?? null,
      phone: row.contact_phone ?? null,
      email: row.contact_email ?? null,
    },
  };
}

/**
 * The same count, before the request exists.
 *
 * Step 4 of the form has nothing in the database yet, so this takes the
 * route itself. Two things guard it, and both are deliberate:
 *
 *   * The county is resolved here, from the city list on the server,
 *     exactly as `publishRequestAction` does. A county that arrived from
 *     the browser would be a route somebody chose rather than one they
 *     typed, and county is what a county-only carrier is matched on.
 *   * `preview_matching_carriers` counts every call against an hourly
 *     cap. A route askable in a loop is a carrier base mappable in a
 *     loop, and the cap is in the database so the loop cannot go round
 *     this action.
 *
 * The short memo in front of it is not a way round the cap: a cache hit
 * is the same question, not a new one, and somebody stepping back and
 * forth between two steps should not spend their hour on it.
 */
export async function previewCarriersAction(input: {
  fromCity: string;
  fromCountry: string;
  toCity: string;
  toCountry: string;
  loadingFrom: string;
  loadingTo: string;
  category: string;
  isRunning: boolean;
  wheelsTurn: boolean;
  steeringWorks: boolean;
  serviceType: string;
}): Promise<{ count: number | null; error?: string }> {
  const context = await getAccountContext();
  if (context === null) return { count: null };
  if (!isSupabaseConfigured()) return { count: null };

  const fromCounty = countyCodeForCity(input.fromCity, input.fromCountry);
  const toCounty = countyCodeForCity(input.toCity, input.toCountry);
  const loadingTo = input.loadingTo === '' ? null : input.loadingTo;

  // Derived exactly as the generated column in `cargo_vehicle_details`
  // derives it, so the preview and the published request cannot disagree.
  const needsWinch = !input.isRunning || !input.wheelsTurn || !input.steeringWorks;

  const key = cacheKey(context.user.id, [
    input.fromCountry,
    fromCounty,
    input.toCountry,
    toCounty,
    input.loadingFrom,
    loadingTo,
    input.category,
    needsWinch,
    input.serviceType,
  ]);

  const cached = readCache(key);
  if (cached !== null) return { count: cached };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('preview_matching_carriers', {
    p_loading_country: input.fromCountry.toUpperCase(),
    p_loading_county: fromCounty,
    p_unloading_country: input.toCountry.toUpperCase(),
    p_unloading_county: toCounty,
    p_loading_from: input.loadingFrom,
    p_loading_to: loadingTo,
    p_category: input.category as never,
    p_needs_winch: needsWinch,
    p_service_type: input.serviceType as never,
  });

  if (error || typeof data !== 'number') {
    return { count: null, error: toAppError(error, 'requests.preview').message };
  }

  writeCache(key, data);
  return { count: data };
}
