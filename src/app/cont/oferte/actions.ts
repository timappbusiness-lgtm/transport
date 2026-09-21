'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES, requestRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { validateOffer, type Currency, type OfferDraft } from '@/lib/offers';
import { loadOfferSettings } from '@/lib/offers-source';
import { createClient } from '@/lib/supabase/server';

export interface OfferState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Set when the plan is full, so the form can link to /abonamente. */
  quotaReached?: boolean;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function currency(value: string): Currency {
  return value === 'EUR' ? 'EUR' : 'RON';
}

/**
 * Sending an offer.
 *
 * Straight into the table, because the rules are triggers rather than an
 * RPC: `guard_offer_insert()` from phase 0 checks the listing and the
 * firm's standing, `guard_offer_terms()` checks the terms, and the
 * partial unique index refuses a second pending offer. The validation
 * below is the same rule applied early so somebody does not lose what
 * they typed — it decides nothing.
 */
export async function sendOfferAction(
  _previous: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const context = await requireAccountContext(ROUTES.accountOffers);

  const listingId = text(formData, 'listing_id');
  const loadingFrom = text(formData, 'loading_from');
  if (listingId === '') return { error: 'Lipsește cererea.' };

  const draft: OfferDraft = {
    price: text(formData, 'price'),
    currency: currency(text(formData, 'currency')),
    pickupDate: text(formData, 'pickup_date'),
    deliveryDate: text(formData, 'delivery_date'),
    vehicleId: text(formData, 'vehicle_id'),
    conditions: text(formData, 'conditions'),
    paymentTermDays: text(formData, 'payment_term_days'),
    validityHours: text(formData, 'validity_hours'),
    message: text(formData, 'message'),
  };

  const company = context.activeCompany;
  const settings = await loadOfferSettings();
  const fieldErrors = validateOffer(draft, {
    loadingFrom,
    needsVehicle: company !== null && company.company_type !== 'expeditie',
    settings,
  });
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const hours = Number(draft.validityHours);
  const supabase = await createClient();
  const { error } = await supabase.from('offers').insert({
    cargo_listing_id: listingId,
    from_company_id: company?.id ?? null,
    from_user_id: context.user.id,
    price_amount: Number(draft.price.replace(',', '.')),
    currency: draft.currency,
    estimated_pickup_date: draft.pickupDate === '' ? null : draft.pickupDate,
    estimated_delivery_date: draft.deliveryDate === '' ? null : draft.deliveryDate,
    vehicle_id: draft.vehicleId === '' ? null : draft.vehicleId,
    conditions: draft.conditions === '' ? null : draft.conditions,
    payment_term_days: draft.paymentTermDays === '' ? null : Number(draft.paymentTermDays),
    message: draft.message === '' ? null : draft.message,
    valid_until: new Date(Date.now() + hours * 3_600_000).toISOString(),
  });

  if (error) {
    const message = toAppError(error, 'offers.send').message;
    // The partial unique index is the rule; this is its sentence.
    if (error.code === '23505') {
      return {
        error: 'Ai deja o ofertă în așteptare pe cererea asta. Retrage-o întâi dacă vrei să trimiți alta.',
      };
    }
    return { error: message, quotaReached: /limita de \d+ oferte/i.test(message) };
  }

  revalidatePath(ROUTES.accountOffers);
  revalidatePath(requestRoute(listingId));
  return { notice: offersCopy.form.sent };
}

/** Taking it back. The carrier's own, and only while it is pending. */
export async function withdrawOfferAction(
  _previous: OfferState,
  formData: FormData,
): Promise<OfferState> {
  await requireAccountContext(ROUTES.accountOffers);

  const id = text(formData, 'offer_id');
  if (id === '') return { error: 'Lipsește oferta.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('withdraw_offer', { p_offer_id: id });
  if (error) return { error: toAppError(error, 'offers.withdraw').message };

  revalidatePath(ROUTES.accountOffers);
  return { notice: offersCopy.sent.withdrawn };
}

/** Refusing one, from the client's side. */
export async function rejectOfferAction(
  _previous: OfferState,
  formData: FormData,
): Promise<OfferState> {
  await requireAccountContext(ROUTES.accountOffers);

  const id = text(formData, 'offer_id');
  const listingId = text(formData, 'listing_id');
  if (id === '') return { error: 'Lipsește oferta.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_offer', { p_offer_id: id });
  if (error) return { error: toAppError(error, 'offers.reject').message };

  revalidatePath(ROUTES.accountOffers);
  if (listingId !== '') revalidatePath(`${ROUTES.accountRequests}/${listingId}`);
  return { notice: offersCopy.received.rejected };
}

/**
 * Accepting.
 *
 * `accept_offer()` does the whole of it under a lock: accepts, rejects
 * the others, assigns the request, creates the order and writes the
 * audit row. Nothing is decided here, including whether an individual's
 * telephone has been confirmed — that refusal is the database's own
 * Romanian sentence and is shown exactly as written.
 */
export async function acceptOfferAction(
  _previous: OfferState,
  formData: FormData,
): Promise<OfferState> {
  await requireAccountContext(ROUTES.accountOffers);

  const id = text(formData, 'offer_id');
  const listingId = text(formData, 'listing_id');
  if (id === '') return { error: 'Lipsește oferta.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: id });
  if (error) return { error: toAppError(error, 'offers.accept').message };

  revalidatePath(ROUTES.accountOffers);
  if (listingId !== '') revalidatePath(`${ROUTES.accountRequests}/${listingId}`);
  return { notice: offersCopy.accept.done };
}

/**
 * Asking a question, or answering one.
 *
 * The thread is opened on demand and the message goes in as written —
 * `guard_message_contacts()` masks it on the way in, and what comes
 * back is what was stored.
 */
export async function askOfferAction(
  _previous: OfferState,
  formData: FormData,
): Promise<OfferState> {
  const context = await requireAccountContext(ROUTES.accountOffers);

  const offerId = text(formData, 'offer_id');
  const body = text(formData, 'body');
  if (offerId === '') return { error: 'Lipsește oferta.' };
  if (body === '') return { error: 'Scrie întrebarea.' };

  const supabase = await createClient();
  const { data: thread, error: threadError } = await supabase.rpc('open_offer_thread', {
    p_offer_id: offerId,
  });
  if (threadError) return { error: toAppError(threadError, 'offers.thread').message };

  const conversationId = (thread as { id: string } | null)?.id;
  if (conversationId === undefined) return { error: 'Nu am putut deschide discuția.' };

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_user_id: context.user.id,
    body,
  });
  if (error) return { error: toAppError(error, 'offers.message').message };

  revalidatePath(ROUTES.accountOffers);
  return {};
}

export interface ContactsState {
  error?: string;
  contacts?: {
    side: string;
    displayName: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    transportId: string | null;
  };
}

/**
 * The other party's telephone number, once there is an order.
 *
 * Nothing is decided here. `order_contacts()` checks that a transport
 * exists and that the caller is one of its two parties, records the
 * reveal with the reason „comandă confirmată" and charges nobody. Its
 * refusals are written Romanian sentences and are shown as written.
 */
export async function orderContactsAction(
  _previous: ContactsState,
  formData: FormData,
): Promise<ContactsState> {
  await requireAccountContext(ROUTES.accountOffers);

  const offerId = text(formData, 'offer_id');
  if (offerId === '') return { error: 'Lipsește oferta.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_contacts', { p_offer_id: offerId });
  if (error) return { error: toAppError(error, 'offers.contacts').message };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { error: 'Comanda nu are date de contact.' };

  return {
    contacts: {
      side: row.side,
      displayName: row.display_name ?? null,
      name: row.contact_name ?? null,
      phone: row.contact_phone ?? null,
      email: row.contact_email ?? null,
      transportId: row.transport_id ?? null,
    },
  };
}
