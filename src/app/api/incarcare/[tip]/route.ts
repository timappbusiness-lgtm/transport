import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES, transportRoute } from '@/config/routes';
import { getAccountContext, type AccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { normaliseImage } from '@/lib/listing-image';
import { MAX_FILE_BYTES } from '@/lib/photo-upload';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import {
  attachmentPath,
  evidencePath,
  isDuplicateObject,
  isDuplicateRow,
  isUploadKind,
  isUuid,
  requestPhotoPath,
} from '@/lib/uploads/paths';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * One photograph, re-encoded here and stored under the id the browser
 * chose for it.
 *
 * A route rather than a server action for one reason: the browser can
 * report the progress of an `XMLHttpRequest`, and cannot for an action.
 * Everything else is what the actions did — the session is the caller's,
 * the bucket and table policies are the rule, and `normaliseImage` strips
 * every EXIF block (a phone photograph's coordinates are somebody's
 * address) before a byte is stored.
 *
 * Idempotent on the id: the object path and the row id both come from it,
 * so a retry after a lost answer finds what the first attempt made and
 * answers as if it had made it now. Nothing is ever stored twice.
 *
 * The answers are JSON with a Romanian `error` the screen shows as it is:
 * 401 for no session (the file stays; sign in and retry), 413 too large,
 * 422 not a photograph, 400 a request the screen should not have made.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tip: string }> },
): Promise<Response> {
  const { tip } = await params;
  if (!isUploadKind(tip)) return answer(404, { error: 'Nu există.' });
  // A server action checks the origin by itself; a route does not. The
  // session cookie is SameSite=Lax already — this is the second net, so a
  // page elsewhere cannot post delivery evidence as a signed-in driver.
  if (!sameOrigin(request)) return answer(403, { error: 'Cererea nu vine de pe site.' });
  if (!isSupabaseConfigured()) return answer(503, { error: 'Încărcarea nu este disponibilă acum.' });

  const context = await getAccountContext();
  if (context === null) return answer(401, { error: 'Sesiunea a expirat. Intră din nou în cont, apoi încearcă din nou.' });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return answer(400, { error: 'Nu am primit fișierul întreg. Încearcă din nou.' });
  }

  const id = form.get('id');
  if (!isUuid(id)) return answer(400, { error: 'Fișierul nu are un identificator valid.' });

  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return answer(400, { error: 'Nu am primit nicio poză.' });
  if (file.size > MAX_FILE_BYTES) return answer(413, { error: 'Poza este prea mare. Maximum 10 MB.' });

  let bytes: Buffer;
  try {
    bytes = await normaliseImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    // A file sharp refuses is not a photograph, whatever it is called.
    return answer(422, { error: 'Fișierul nu pare o poză pe care o putem folosi. Încearcă un JPG sau un PNG.' });
  }

  const supabase = await createClient();
  switch (tip) {
    case 'poza-cerere':
      return requestPhoto(supabase, context, id, bytes);
    case 'dovada':
      return evidence(supabase, context, id, bytes, form);
    case 'atasament':
      return attachment(supabase, context, id, bytes, form);
  }
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (origin !== null) {
    try {
      return new URL(origin).host === request.nextUrl.host || new URL(origin).host === request.headers.get('host');
    } catch {
      return false;
    }
  }
  // No Origin (an old browser): the fetch metadata, when there is any.
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

function answer(status: number, body: Record<string, unknown>): Response {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? '').trim();
}

/** Stores the object; an object already at the path is the earlier attempt's. */
async function store(supabase: Supabase, bucket: string, path: string, bytes: Buffer, context: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error && !isDuplicateObject(error as { message?: unknown; statusCode?: unknown })) {
    console.error(`[incarcare] ${context} storage failed`, { message: error.message });
    return answer(500, { error: toAppError(error, `incarcare.${context}`).message });
  }
  return null;
}

/** A request's photograph: an object only; the form carries its path until publishing. */
async function requestPhoto(supabase: Supabase, context: AccountContext, id: string, bytes: Buffer) {
  const path = requestPhotoPath(context.user.id, id);
  const failed = await store(supabase, 'listing-photos', path, bytes, 'poza-cerere');
  return failed ?? answer(200, { ok: true, path });
}

/** A pickup or delivery photograph: the object, then its row under the same id. */
async function evidence(supabase: Supabase, context: AccountContext, id: string, bytes: Buffer, form: FormData) {
  const orderId = field(form, 'order_id');
  const kind = field(form, 'kind');
  if (!isUuid(orderId) || kind === '') return answer(400, { error: 'Lipsește comanda.' });

  const path = evidencePath(orderId, id);
  const { data: existing } = await supabase.from('order_evidence').select('id').eq('id', id).maybeSingle();
  if (existing) return answer(200, { ok: true, id, path });

  const failed = await store(supabase, 'order-evidence', path, bytes, 'dovada');
  if (failed) return failed;

  const lat = Number(field(form, 'lat'));
  const lng = Number(field(form, 'lng'));
  const hasGeo = field(form, 'lat') !== '' && Number.isFinite(lat) && Number.isFinite(lng);
  const note = field(form, 'note');

  const { error } = await supabase.from('order_evidence').insert({
    id,
    order_id: orderId,
    kind: kind as never,
    file_path: path,
    note: note === '' ? null : note,
    uploaded_by: context.user.id,
    company_id: context.activeCompany?.id ?? null,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
  });
  if (error && !isDuplicateRow(error)) {
    return answer(error.code === '42501' ? 403 : 400, { error: toAppError(error, 'orders.evidence').message });
  }

  revalidatePath(ROUTES.accountTransports);
  revalidatePath(transportRoute(orderId));
  return answer(200, { ok: true, id, path });
}

/**
 * A message's image. The message exists already — the text goes first, so
 * a lost image never leaves an object that belongs to nothing — and the
 * image joins it under its own id.
 */
async function attachment(supabase: Supabase, context: AccountContext, id: string, bytes: Buffer, form: FormData) {
  const conversationId = field(form, 'conversation_id');
  const messageId = field(form, 'message_id');
  if (!isUuid(conversationId) || !isUuid(messageId)) return answer(400, { error: 'Lipsește mesajul.' });

  // Before the count guard: the fifth image, sent again, is already there.
  const { data: existing } = await supabase.from('message_attachments').select('id').eq('id', id).maybeSingle();
  const path = attachmentPath(conversationId, messageId, id);
  if (existing) return answer(200, { ok: true, id, path });

  const failed = await store(supabase, 'message-attachments', path, bytes, 'atasament');
  if (failed) return failed;

  const { error } = await supabase.from('message_attachments').insert({
    id,
    message_id: messageId,
    conversation_id: conversationId,
    file_path: path,
    uploaded_by: context.user.id,
    bytes: bytes.length,
  });
  if (error && !isDuplicateRow(error)) {
    return answer(error.code === '42501' ? 403 : 400, { error: toAppError(error, 'mesaje.attach').message });
  }

  revalidatePath(`${ROUTES.accountMessages}/${conversationId}`);
  return answer(200, { ok: true, id, path });
}
