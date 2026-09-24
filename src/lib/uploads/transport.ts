'use client';

import { createClient } from '@/lib/supabase/client';
import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * Sending a file with a progress bar, and saying precisely why it did not
 * go.
 *
 * `fetch` cannot report upload progress and a server action cannot either;
 * `XMLHttpRequest` can. Two targets:
 *
 *   - Supabase Storage, straight from the browser, for the files the
 *     bucket policies already let the person write (documents, the logo);
 *   - the app's own routes under `/api/incarcare`, for the photographs
 *     the server draws down and strips of their metadata first.
 *
 * Every failure is a `SendError` with a kind the screen turns into a
 * sentence and a retry — never a thrown `TypeError` that reaches the
 * error page.
 */

export type SendErrorKind = 'network' | 'session' | 'too_large' | 'refused' | 'server';

export class SendError extends Error {
  constructor(
    readonly kind: SendErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

/** What each kind means for the person, when the server did not say it better. */
export const SEND_ERROR_MESSAGES: Record<SendErrorKind, string> = {
  network: 'Conexiunea s-a întrerupt. Fișierul a rămas aici — încearcă din nou.',
  session: 'Sesiunea ta a expirat. Fișierul a rămas aici — intră din nou în cont, apoi încearcă din nou.',
  too_large: 'Fișierul e prea mare pentru a fi trimis. Alege o poză mai mică sau un PDF sub 10 MB.',
  refused: 'Serverul nu a primit fișierul. Fișierul a rămas aici — încearcă din nou.',
  server: 'Serverul a răspuns cu o eroare. Fișierul a rămas aici — încearcă din nou peste un minut.',
};

export interface SendResult {
  status: number;
  body: unknown;
}

/** One request, with its upload progress. Resolves on any HTTP answer; rejects only when there was none. */
export function sendWithProgress(options: {
  method: 'POST' | 'PUT';
  url: string;
  body: Blob | FormData;
  headers?: Record<string, string>;
  onProgress?: ((fraction: number) => void) | undefined;
  timeoutMs?: number;
}): Promise<SendResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url);
    xhr.timeout = options.timeoutMs ?? 120_000;
    for (const [name, value] of Object.entries(options.headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = xhr.responseText;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Not JSON: a gateway's HTML page, kept as text for the message.
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new SendError('network', SEND_ERROR_MESSAGES.network));
    xhr.ontimeout = () => reject(new SendError('network', SEND_ERROR_MESSAGES.network));
    xhr.onabort = () => reject(new SendError('network', SEND_ERROR_MESSAGES.network));
    xhr.send(options.body);
  });
}

/** The error an HTTP answer stands for, or null when it is a success. */
export function errorForAnswer(result: SendResult): SendError | null {
  if (result.status >= 200 && result.status < 300) return null;
  const said = messageIn(result.body);
  if (result.status === 401) return new SendError('session', SEND_ERROR_MESSAGES.session);
  if (result.status === 413) return new SendError('too_large', SEND_ERROR_MESSAGES.too_large);
  if (result.status >= 400 && result.status < 500) return new SendError('refused', said ?? SEND_ERROR_MESSAGES.refused);
  return new SendError('server', SEND_ERROR_MESSAGES.server);
}

function messageIn(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const value = (body as { error?: unknown; message?: unknown }).error ?? (body as { message?: unknown }).message;
    if (typeof value === 'string' && value.trim() !== '' && /[ăâîșț]/i.test(value)) return value;
  }
  return null;
}

/**
 * Storage's answer to an object that is already there. Asking again for
 * a path chosen once on the device means the first attempt got through
 * and only its answer was lost: that is a success, not a duplicate.
 */
export function isAlreadyThere(result: SendResult): boolean {
  if (result.status === 409) return true;
  const body = result.body as { error?: unknown; statusCode?: unknown; message?: unknown } | null;
  if (!body || typeof body !== 'object') return false;
  return (
    body.statusCode === '409' ||
    body.error === 'Duplicate' ||
    (typeof body.message === 'string' && /already exists/i.test(body.message))
  );
}

/** Uploads straight to a Storage bucket, as the signed-in person. */
export async function uploadToStorage(options: {
  bucket: string;
  path: string;
  file: Blob;
  upsert?: boolean;
  onProgress?: ((fraction: number) => void) | undefined;
}): Promise<void> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SendError('session', SEND_ERROR_MESSAGES.session);

  const encoded = options.path.split('/').map(encodeURIComponent).join('/');
  const result = await sendWithProgress({
    method: 'POST',
    url: `${supabaseUrl()}/storage/v1/object/${options.bucket}/${encoded}`,
    body: options.file,
    headers: {
      authorization: `Bearer ${token}`,
      apikey: supabasePublishableKey(),
      'x-upsert': options.upsert === true ? 'true' : 'false',
      'content-type': options.file.type || 'application/octet-stream',
    },
    onProgress: options.onProgress,
  });
  if (!options.upsert && isAlreadyThere(result)) return;
  const error = errorForAnswer(result);
  if (error) throw error;
}

/** Posts a form to one of the app's own upload routes. */
export async function postUpload<T>(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  const result = await sendWithProgress({ method: 'POST', url, body: form, onProgress });
  const error = errorForAnswer(result);
  if (error) throw error;
  return result.body as T;
}
