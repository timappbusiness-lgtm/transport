import { assert, assertEquals } from "jsr:@std/assert@1";
import { BRAND_NAME } from "../_shared/brand.ts";
import {
  generateCode,
  hashCode,
  isPermanent,
  missingSecret,
  twilioProvider,
  verificationMessage,
} from "./provider.ts";

/**
 * The SMS adapter, with and without secrets.
 *
 * Nobody has seen an SMS from this platform, because no provider has
 * been chosen yet. These tests are what says the code is ready for one
 * — and, more importantly, that it refuses in a way somebody can act on
 * when there is none.
 */

Deno.test("with nothing set, it names the first secret to set", () => {
  assertEquals(missingSecret({}), "TWILIO_ACCOUNT_SID");
});

Deno.test("and then the next one, in the order somebody sets them", () => {
  assertEquals(missingSecret({ accountSid: "AC1" }), "TWILIO_AUTH_TOKEN");
  assertEquals(
    missingSecret({ accountSid: "AC1", authToken: "t" }),
    "TWILIO_FROM_NUMBER sau TWILIO_MESSAGING_SERVICE_SID",
  );
});

Deno.test("either a number or a messaging service is enough", () => {
  assertEquals(missingSecret({ accountSid: "AC1", authToken: "t", fromNumber: "+40700" }), null);
  assertEquals(
    missingSecret({ accountSid: "AC1", authToken: "t", messagingServiceSid: "MG1" }),
    null,
  );
});

Deno.test("a send carries the number, the message and the provider's id back", async () => {
  interface Seen {
    url: string;
    body: string;
    auth: string;
  }
  let seen: Seen | undefined;
  const provider = twilioProvider(
    { accountSid: "AC1", authToken: "secret", fromNumber: "+40700000000" },
    async (url, init) => {
      seen = {
        url: String(url),
        body: String(init?.body ?? ""),
        auth: String(new Headers(init?.headers).get("Authorization") ?? ""),
      };
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
    },
  );

  const result = await provider.send("+40722000000", "123456 este codul tău");
  assert(result.ok);
  assertEquals(result.providerId, "SM123");
  assert(seen !== undefined);
  const call: Seen = seen;
  assert(call.url.includes("/Accounts/AC1/Messages.json"));
  assert(call.body.includes("To=%2B40722000000"));
  assert(call.body.includes("From=%2B40700000000"));
  // The token never reaches a log or a URL; it is in the header, encoded.
  assertEquals(call.auth, `Basic ${btoa("AC1:secret")}`);
});

Deno.test("a messaging service replaces the From number", async () => {
  let body = "";
  const provider = twilioProvider(
    { accountSid: "AC1", authToken: "t", messagingServiceSid: "MG9" },
    async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
    },
  );
  await provider.send("+40722000000", "x");
  assert(body.includes("MessagingServiceSid=MG9"));
  assert(!body.includes("From="));
});

Deno.test("a bad number is permanent, a bad minute is not", async () => {
  const make = (status: number) =>
    twilioProvider(
      { accountSid: "AC1", authToken: "t", fromNumber: "+40700000000" },
      async () => new Response("{\"message\":\"nope\"}", { status }),
    );

  const bad = await make(400).send("+40722000000", "x");
  assertEquals(bad.ok, false);
  assertEquals(bad.permanent, true);

  const outage = await make(503).send("+40722000000", "x");
  assertEquals(outage.ok, false);
  assertEquals(outage.permanent, false);

  // „Not now" is exactly what a retry is for.
  const throttled = await make(429).send("+40722000000", "x");
  assertEquals(throttled.permanent, false);
});

Deno.test("a network error is worth repeating", async () => {
  const provider = twilioProvider(
    { accountSid: "AC1", authToken: "t", fromNumber: "+40700000000" },
    () => Promise.reject(new Error("ECONNRESET")),
  );
  const result = await provider.send("+40722000000", "x");
  assertEquals(result.ok, false);
  assertEquals(result.permanent, undefined);
  assert(result.error!.includes("ECONNRESET"));
});

Deno.test("a 2xx whose body we cannot read is still a send", async () => {
  const provider = twilioProvider(
    { accountSid: "AC1", authToken: "t", fromNumber: "+40700000000" },
    async () => new Response("<html>", { status: 200 }),
  );
  const result = await provider.send("+40722000000", "x");
  assert(result.ok);
  assertEquals(result.providerId, undefined);
});

Deno.test("isPermanent knows which side of the line a status is on", () => {
  assertEquals(isPermanent(400), true);
  assertEquals(isPermanent(404), true);
  assertEquals(isPermanent(429), false);
  assertEquals(isPermanent(500), false);
  assertEquals(isPermanent(200), false);
});

Deno.test("the code is six digits, leading zeros kept", () => {
  // A five-digit code is a bug report from somebody who typed what they
  // were sent, so the padding is pinned rather than assumed.
  assertEquals(generateCode(() => new Uint8Array([0, 0, 0, 7])), "000007");
  assertEquals(generateCode(() => new Uint8Array([255, 255, 255, 255])), "967295");

  for (let i = 0; i < 200; i += 1) {
    const code = generateCode();
    assertEquals(code.length, 6);
    assert(/^\d{6}$/.test(code));
  }
});

Deno.test("the message says what it is, how long it lasts and not to share it", () => {
  const message = verificationMessage("123456", "Exemplu");
  assert(message.startsWith("123456"));
  assert(message.includes("Exemplu"));
  assert(message.includes("10 minute"));
  assert(message.includes("Nu îl da nimănui"));
});

Deno.test("with the platform's real name it is one SMS, not two", () => {
  // ă, î, ș and ț are not in the GSM 7-bit alphabet, so the message goes
  // as UCS-2, whose single segment is 70 characters, not 160. The old
  // text was 77 with the new name: two SMS, twice the price, every time.
  const message = verificationMessage("123456", BRAND_NAME);
  assert(/[ăâîșț]/.test(message), "the Unicode limit applies");
  assert(message.length <= 70, `${message.length} de caractere`);
});

Deno.test("the hash is what the database stores, and the code is not in it", async () => {
  const hash = await hashCode("123456");
  assertEquals(hash.length, 64);
  assert(/^[0-9a-f]{64}$/.test(hash));
  assert(!hash.includes("123456"));
  // Whitespace around what somebody pasted does not change the code.
  assertEquals(await hashCode(" 123456 "), hash);
  assert((await hashCode("123457")) !== hash);
});
