// =====================================================================
// The Web Push protocol, with Web Crypto and nothing else
//
// Two specifications and no library. `npm:web-push` is written for Node's
// crypto module and only half works under the edge runtime; the parts we
// need are small enough that depending on a partially-supported package is
// the larger risk.
//
//   RFC 8291 — the payload, encrypted to the browser's public key
//   RFC 8292 — VAPID, the signed claim that identifies the sender
//
// Everything here is pure except `encrypt`, which needs a random salt and
// an ephemeral key pair, so it takes both as arguments in the test.
// =====================================================================

/**
 * A byte array backed by a real `ArrayBuffer`.
 *
 * TypeScript 5.7 made `Uint8Array` generic over its buffer, and Web
 * Crypto's `BufferSource` only accepts the `ArrayBuffer` form — a bare
 * `Uint8Array` widens to `ArrayBufferLike`, which includes
 * `SharedArrayBuffer` and is rejected. Naming it once keeps the casts out
 * of the code below.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** base64url, which is what every key and header in these two RFCs uses. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Bytes {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The `aud` of a VAPID token is the push service's origin, not the URL. */
export function audienceOf(endpoint: string): string {
  return new URL(endpoint).origin;
}

/**
 * How long to wait before trying this delivery again.
 *
 * Exponential with a ceiling, because a push service that is down stays
 * down for minutes and hammering it is how a sender gets rate-limited on
 * top of being broken.
 */
export function backoffSeconds(attempt: number): number {
  return Math.min(60 * 2 ** Math.max(0, attempt - 1), 3600);
}

export type DeliveryOutcome = 'sent' | 'retry' | 'gone' | 'failed';

/**
 * What a push service's status code means for the subscription.
 *
 * 404 and 410 are the only ones that say "this browser is gone" — the
 * person cleared their site data, or uninstalled, or the subscription
 * expired. Everything else is about this attempt, not about the row, and
 * disabling on a 500 would silently unsubscribe people during an outage.
 */
export function classify(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

/**
 * The error line stored against a subscription.
 *
 * Truncated, and with anything that looks like an endpoint removed: the
 * endpoint is the credential that lets somebody send to that browser, and
 * a log line is the easiest place for one to end up somewhere it should
 * not be.
 */
export function safeError(status: number, body: string): string {
  const withoutUrls = body.replace(/https?:\/\/\S+/g, '[endpoint]');
  return `${status} ${withoutUrls}`.slice(0, 200).trim();
}

/** The signed JWT that says who is sending, per RFC 8292. */
export async function vapidHeaders(
  endpoint: string,
  keys: VapidKeys,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: audienceOf(endpoint),
    // Twelve hours. The specification allows 24; half of it means a token
    // copied out of a log is useless by the time anybody reads the log.
    exp: nowSeconds + 12 * 60 * 60,
    sub: keys.subject,
  };

  const encoder = new TextEncoder();
  const unsigned = `${toBase64Url(encoder.encode(JSON.stringify(header)))}.${toBase64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: toBase64Url(fromBase64Url(keys.publicKey).slice(1, 33)),
      y: toBase64Url(fromBase64Url(keys.publicKey).slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(unsigned) as Bytes,
  );

  return {
    Authorization: `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`,
  };
}

function concat(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The encrypted body, per RFC 8291 (`aes128gcm`).
 *
 * The salt and the ephemeral key pair are arguments rather than generated
 * inside, so a test can pin the output against a known vector. In
 * production `sendPush` generates both fresh for every message, which the
 * specification requires: reusing either would let somebody who captured
 * two messages recover the plaintext of both.
 */
export async function encrypt(
  payload: string,
  subscription: PushSubscription,
  salt: Bytes,
  ephemeral: CryptoKeyPair,
): Promise<Bytes> {
  const encoder = new TextEncoder();
  const utf8 = (text: string): Bytes => encoder.encode(text) as Bytes;

  const clientPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);

  const serverPublicRaw: Bytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey),
  );

  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const shared: Bytes = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientKey },
      ephemeral.privateKey,
      256,
    ),
  );

  // The key-derivation info strings are fixed by the specification; the
  // order of the two public keys in `keyInfo` is client then server, and
  // getting it round the wrong way produces a message the browser
  // silently drops.
  const keyInfo = concat(utf8('WebPush: info\0'), clientPublic, serverPublicRaw);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const contentEncryptionKey = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, [
    'encrypt',
  ]);

  // A single record, so the padding delimiter is 0x02 rather than 0x01.
  const plaintext = concat(utf8(payload), new Uint8Array([0x02]));
  const ciphertext: Bytes = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(
    salt,
    recordSize,
    new Uint8Array([serverPublicRaw.length]),
    serverPublicRaw,
    ciphertext,
  );
}

export interface SendResult {
  status: number;
  outcome: DeliveryOutcome;
  error: string | null;
}

/** One delivery. Never throws: a failure is a result, not an exception. */
export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  keys: VapidKeys,
  ttlSeconds = 24 * 60 * 60,
): Promise<SendResult> {
  try {
    const salt: Bytes = crypto.getRandomValues(new Uint8Array(16));
    const ephemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );

    const body = await encrypt(payload, subscription, salt, ephemeral);
    const headers = await vapidHeaders(subscription.endpoint, keys);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'normal',
      },
      body,
    });

    const outcome = classify(response.status);
    if (outcome === 'sent') return { status: response.status, outcome, error: null };

    const text = await response.text().catch(() => '');
    return { status: response.status, outcome, error: safeError(response.status, text) };
  } catch (error) {
    // A transport failure is worth retrying; a programming error is not,
    // but the two are indistinguishable from here and a retry costs less
    // than a dropped notification.
    return {
      status: 0,
      outcome: 'retry',
      error: safeError(0, error instanceof Error ? error.message : 'unknown'),
    };
  }
}
