import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  audienceOf,
  backoffSeconds,
  classify,
  encrypt,
  fromBase64Url,
  safeError,
  toBase64Url,
  vapidHeaders,
} from './webpush.ts';

// =====================================================================
// The parts of Web Push that can be wrong without anybody noticing.
//
// A push that fails loudly gets fixed. The ones that matter here are the
// quiet failures: a status code read as "this browser is gone" when it
// means "try again in a minute", and an endpoint copied into a log line.
// =====================================================================

Deno.test('base64url survives a round trip', () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  assertEquals(fromBase64Url(toBase64Url(bytes)), bytes);
});

Deno.test('base64url writes no padding and no + or /', () => {
  const bytes = new Uint8Array([251, 255, 190, 255]);
  const encoded = toBase64Url(bytes);
  assertEquals(encoded.includes('='), false);
  assertEquals(encoded.includes('+'), false);
  assertEquals(encoded.includes('/'), false);
});

Deno.test('the VAPID audience is the origin, not the endpoint', () => {
  // A token audienced at the full URL is rejected, and the rejection says
  // "unauthorized", which sends you looking at the keys.
  assertEquals(
    audienceOf('https://fcm.googleapis.com/fcm/send/abc123'),
    'https://fcm.googleapis.com',
  );
});

Deno.test('only 404 and 410 mean the browser is gone', () => {
  assertEquals(classify(201), 'sent');
  assertEquals(classify(200), 'sent');
  assertEquals(classify(404), 'gone');
  assertEquals(classify(410), 'gone');
  // Disabling on these would silently unsubscribe people during an outage.
  assertEquals(classify(500), 'retry');
  assertEquals(classify(503), 'retry');
  assertEquals(classify(429), 'retry');
  // A bad request is this message's fault and will not fix itself.
  assertEquals(classify(400), 'failed');
  assertEquals(classify(401), 'failed');
});

Deno.test('backoff grows and then stops growing', () => {
  assertEquals(backoffSeconds(1), 60);
  assertEquals(backoffSeconds(2), 120);
  assertEquals(backoffSeconds(3), 240);
  // A push service that is down stays down for minutes; hammering it is
  // how a sender gets rate-limited on top of being broken.
  assertEquals(backoffSeconds(20), 3600);
});

Deno.test('an error line never carries the endpoint', () => {
  // The endpoint is the credential that lets anybody send to that browser.
  const line = safeError(410, 'push service said https://fcm.googleapis.com/fcm/send/SECRET is gone');
  assertEquals(line.includes('SECRET'), false);
  assertStringIncludes(line, '[endpoint]');
});

Deno.test('an error line is bounded', () => {
  assertEquals(safeError(500, 'x'.repeat(500)).length <= 200, true);
});

Deno.test('the VAPID header carries a token and the public key', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));

  const headers = await vapidHeaders('https://fcm.googleapis.com/fcm/send/abc', {
    publicKey: toBase64Url(raw),
    privateKey: jwk.d!,
    subject: 'mailto:contact@exemplu.ro',
  });

  assertStringIncludes(headers.Authorization, 'vapid t=');
  assertStringIncludes(headers.Authorization, ', k=');

  const token = headers.Authorization.split('t=')[1].split(',')[0];
  const [, claims] = token.split('.');
  const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(claims)));
  assertEquals(parsed.aud, 'https://fcm.googleapis.com');
  assertEquals(parsed.sub, 'mailto:contact@exemplu.ro');
});

Deno.test('the VAPID token expires within a day', async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));

  const now = 1_800_000_000;
  const headers = await vapidHeaders(
    'https://push.example/x',
    { publicKey: toBase64Url(raw), privateKey: jwk.d!, subject: 'mailto:a@b.ro' },
    now,
  );
  const token = headers.Authorization.split('t=')[1].split(',')[0];
  const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[1])));

  // The specification allows 24 hours; half of that means a token copied
  // out of a log is useless by the time anybody reads the log.
  assertEquals(claims.exp - now <= 24 * 60 * 60, true);
  assertEquals(claims.exp > now, true);
});

Deno.test('the encrypted body has the aes128gcm header the browser expects', async () => {
  const client = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const clientPublic = new Uint8Array(await crypto.subtle.exportKey('raw', client.publicKey));

  const salt = new Uint8Array(16).fill(7);
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );

  const body = await encrypt(
    JSON.stringify({ title: 'Cerere nouă' }),
    {
      endpoint: 'https://push.example/x',
      p256dh: toBase64Url(clientPublic),
      auth: toBase64Url(new Uint8Array(16).fill(3)),
    },
    salt,
    ephemeral,
  );

  // salt(16) + record size(4) + key length(1) + public key(65) + body.
  assertEquals(body.slice(0, 16), salt);
  assertEquals(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), 4096);
  assertEquals(body[20], 65);
  assertEquals(body.length > 86, true);
});

Deno.test('a fresh salt produces a different body every time', async () => {
  // Reusing a salt or an ephemeral key would let somebody who captured two
  // messages recover the plaintext of both.
  const client = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const clientPublic = new Uint8Array(await crypto.subtle.exportKey('raw', client.publicKey));
  const subscription = {
    endpoint: 'https://push.example/x',
    p256dh: toBase64Url(clientPublic),
    auth: toBase64Url(new Uint8Array(16).fill(3)),
  };

  const one = await encrypt(
    'same',
    subscription,
    crypto.getRandomValues(new Uint8Array(16)),
    await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
  );
  const two = await encrypt(
    'same',
    subscription,
    crypto.getRandomValues(new Uint8Array(16)),
    await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
  );

  assertEquals(toBase64Url(one) === toBase64Url(two), false);
});
