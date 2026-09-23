'use server';

import { headers } from 'next/headers';
import { getAccountContext } from '@/lib/auth/account';
import { normaliseImage } from '@/lib/listing-image';
import { MAX_FILE_BYTES, ownsPhotoPath } from '@/lib/photo-upload';
import {
  ACCEPTED_IMAGE_TYPES,
  looksLikeListingUrl,
  type ExtractionResult,
} from '@/lib/listing-import';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

/**
 * Reading a car listing so the form does not have to be retyped.
 *
 * Both actions here are server-only for the same reason: they make
 * requests on somebody else's behalf. The browser hands over a link or a
 * photo and gets back fields; it never fetches a third-party page itself,
 * because a fetch from the browser would carry the person's own address
 * and cookies to a site they only wanted us to read.
 *
 * Nothing in this file writes a request. What it returns goes into a
 * draft that the person reads and corrects, and `create_cargo_request`
 * applies exactly the rules it always did.
 */

const FUNCTION = 'extract-vehicle-listing';

/** Bytes we are willing to accept from a browser, before resizing. */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** And from a listing site, which we did not ask to be reasonable. */
const MAX_REMOTE_IMAGE_BYTES = 12 * 1024 * 1024;


/**
 * The caller's address, forwarded so the function can count it.
 *
 * Without this the function would see Vercel's address for every
 * anonymous request, and one visitor would spend everybody's allowance.
 * It is forwarded, hashed there with a salt, and never stored as an
 * address by either side.
 */
async function callerAddress(): Promise<string> {
  const header = await headers();
  const forwarded = header.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first !== '' ? first : (header.get('x-real-ip') ?? '');
}

async function invokeExtractor(body: Record<string, unknown>): Promise<ExtractionResult> {
  if (!isSupabaseConfigured()) return { ok: false, reason: 'disabled' };

  const supabase = await createClient();
  const address = await callerAddress();

  const { data, error } = await supabase.functions.invoke<ExtractionResult>(FUNCTION, {
    body,
    // The function reads this only when there is no session to count
    // instead. A signed-in extraction never stores an address at all.
    ...(address === '' ? {} : { headers: { 'x-forwarded-for': address } }),
  });

  if (error) {
    // `invoke` turns a non-2xx into an error and keeps the body on it, and
    // the body is where the named reason lives. Without this, a daily
    // limit would read as "ceva nu a mers".
    const reason = await reasonFromInvokeError(error);
    return { ok: false, reason };
  }

  return data ?? { ok: false, reason: 'unknown' };
}

async function reasonFromInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { reason?: string };
      if (typeof body.reason === 'string') return body.reason;
    } catch {
      // A body that is not JSON tells us nothing more than the status did.
    }
  }
  return 'unknown';
}

export async function extractFromLinkAction(url: string): Promise<ExtractionResult> {
  if (!looksLikeListingUrl(url)) return { ok: false, reason: 'bad_request' };
  return invokeExtractor({ source: 'link', url: url.trim() });
}

export async function extractFromPhotoAction(formData: FormData): Promise<ExtractionResult> {
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) return { ok: false, reason: 'bad_request' };
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { ok: false, reason: 'bad_request' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too_large' };

  // Shrunk before it is sent, not after. A phone photo is several
  // megabytes of detail nobody reads, and the model is billed per pixel
  // as surely as the network is.
  let prepared: Buffer;
  try {
    prepared = await normaliseImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { ok: false, reason: 'bad_request' };
  }

  return invokeExtractor({
    source: 'photo',
    image_base64: prepared.toString('base64'),
    mime: 'image/jpeg',
  });
}

export interface AttachPhotoResult {
  ok: boolean;
  /** The path in our own bucket, for `create_cargo_request`. */
  path?: string;
  reason?: string;
}

/**
 * Downloads a photo the person chose, and puts our copy in our bucket.
 *
 * Only when they tick the box, which starts unticked. Three things this
 * does that a hotlink would not:
 *
 *   - The image is ours, so a request does not go blank the day the
 *     listing is taken down — which is usually the week the car sells.
 *   - The bytes are re-encoded, so the EXIF block, and the coordinates
 *     of somebody's driveway inside it, do not travel with the request.
 *   - The listing site does not get a hit from every carrier who opens
 *     the request, which is a request we never asked permission for.
 */
export async function attachListingPhotoAction(imageUrl: string): Promise<AttachPhotoResult> {
  const context = await getAccountContext();
  // The bucket is organised by account and its policy says so, so this is
  // the honest boundary rather than an arbitrary one.
  if (context === null) return { ok: false, reason: 'needs_account' };
  if (!looksLikeListingUrl(imageUrl)) return { ok: false, reason: 'bad_request' };

  let bytes: Buffer;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(imageUrl, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'image/*' },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return { ok: false, reason: 'fetch_failed' };
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
      return { ok: false, reason: 'not_html' };
    }

    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength > MAX_REMOTE_IMAGE_BYTES) return { ok: false, reason: 'too_large' };
    bytes = await normaliseImage(raw);
  } catch {
    return { ok: false, reason: 'fetch_failed' };
  }

  const supabase = await createClient();
  const path = `${context.user.id}/import-${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from('listing-photos')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) return { ok: false, reason: 'unknown' };
  return { ok: true, path };
}

// ---------------------------------------------------------------------
// The client's own photographs
// ---------------------------------------------------------------------

export type UploadPhotoResult =
  | { ok: true; path: string }
  | { ok: false; message: string };

/**
 * One photograph, from the person's phone into our bucket.
 *
 * The browser has already drawn it down to 2000px where it could, which
 * is a courtesy. This is where the guarantee is: `normaliseImage`
 * re-encodes with sharp, and sharp writes no metadata unless asked — so
 * the EXIF block, and the GPS coordinates inside it that say where the
 * car was photographed, do not survive. A canvas in a browser does the
 * same thing today in every browser anyone uses, and "every browser
 * anyone uses" is not something to rest a privacy property on.
 *
 * The file lands under the person's own id, which is what the bucket's
 * policy checks and what `ownsPhotoPath` checks again at publish time.
 */
export async function uploadRequestPhotoAction(formData: FormData): Promise<UploadPhotoResult> {
  const context = await getAccountContext();
  if (context === null) {
    return { ok: false, message: 'Intră în cont ca să adaugi poze la cerere.' };
  }

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Nu am primit nicio poză.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, message: 'Poza este prea mare. Maximum 10 MB.' };
  }

  let bytes: Buffer;
  try {
    bytes = await normaliseImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    // A file that sharp refuses is not a photograph, whatever it is
    // called. Saying so beats "a apărut o eroare".
    return {
      ok: false,
      message: 'Fișierul nu pare o poză pe care o putem folosi. Încearcă un JPG sau un PNG.',
    };
  }

  const supabase = await createClient();
  const path = `${context.user.id}/foto-${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from('listing-photos')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    console.error('[cerere] photo upload failed', { message: error.message });
    return { ok: false, message: 'Nu am putut salva poza. Mai încearcă o dată.' };
  }

  return { ok: true, path };
}

/**
 * Taking one back off, before the request is published.
 *
 * The storage policy already refuses a path that is not in this person's
 * folder, so this is not the boundary — it is the tidying. Without it, a
 * photo somebody added and then removed stays in a public bucket for
 * ever, attached to nothing and referenced by nothing.
 */
export async function removeRequestPhotoAction(path: string): Promise<void> {
  const context = await getAccountContext();
  if (context === null || !ownsPhotoPath(path, context.user.id)) return;

  const supabase = await createClient();
  await supabase.storage.from('listing-photos').remove([path]);
}

/**
 * Pictures for photos a draft brought back.
 *
 * A photo uploaded before a refresh is still in the bucket and still on
 * the draft, but its preview was a `blob:` URL of the page that is gone.
 * The bucket is private, so the preview comes back as a short-lived signed
 * link — only for paths in the caller's own folder, the same check the
 * publish action makes.
 */
export async function previewRequestPhotosAction(
  paths: readonly string[],
): Promise<Record<string, string>> {
  const context = await getAccountContext();
  if (context === null) return {};
  const own = paths.filter((path) => ownsPhotoPath(path, context.user.id)).slice(0, 6);
  if (own.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase.storage.from('listing-photos').createSignedUrls(own, 60 * 60);
  const previews: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) previews[item.path] = item.signedUrl;
  }
  return previews;
}
