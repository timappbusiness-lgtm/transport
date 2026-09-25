import { assert, assertEquals } from "jsr:@std/assert@^1";
import { formatSender, isHardBounce, isPermanent, renderValues, sendEmail } from "./send.ts";

/**
 * No network anywhere here. The fetch is injected, and the only thing
 * being tested is the decision the dispatcher makes about a response:
 * try again, or stop and let somebody look at it.
 */

const CONFIG = { apiKey: "test-key", from: "Exemplu <nu-raspunde@exemplu.ro>" };

function respondWith(status: number): typeof fetch {
  return () => Promise.resolve(new Response(status === 200 ? "{}" : "", { status }));
}

Deno.test("a 200 is a sent e-mail", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(200) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, true);
});

Deno.test("a 500 is worth another four tries", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(500) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, false);
  assertEquals(result.permanent, false);
  assertEquals(result.error, "provider a răspuns 500");
});

Deno.test("a 422 is not", async () => {
  // A malformed address is malformed on every attempt; retrying only
  // delays the moment a person sees it on the admin screen.
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(422) },
    "nu-e-adresa", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.permanent, true);
});

Deno.test("429 is the one 4xx that means try again", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: respondWith(429) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.permanent, false);
});

Deno.test("isPermanent covers the range", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assertEquals(isPermanent(status), true, String(status));
  }
  for (const status of [429, 500, 502, 503, 504]) {
    assertEquals(isPermanent(status), false, String(status));
  }
});

Deno.test("a network error is always worth repeating", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: () => Promise.reject(new Error("ECONNRESET")) },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );
  assertEquals(result.ok, false);
  assertEquals(result.permanent, undefined);
  assert(result.error?.startsWith("rețea:"));
});

Deno.test("the request carries the sender and the recipient", async () => {
  let seen: RequestInit | undefined;
  await sendEmail(
    {
      ...CONFIG,
      fetchImpl: (_url, init) => {
        seen = init;
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
    },
    "cineva@example.ro", "Subiect", "<p>x</p>", "x",
  );

  const body = JSON.parse(String(seen?.body));
  assertEquals(body.from, CONFIG.from);
  assertEquals(body.to, ["cineva@example.ro"]);
  assertEquals(body.subject, "Subiect");
  // Both parts go, always: a text-only client should never get an empty
  // message.
  assertEquals(body.text, "x");
  assertEquals(body.html, "<p>x</p>");
});

Deno.test("the payload can override the site url, and usually does not", () => {
  assertEquals(renderValues({}, "https://exemplu.ro").site_url, "https://exemplu.ro");
  assertEquals(
    renderValues({ site_url: "https://altceva.ro" }, "https://exemplu.ro").site_url,
    "https://altceva.ro",
  );
  assertEquals(renderValues({ company_name: "X SRL" }, "https://exemplu.ro").company_name, "X SRL");
});

// ---------------------------------------------------------------------
// The sender, the reply-to and what the provider says back
// ---------------------------------------------------------------------

Deno.test("the display name is put in front of the address", () => {
  assertEquals(
    formatSender("nu-raspunde@exemplu.ro", "Exemplu"),
    '"Exemplu" <nu-raspunde@exemplu.ro>',
  );
});

Deno.test("no display name leaves the address alone", () => {
  assertEquals(formatSender("nu-raspunde@exemplu.ro", undefined), "nu-raspunde@exemplu.ro");
  assertEquals(formatSender("nu-raspunde@exemplu.ro", "   "), "nu-raspunde@exemplu.ro");
});

Deno.test("a quote in the name cannot break the header", () => {
  const sender = formatSender("a@b.ro", 'Exem"plu\\');
  assertEquals(sender, '"Exemplu" <a@b.ro>');
});

Deno.test("reply-to is sent when there is one, and left out when there is not", async () => {
  let body: Record<string, unknown> = {};
  const capture: typeof fetch = (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response('{"id":"abc"}', { status: 200 }));
  };

  await sendEmail(
    { ...CONFIG, replyTo: "contact@exemplu.ro", fetchImpl: capture },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assertEquals(body.reply_to, "contact@exemplu.ro");

  await sendEmail({ ...CONFIG, fetchImpl: capture }, "cineva@example.ro", "S", "<p>x</p>", "x");
  assertEquals("reply_to" in body, false);
});

Deno.test("the provider's id comes back with the success", async () => {
  const result = await sendEmail(
    {
      ...CONFIG,
      fetchImpl: () => Promise.resolve(new Response('{"id":"re_123"}', { status: 200 })),
    },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assertEquals(result.ok, true);
  assertEquals(result.providerId, "re_123");
});

Deno.test("a 200 whose body is not JSON is still a send", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: () => Promise.resolve(new Response("ok", { status: 200 })) },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assertEquals(result.ok, true);
  assertEquals(result.providerId, undefined);
});

Deno.test("a 422 about the address is a hard bounce, not a retry", async () => {
  const result = await sendEmail(
    {
      ...CONFIG,
      fetchImpl: () =>
        Promise.resolve(
          new Response('{"message":"Invalid `to` field: not a valid email"}', { status: 422 }),
        ),
    },
    "gresit@", "S", "<p>x</p>", "x",
  );
  assertEquals(result.ok, false);
  assertEquals(result.hardBounce, true);
  assertEquals(result.permanent, true);
});

Deno.test("a 403 is a suppressed address", () => {
  assertEquals(isHardBounce(403, ""), true);
});

Deno.test("a 422 about something else is not the address's fault", async () => {
  const result = await sendEmail(
    {
      ...CONFIG,
      fetchImpl: () =>
        Promise.resolve(new Response('{"message":"Subject is required"}', { status: 422 })),
    },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assertEquals(result.hardBounce, undefined);
  assertEquals(result.permanent, true);
});

Deno.test("a 429 is still worth waiting for, and never a bounce", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: () => Promise.resolve(new Response("slow down", { status: 429 })) },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assertEquals(result.permanent, false);
  assertEquals(result.hardBounce, undefined);
});

Deno.test("the provider's own words survive into the error", async () => {
  const result = await sendEmail(
    { ...CONFIG, fetchImpl: () => Promise.resolve(new Response("domain not verified", { status: 401 })) },
    "cineva@example.ro", "S", "<p>x</p>", "x",
  );
  assert(result.error?.includes("401"));
  assert(result.error?.includes("domain not verified"));
});
